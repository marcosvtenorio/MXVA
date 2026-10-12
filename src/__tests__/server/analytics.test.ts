import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { dispatchClientBatch, deviceClass, inAppBrowser, purchaseMetaEvent } from "@/server/analytics";
import { resetServerEnvCache } from "@/server/config";
import type { EventBatch } from "@/features/analytics/events";

const IG_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 400.0.0.0";

function batch(marketing: boolean): EventBatch {
  return {
    context: {
      sid: "b".repeat(32),
      path: "/checkout",
      attribution: { utmSource: "instagram", adClick: "meta" },
      regionHint: "BR",
      consent: { analytics: false, marketing },
    },
    events: [
      { name: "checkout_started", props: { method: "card" }, ts: Date.now() },
      { name: "onboarding_step_completed", props: { step: "review" }, ts: Date.now() },
    ],
  };
}

describe("server analytics dispatch", () => {
  const calls: { url: string; body: Record<string, unknown> }[] = [];

  beforeEach(() => {
    calls.length = 0;
    vi.stubEnv("POSTHOG_PROJECT_API_KEY", "phc_test");
    vi.stubEnv("POSTHOG_HOST", "https://eu.i.posthog.com");
    vi.stubEnv("META_PIXEL_ID", "123456789012345");
    vi.stubEnv("META_CAPI_ACCESS_TOKEN", "meta-token");
    resetServerEnvCache();
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: RequestInit) => {
        calls.push({ url, body: JSON.parse(String(init.body)) });
        return new Response("{}", { status: 200 });
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    resetServerEnvCache();
  });

  it("sends anonymous, GeoIP-free events to PostHog with campaign and cohort context", async () => {
    await dispatchClientBatch(batch(false), { ip: "203.0.113.9", userAgent: IG_UA });
    const posthog = calls.find((call) => call.url === "https://eu.i.posthog.com/batch/");
    expect(posthog).toBeDefined();
    const events = posthog!.body.batch as { event: string; properties: Record<string, unknown> }[];
    expect(events.map((event) => event.event)).toEqual(["checkout_started", "onboarding_step_completed"]);
    expect(events[0]!.properties).toMatchObject({
      $process_person_profile: false,
      $geoip_disable: true,
      cohort: "BR",
      utm_source: "instagram",
      in_app_browser: "instagram",
      device: "phone",
    });
    expect(JSON.stringify(posthog!.body)).not.toContain("203.0.113.9");
  });

  it("calls Meta only with marketing consent, with the token in the body", async () => {
    await dispatchClientBatch(batch(false), { ip: "203.0.113.9", userAgent: IG_UA });
    expect(calls.some((call) => call.url.includes("graph.facebook.com"))).toBe(false);

    calls.length = 0;
    await dispatchClientBatch(batch(true), { ip: "203.0.113.9", userAgent: IG_UA, fbc: "fb.1.1.abc", fbp: "fb.1.1.123" });
    const meta = calls.find((call) => call.url.includes("graph.facebook.com"));
    expect(meta?.url).toBe("https://graph.facebook.com/v26.0/123456789012345/events");
    expect(meta?.url).not.toContain("meta-token");
    expect(meta?.body.access_token).toBe("meta-token");
    const data = meta!.body.data as { event_name: string; user_data: Record<string, unknown> }[];
    expect(data.map((event) => event.event_name)).toEqual(["InitiateCheckout"]);
    expect(data[0]!.user_data).toMatchObject({ fbc: "fb.1.1.abc", fbp: "fb.1.1.123", client_ip_address: "203.0.113.9" });
  });

  it("builds a de-duplicable Purchase with the server-side price", () => {
    const event = purchaseMetaEvent(
      { id: "7a1d3f0e-1b2c-4d5e-8f90-123456789abc", amountMinor: 2900, currency: "usd", paidAt: "2026-10-11T12:00:00Z" },
      { ip: "1.1.1.1", userAgent: "x" },
    );
    expect(event.eventName).toBe("Purchase");
    expect(event.value).toEqual({ amount: 29, currency: "usd" });
    expect(event.eventId).toMatch(/^purchase_order_[a-f0-9]{32}$/);
    expect(event.eventId).not.toContain("7a1d3f0e");
  });

  it("classifies devices and in-app browsers", () => {
    expect(deviceClass(IG_UA)).toBe("phone");
    expect(inAppBrowser(IG_UA)).toBe("instagram");
    expect(inAppBrowser("Mozilla/5.0 (Linux; Android 15) [FBAN/EMA;FBAV/450.0]")).toBe("facebook");
    expect(deviceClass("Mozilla/5.0 (Macintosh; Intel Mac OS X 15_0)")).toBe("desktop");
  });
});
