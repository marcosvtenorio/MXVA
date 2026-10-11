import "server-only";
import { createHash, createHmac } from "node:crypto";
import { isProductionBuild, publicConfig } from "@/lib/config";
import {
  cohortFor,
  serverEventSchemas,
  type EventBatch,
  type ServerEventName,
  type ServerEventProps,
} from "@/features/analytics/events";
import { cookieSigningSecret, serverEnv } from "../config";

/**
 * Fans allowlisted events out to the configured sinks:
 *  - console (development only)
 *  - PostHog (product analytics, anonymous "personless" events, GeoIP off)
 *  - Meta Conversions API (ads measurement, marketing consent only, a few standard events)
 * Sinks never receive photos, answers, email addresses or report contents.
 */

export type RequestFacts = {
  ip: string;
  userAgent: string;
  fbp?: string;
  fbc?: string;
  /** Hashed (SHA-256) buyer email, only for Purchase with marketing consent and opt-in config. */
  emailSha256?: string;
};

export function deviceClass(userAgent: string): "phone" | "tablet" | "desktop" {
  if (/iPad|Tablet|Nexus 7|Nexus 10|SM-T/i.test(userAgent)) return "tablet";
  if (/Mobi|iPhone|Android/i.test(userAgent)) return "phone";
  return "desktop";
}

/** Social in-app browsers matter here: most traffic arrives from Instagram. */
export function inAppBrowser(userAgent: string): "instagram" | "facebook" | "tiktok" | "threads" | "none" {
  if (/Instagram/i.test(userAgent)) return "instagram";
  if (/Barcelona/i.test(userAgent)) return "threads";
  if (/FBAN|FBAV|FB_IAB/i.test(userAgent)) return "facebook";
  if (/BytedanceWebview|musical_ly|TikTok/i.test(userAgent)) return "tiktok";
  return "none";
}

type OutboundEvent = {
  name: string;
  distinctId: string;
  timestamp: Date;
  properties: Record<string, string | number | boolean | undefined>;
};

function clampTimestamp(ts: number): Date {
  const now = Date.now();
  return new Date(Math.min(now, Math.max(now - 24 * 60 * 60_000, ts)));
}

// ─── Sinks ───

async function toPostHog(events: OutboundEvent[]): Promise<void> {
  const env = serverEnv();
  if (!env.POSTHOG_PROJECT_API_KEY || events.length === 0) return;
  const host = (env.POSTHOG_HOST ?? "https://eu.i.posthog.com").replace(/\/+$/, "");
  const response = await fetch(`${host}/batch/`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    signal: AbortSignal.timeout(5000),
    body: JSON.stringify({
      api_key: env.POSTHOG_PROJECT_API_KEY,
      batch: events.map((event) => ({
        event: event.name,
        distinct_id: event.distinctId,
        timestamp: event.timestamp.toISOString(),
        properties: {
          ...event.properties,
          distinct_id: event.distinctId,
          $process_person_profile: false,
          $geoip_disable: true,
          $lib: "mxva-server",
        },
      })),
    }),
  });
  if (!response.ok) console.warn(`[analytics] posthog responded ${response.status}`);
}

const META_EVENT_MAP: Partial<Record<string, string>> = {
  landing_view: "ViewContent",
  onboarding_start: "Lead",
  checkout_started: "InitiateCheckout",
  payment_confirmed: "Purchase",
};

export type MetaEvent = {
  eventName: string;
  eventId: string;
  eventTime: Date;
  sourceUrl: string;
  facts: RequestFacts;
  value?: { amount: number; currency: string };
};

export function metaConfigured(): boolean {
  const env = serverEnv();
  return Boolean(env.META_PIXEL_ID && env.META_CAPI_ACCESS_TOKEN);
}

async function toMeta(events: MetaEvent[]): Promise<void> {
  const env = serverEnv();
  if (!env.META_PIXEL_ID || !env.META_CAPI_ACCESS_TOKEN || events.length === 0) return;
  const url = `https://graph.facebook.com/${env.META_GRAPH_API_VERSION}/${env.META_PIXEL_ID}/events`;
  const body = {
    data: events.map((event) => ({
      event_name: event.eventName,
      event_time: Math.floor(event.eventTime.getTime() / 1000),
      event_id: event.eventId,
      action_source: "website",
      event_source_url: event.sourceUrl,
      user_data: {
        client_ip_address: event.facts.ip !== "unknown" ? event.facts.ip : undefined,
        client_user_agent: event.facts.userAgent || undefined,
        fbp: event.facts.fbp,
        fbc: event.facts.fbc,
        em: event.facts.emailSha256 ? [event.facts.emailSha256] : undefined,
      },
      custom_data: event.value ? { value: event.value.amount, currency: event.value.currency.toUpperCase() } : undefined,
    })),
    ...(env.META_TEST_EVENT_CODE ? { test_event_code: env.META_TEST_EVENT_CODE } : {}),
    // In the body, not the URL, so the token never lands in access logs.
    access_token: env.META_CAPI_ACCESS_TOKEN,
  };
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    signal: AbortSignal.timeout(5000),
    body: JSON.stringify(body),
  });
  if (!response.ok) console.warn(`[analytics] meta capi responded ${response.status}`);
}

function toConsole(events: OutboundEvent[]): void {
  if (isProductionBuild) return;
  for (const event of events) console.info(`[analytics] ${event.name}`, JSON.stringify(event.properties));
}

async function settle(work: Promise<void>[]): Promise<void> {
  // Analytics never breaks the product: failures are logged by class only.
  const results = await Promise.allSettled(work);
  for (const result of results) {
    if (result.status === "rejected") {
      const name = result.reason instanceof Error ? result.reason.name : "unknown";
      console.warn(`[analytics] sink failed: ${name}`);
    }
  }
}

// ─── Entry points ───

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/** Client batch (already validated) + server-side request facts. */
export async function dispatchClientBatch(
  batch: EventBatch,
  facts: RequestFacts,
  extraMeta: MetaEvent[] = [],
): Promise<void> {
  const device = deviceClass(facts.userAgent);
  const inApp = inAppBrowser(facts.userAgent);
  const { context } = batch;
  const outbound: OutboundEvent[] = batch.events.map((event) => ({
    name: event.name,
    distinctId: context.sid,
    timestamp: clampTimestamp(event.ts),
    properties: {
      ...(event.props as Record<string, string | number | boolean>),
      path: context.path,
      region: context.regionHint,
      cohort: cohortFor(context.regionHint),
      device,
      in_app_browser: inApp,
      utm_source: context.attribution.utmSource,
      utm_medium: context.attribution.utmMedium,
      utm_campaign: context.attribution.utmCampaign,
      utm_content: context.attribution.utmContent,
      utm_term: context.attribution.utmTerm,
      ad_click: context.attribution.adClick,
      referrer_domain: context.attribution.referrerDomain,
      consent_analytics: context.consent.analytics,
      consent_marketing: context.consent.marketing,
    },
  }));

  const meta: MetaEvent[] = [...extraMeta];
  if (context.consent.marketing && metaConfigured()) {
    for (const event of batch.events) {
      const eventName = META_EVENT_MAP[event.name];
      if (!eventName || eventName === "Purchase") continue; // Purchase is verified server-side (extraMeta)
      meta.push({
        eventName,
        eventId: `${event.name}_${context.sid}_${event.ts}`,
        eventTime: clampTimestamp(event.ts),
        sourceUrl: `${publicConfig.appUrl}${context.path}`,
        facts: { ...facts, emailSha256: undefined },
      });
    }
  }

  toConsole(outbound);
  await settle([toPostHog(outbound), toMeta(meta)]);
}

/** Pseudonymous id for server-side events about an order (not joinable with browser ids). */
export function orderAnalyticsId(orderId: string): string {
  return `order_${createHmac("sha256", cookieSigningSecret()).update(orderId).digest("hex").slice(0, 32)}`;
}

/** Authoritative server events (payments, fulfilment). Never carries personal data. */
export async function trackServer<N extends ServerEventName>(
  name: N,
  props: ServerEventProps<N>,
  orderId: string,
  countryHint: string | null,
): Promise<void> {
  const parsed = serverEventSchemas[name].safeParse(props);
  if (!parsed.success) return;
  const outbound: OutboundEvent[] = [
    {
      name,
      distinctId: orderAnalyticsId(orderId),
      timestamp: new Date(),
      properties: {
        ...(parsed.data as Record<string, string>),
        source: "server",
        region: countryHint ?? undefined,
        cohort: cohortFor(countryHint ?? undefined),
      },
    },
  ];
  toConsole(outbound);
  await settle([toPostHog(outbound)]);
}

/** Purchase for Meta, sent only after the server has confirmed the order is paid. */
export function purchaseMetaEvent(
  order: { id: string; amountMinor: number; currency: string; paidAt: string | null },
  facts: RequestFacts,
): MetaEvent {
  return {
    eventName: "Purchase",
    // Stable per order: Meta de-duplicates repeats (and a future browser Pixel) on this id.
    eventId: `purchase_${orderAnalyticsId(order.id)}`,
    eventTime: order.paidAt ? new Date(order.paidAt) : new Date(),
    sourceUrl: `${publicConfig.appUrl}/processing`,
    facts,
    value: { amount: order.amountMinor / 100, currency: order.currency },
  };
}
