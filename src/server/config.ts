import "server-only";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { devPreviewEnabled, isProductionBuild, publicConfig } from "@/lib/config";

/** Thrown when a feature is switched on without the configuration it needs. Fails closed. */
export class ConfigError extends Error {
  override readonly name = "ConfigError";
}

const optionalSecret = z
  .string()
  .trim()
  .optional()
  .transform((value) => (value ? value : undefined));

const serverEnvSchema = z.object({
  PRICE_USD_CENTS: z.coerce.number().int().min(100).max(100_000).default(2900),
  PRICE_VARIANT: z
    .string()
    .regex(/^[a-z0-9_]{1,32}$/)
    .default("usd_29"),
  /** PIX price in centavos (Brazil). Card payments use PRICE_USD_CENTS. */
  PRICE_BRL_CENTS: z.coerce.number().int().min(500).max(1_000_000).default(4799),
  ABACATEPAY_API_KEY: optionalSecret,
  /** Set when ABACATEPAY_API_KEY is a Dev Mode key: no real money moves, payments are simulated. */
  ABACATEPAY_SANDBOX: z
    .enum(["true", "false"])
    .default("true")
    .transform((value) => value === "true"),
  /** Our secret, sent by AbacatePay as ?webhookSecret= on every webhook call. */
  ABACATEPAY_WEBHOOK_SECRET: optionalSecret,
  /** Optional: AbacatePay's key for the X-Webhook-Signature HMAC. */
  ABACATEPAY_PUBLIC_KEY: optionalSecret,
  STRIPE_SECRET_KEY: optionalSecret,
  STRIPE_WEBHOOK_SECRET: optionalSecret,
  DATABASE_URL: optionalSecret,
  VISION_API_KEY: optionalSecret,
  VISION_MODEL: optionalSecret,
  IMAGE_API_KEY: optionalSecret,
  IMAGE_EDIT_MODEL: optionalSecret,
  RESEND_API_KEY: optionalSecret,
  EMAIL_FROM: optionalSecret,
  SUPPORT_EMAIL: optionalSecret,
  COOKIE_SIGNING_SECRET: optionalSecret,
  MAX_PHOTO_BYTES: z.coerce
    .number()
    .int()
    .min(512 * 1024)
    .max(15 * 1024 * 1024)
    .default(8 * 1024 * 1024),
  POSTHOG_PROJECT_API_KEY: optionalSecret,
  POSTHOG_HOST: z.url().optional().or(z.literal("").transform(() => undefined)),
  /** Development/test only: force a mock pipeline failure to exercise error paths. */
  MOCK_FORCE_FAILURE: z.enum(["ai", "qc", "pdf", "email"]).optional().or(z.literal("").transform(() => undefined)),
  META_PIXEL_ID: z
    .string()
    .regex(/^\d{5,20}$/)
    .optional()
    .or(z.literal("").transform(() => undefined)),
  META_CAPI_ACCESS_TOKEN: optionalSecret,
  META_GRAPH_API_VERSION: z
    .string()
    .regex(/^v\d{2}\.\d$/)
    .default("v26.0"),
  META_TEST_EVENT_CODE: optionalSecret,
  /** Opt-in: send SHA-256 of the buyer email with Purchase (marketing consent only). */
  META_CAPI_SEND_HASHED_EMAIL: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

let cachedEnv: ServerEnv | undefined;
let devSigningSecret: string | undefined;

export function serverEnv(): ServerEnv {
  if (!cachedEnv) {
    const parsed = serverEnvSchema.safeParse(process.env);
    if (!parsed.success) {
      const fields = parsed.error.issues.map((issue) => issue.path.join(".")).join(", ");
      throw new ConfigError(`Invalid server environment variables: ${fields}. Check .env.example.`);
    }
    cachedEnv = parsed.data;
  }
  return cachedEnv;
}

/** Test hook: re-read process.env on next access. */
export function resetServerEnvCache(): void {
  cachedEnv = undefined;
}

export function cookieSigningSecret(): string {
  const secret = serverEnv().COOKIE_SIGNING_SECRET;
  if (secret && secret.length >= 32) return secret;
  if (isProductionBuild) {
    throw new ConfigError("COOKIE_SIGNING_SECRET must be set (32+ characters) in production.");
  }
  // Development only: an ephemeral secret. Order cookies stop verifying after a restart.
  devSigningSecret ??= randomBytes(48).toString("base64");
  return devSigningSecret;
}

export function supportEmail(): string {
  return serverEnv().SUPPORT_EMAIL ?? "support@example.com";
}

export type PaymentMethod = "pix" | "card";
export type PaymentProviderId = "mock" | "abacatepay" | "stripe";
/** A payment method this process can take right now, and who processes it. */
export type PaymentOffer = { method: PaymentMethod; provider: PaymentProviderId; sandbox: boolean };

export const PAYMENT_METHODS = ["pix", "card"] as const satisfies readonly PaymentMethod[];
const REAL_PROVIDER = { pix: "abacatepay", card: "stripe" } as const satisfies Record<PaymentMethod, PaymentProviderId>;

/** True when the provider's configured keys cannot move real money. */
export function providerIsSandbox(provider: "abacatepay" | "stripe"): boolean {
  const env = serverEnv();
  return provider === "abacatepay" ? env.ABACATEPAY_SANDBOX : !env.STRIPE_SECRET_KEY?.startsWith("sk_live_");
}

/** What a real provider still needs before it may take payments. Production requires live keys. */
export function missingForProvider(provider: "abacatepay" | "stripe"): string[] {
  const env = serverEnv();
  const missing: string[] = [];
  if (provider === "abacatepay") {
    if (!env.ABACATEPAY_API_KEY) missing.push("ABACATEPAY_API_KEY");
    if (isProductionBuild && !env.ABACATEPAY_WEBHOOK_SECRET) missing.push("ABACATEPAY_WEBHOOK_SECRET");
    if (isProductionBuild && env.ABACATEPAY_SANDBOX) missing.push("ABACATEPAY_SANDBOX=false (live key)");
  } else {
    if (!env.STRIPE_SECRET_KEY) missing.push("STRIPE_SECRET_KEY");
    if (!publicConfig.stripePublishableKey) missing.push("NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY");
    // Development confirms payments by asking Stripe directly; production also needs webhooks (refunds, late payments).
    if (isProductionBuild && !env.STRIPE_WEBHOOK_SECRET) missing.push("STRIPE_WEBHOOK_SECRET");
    if (isProductionBuild && !env.STRIPE_SECRET_KEY?.startsWith("sk_live_")) missing.push("STRIPE_SECRET_KEY (live key)");
  }
  return missing;
}

/**
 * Requirements shared by every real payment. Real money requires every downstream
 * provider to be live as well: never charge for a report that cannot be delivered.
 * Sandbox payments move no money, so development may pair them with the simulated report.
 */
export function missingForRealPayments(sandbox: boolean): string[] {
  const env = serverEnv();
  const missing: string[] = [];
  if (isProductionBuild && !env.DATABASE_URL) missing.push("DATABASE_URL");
  if (isProductionBuild && !env.COOKIE_SIGNING_SECRET) missing.push("COOKIE_SIGNING_SECRET");
  const sandboxWithMocks = !isProductionBuild && sandbox && fulfillmentMode() === "mock";
  if (!sandboxWithMocks) {
    if (!publicConfig.enableRealAi) missing.push("NEXT_PUBLIC_ENABLE_REAL_AI=true");
    missing.push(...missingForRealAi());
  }
  return missing;
}

/**
 * The payment methods this process can offer: PIX (AbacatePay, reais) and card (Stripe).
 * A method is real only when its provider and everything downstream is configured.
 * Development falls back to the simulator per method; production never does.
 */
export function paymentOffers(): PaymentOffer[] {
  const offers: PaymentOffer[] = [];
  for (const method of PAYMENT_METHODS) {
    const provider = REAL_PROVIDER[method];
    if (publicConfig.enableRealPayments && missingForProvider(provider).length === 0) {
      const sandbox = providerIsSandbox(provider);
      if (missingForRealPayments(sandbox).length === 0) {
        offers.push({ method, provider, sandbox });
        continue;
      }
    }
    if (devPreviewEnabled) offers.push({ method, provider: "mock", sandbox: true });
  }
  return offers;
}

export function paymentOffer(method: PaymentMethod): PaymentOffer | undefined {
  return paymentOffers().find((offer) => offer.method === method);
}

/** Coarse summary for the health probe: never keys, hosts or provider names. */
export function paymentSummary(): "real" | "sandbox" | "mock" | "unavailable" {
  const offers = paymentOffers();
  if (offers.length === 0) return "unavailable";
  if (offers.every((offer) => offer.provider === "mock")) return "mock";
  return offers.some((offer) => offer.provider !== "mock" && !offer.sandbox) ? "real" : "sandbox";
}

export function missingForRealAi(): string[] {
  const env = serverEnv();
  const missing: string[] = [];
  if (!env.VISION_API_KEY) missing.push("VISION_API_KEY");
  if (!env.VISION_MODEL) missing.push("VISION_MODEL");
  if (!env.IMAGE_API_KEY) missing.push("IMAGE_API_KEY");
  if (!env.IMAGE_EDIT_MODEL) missing.push("IMAGE_EDIT_MODEL");
  if (!env.RESEND_API_KEY) missing.push("RESEND_API_KEY");
  if (!env.EMAIL_FROM) missing.push("EMAIL_FROM");
  return missing;
}

export type FulfillmentMode = "mock" | "real" | "unavailable";

export function fulfillmentMode(): FulfillmentMode {
  if (publicConfig.enableRealAi) {
    return missingForRealAi().length === 0 ? "real" : "unavailable";
  }
  return devPreviewEnabled ? "mock" : "unavailable";
}
