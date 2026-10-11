import { z } from "zod";
import { API_ERROR_CODES } from "@/lib/api-errors";
import { stepSchemas, type StepId } from "@/features/onboarding/schema";

/**
 * The analytics allowlist (spec §10). An event or property that is not declared here
 * cannot be sent: the client drops it and the server rejects it.
 *
 * NEVER add: photo bytes, filenames, image metadata or hashes, face descriptions,
 * survey answer values (goals, focus areas, preferences, notes), email addresses,
 * report contents, or free text of any kind.
 */

const stepId = z.enum(Object.keys(stepSchemas) as [StepId, ...StepId[]]);

export const PAGE_IDS = [
  "landing",
  "start",
  "onboarding",
  "checkout",
  "processing",
  "result",
  "help",
  "privacy",
  "terms",
  "refunds",
  "sample",
  "recover",
  "other",
] as const;

export const CTA_IDS = [
  "hero_start",
  "footer_start",
  "sample_report",
  "continue_to_checkout",
  "pay",
  "reselect_photos",
  "download_pdf",
  "clear_results",
  "contact_support",
] as const;

const PHOTO_REJECTION_REASONS = [
  "UNSUPPORTED_IMAGE_TYPE",
  "PHOTO_TOO_LARGE",
  "PHOTO_UNREADABLE",
  "PHOTO_DIMENSIONS_UNSAFE",
  "PHOTO_QUALITY_INSUFFICIENT",
  "too_small",
  "too_dark",
  "too_bright",
  "low_contrast",
  "blurry",
  "landscape",
] as const;

const empty = z.object({}).strict();

/** Events the browser may send. */
export const clientEventSchemas = {
  page_view: z.object({ page: z.enum(PAGE_IDS) }).strict(),
  landing_view: empty,
  cta_clicked: z.object({ cta: z.enum(CTA_IDS) }).strict(),
  onboarding_start: empty,
  onboarding_step_viewed: z.object({ step: stepId }).strict(),
  onboarding_step_completed: z.object({ step: stepId, skipped: z.boolean().optional() }).strict(),
  onboarding_step_back: z.object({ step: stepId }).strict(),
  age_gate_refused: empty,
  photo_ready: z.object({ ready: z.boolean(), profiles: z.number().int().min(0).max(2) }).strict(),
  photo_rejected: z.object({ reason: z.enum(PHOTO_REJECTION_REASONS) }).strict(),
  photos_cleared_by_reload: empty,
  checkout_started: empty,
  checkout_failed: z.object({ code: z.enum(API_ERROR_CODES) }).strict(),
  payment_confirmed: empty,
  reselect_requested: empty,
  result_viewed: empty,
  report_downloaded: empty,
  results_cleared: empty,
  refund_requested: empty,
  consent_withdrawn: empty,
  consent_updated: z.object({ analytics: z.boolean(), marketing: z.boolean() }).strict(),
  client_error: z.object({ code: z.enum(API_ERROR_CODES) }).strict(),
  web_vital: z
    .object({
      metric: z.enum(["LCP", "INP", "CLS", "FCP", "TTFB"]),
      value: z.number().finite().min(0).max(600_000),
      rating: z.enum(["good", "needs-improvement", "poor"]),
    })
    .strict(),
} as const;

/** Authoritative events emitted by the server only. */
export const serverEventSchemas = {
  payment_succeeded: empty,
  fulfillment_started: empty,
  fulfillment_failed: z.object({ code: z.enum(API_ERROR_CODES) }).strict(),
  email_provider_accepted: empty,
  image_qc_failed: empty,
  refund_completed: empty,
} as const;

export type ClientEventName = keyof typeof clientEventSchemas;
export type ServerEventName = keyof typeof serverEventSchemas;
export type ClientEventProps<N extends ClientEventName> = z.infer<(typeof clientEventSchemas)[N]>;
export type ServerEventProps<N extends ServerEventName> = z.infer<(typeof serverEventSchemas)[N]>;

export const COHORTS = ["BR", "US", "CA", "GB", "AU", "OTHER"] as const;
export type Cohort = (typeof COHORTS)[number];

const utmValue = z
  .string()
  .max(100)
  .regex(/^[\w\-. +%|:/]*$/u)
  .refine((value) => !value.includes("@"), "UTM values may not contain email addresses");

export const attributionSchema = z
  .object({
    utmSource: utmValue.optional(),
    utmMedium: utmValue.optional(),
    utmCampaign: utmValue.optional(),
    utmContent: utmValue.optional(),
    utmTerm: utmValue.optional(),
    /** Only whether an ad click id was present; the id itself never goes to analytics. */
    adClick: z.enum(["meta", "google", "tiktok"]).optional(),
    referrerDomain: z
      .string()
      .max(100)
      .regex(/^[a-z0-9.-]+$/)
      .optional(),
  })
  .strict();

export type Attribution = z.infer<typeof attributionSchema>;

export const contextSchema = z
  .object({
    /** Random per-visit id. Kept in memory only, or in sessionStorage with analytics consent. */
    sid: z.string().regex(/^[A-Za-z0-9_-]{16,64}$/),
    path: z
      .string()
      .max(80)
      .regex(/^\/[a-z0-9\-/]*$/),
    attribution: attributionSchema,
    regionHint: z
      .string()
      .regex(/^[A-Z]{2}$/)
      .optional(),
    consent: z.object({ analytics: z.boolean(), marketing: z.boolean() }).strict(),
  })
  .strict();

export type AnalyticsContext = z.infer<typeof contextSchema>;

export const MAX_EVENTS_PER_BATCH = 25;

const rawBatchSchema = z
  .object({
    context: contextSchema,
    events: z
      .array(
        z
          .object({
            name: z.enum(Object.keys(clientEventSchemas) as [ClientEventName, ...ClientEventName[]]),
            props: z.record(z.string(), z.unknown()),
            ts: z.number().int().positive(),
          })
          .strict(),
      )
      .min(1)
      .max(MAX_EVENTS_PER_BATCH),
  })
  .strict();

export type ClientEvent = { name: ClientEventName; props: Record<string, unknown>; ts: number };
export type EventBatch = { context: AnalyticsContext; events: ClientEvent[] };

/** Validates the envelope, then each event's props against its own schema. All or nothing. */
export function parseEventBatch(raw: unknown): EventBatch | undefined {
  const parsed = rawBatchSchema.safeParse(raw);
  if (!parsed.success) return undefined;
  const events: ClientEvent[] = [];
  for (const event of parsed.data.events) {
    const props = clientEventSchemas[event.name].safeParse(event.props);
    if (!props.success) return undefined;
    events.push({ name: event.name, props: props.data as Record<string, unknown>, ts: event.ts });
  }
  return { context: parsed.data.context, events };
}

export function validateClientEvent<N extends ClientEventName>(name: N, props: unknown): props is ClientEventProps<N> {
  return clientEventSchemas[name].safeParse(props).success;
}

export function cohortFor(country: string | undefined): Cohort {
  return country && (COHORTS as readonly string[]).includes(country) ? (country as Cohort) : "OTHER";
}
