import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { ConfigError, serverEnv } from "../config";
import { ApiError } from "../http";

/**
 * AbacatePay transparent checkout (PIX), API v2.
 * Docs: https://docs.abacatepay.com/pages/transparents/reference
 * Payment state is always confirmed server-to-server with /transparents/check;
 * neither the browser nor a webhook body is trusted on its own.
 */

const BASE_URL = "https://api.abacatepay.com/v2";

export const PIX_STATUSES = [
  "PENDING",
  "EXPIRED",
  "CANCELLED",
  "PAID",
  "UNDER_DISPUTE",
  "REFUNDED",
  "REDEEMED",
  "APPROVED",
  "FAILED",
] as const;
export type PixStatus = (typeof PIX_STATUSES)[number];

const pixStatusSchema = z.enum(PIX_STATUSES);

const chargeSchema = z.object({
  id: z.string().min(1),
  amount: z.number().int(),
  status: pixStatusSchema,
  devMode: z.boolean().optional(),
  brCode: z.string().min(1),
  /** AbacatePay's QR image. Unused: the browser draws the QR from brCode. */
  brCodeBase64: z.string().optional(),
  expiresAt: z.string(),
});

const checkSchema = z.object({ id: z.string().min(1), status: pixStatusSchema, expiresAt: z.string().optional() });

const envelopeSchema = z.object({ data: z.unknown(), error: z.string().nullable().optional(), success: z.boolean().optional() });

export type PixCharge = z.infer<typeof chargeSchema>;

class AbacatePayError extends Error {
  override readonly name = "AbacatePayError";
  constructor(readonly status: number) {
    super(`AbacatePay request failed with HTTP ${status}`);
  }
}

function apiKey(): string {
  const key = serverEnv().ABACATEPAY_API_KEY;
  if (!key) throw new ConfigError("ABACATEPAY_API_KEY is missing.");
  return key;
}

async function call<T extends z.ZodType>(path: string, init: RequestInit, schema: T): Promise<z.infer<T>> {
  let response: Response;
  try {
    response = await fetch(`${BASE_URL}${path}`, {
      ...init,
      headers: { authorization: `Bearer ${apiKey()}`, "content-type": "application/json", accept: "application/json", ...init.headers },
      signal: AbortSignal.timeout(15_000),
      cache: "no-store",
    });
  } catch (error) {
    if (error instanceof ConfigError) throw error;
    console.error("[abacatepay] network error");
    throw new ApiError("SERVICE_UNAVAILABLE", "The payment provider didn't respond. Nothing was charged; try again.");
  }
  if (!response.ok) {
    console.error(`[abacatepay] ${path.split("?")[0]} → HTTP ${response.status}`);
    throw new AbacatePayError(response.status);
  }
  const envelope = envelopeSchema.safeParse(await response.json().catch(() => null));
  const data = envelope.success ? schema.safeParse(envelope.data.data) : undefined;
  if (!data?.success) {
    console.error(`[abacatepay] unexpected response shape from ${path.split("?")[0]}`);
    throw new ApiError("SERVICE_UNAVAILABLE");
  }
  return data.data;
}

/** Creates a PIX charge for an order. Amount in centavos; the server alone decides it. */
export async function createPixCharge(input: {
  orderId: string;
  amountMinor: number;
  expiresInSeconds: number;
  description: string;
}): Promise<PixCharge> {
  try {
    return await call(
      "/transparents/create",
      {
        method: "POST",
        body: JSON.stringify({
          method: "PIX",
          data: {
            amount: input.amountMinor,
            expiresIn: input.expiresInSeconds,
            description: input.description.slice(0, 500),
            externalId: input.orderId,
            metadata: { order_id: input.orderId },
          },
        }),
      },
      chargeSchema,
    );
  } catch (error) {
    if (error instanceof AbacatePayError) {
      throw new ApiError("SERVICE_UNAVAILABLE", "PIX isn't available right now. Nothing was charged; try again in a moment.");
    }
    throw error;
  }
}

export async function checkPixCharge(chargeId: string): Promise<z.infer<typeof checkSchema>> {
  try {
    return await call(`/transparents/check?id=${encodeURIComponent(chargeId)}`, { method: "GET" }, checkSchema);
  } catch (error) {
    if (error instanceof AbacatePayError) throw new ApiError("SERVICE_UNAVAILABLE");
    throw error;
  }
}

/** Dev Mode only: AbacatePay marks the charge as paid. Errors in production by design. */
export async function simulatePixPayment(chargeId: string): Promise<void> {
  if (!serverEnv().ABACATEPAY_SANDBOX) throw new ApiError("NOT_FOUND");
  try {
    await call(`/transparents/simulate-payment?id=${encodeURIComponent(chargeId)}`, { method: "POST", body: "{}" }, chargeSchema.partial());
  } catch (error) {
    if (error instanceof AbacatePayError) throw new ApiError("SERVICE_UNAVAILABLE", "The sandbox couldn't simulate this payment.");
    throw error;
  }
}

/** Only PAID counts as an entitlement; other states never unlock a report. */
export function isPaid(status: PixStatus): boolean {
  return status === "PAID";
}

export function isClosedUnpaid(status: PixStatus): boolean {
  return status === "EXPIRED" || status === "CANCELLED" || status === "FAILED";
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

/**
 * Webhook authenticity: our secret in ?webhookSecret= (required), and the
 * X-Webhook-Signature HMAC-SHA256 over the raw body when a key is configured.
 */
export function verifyWebhook(rawBody: string, url: URL, signature: string | null): boolean {
  const env = serverEnv();
  if (!env.ABACATEPAY_WEBHOOK_SECRET) return false;
  const provided = url.searchParams.get("webhookSecret") ?? "";
  if (!safeEqual(provided, env.ABACATEPAY_WEBHOOK_SECRET)) return false;
  if (env.ABACATEPAY_PUBLIC_KEY) {
    if (!signature) return false;
    const expected = createHmac("sha256", env.ABACATEPAY_PUBLIC_KEY).update(Buffer.from(rawBody, "utf8")).digest("base64");
    if (!safeEqual(signature, expected)) return false;
  }
  return true;
}

const webhookSchema = z
  .object({
    id: z.string().min(1),
    event: z.string().min(1),
    devMode: z.boolean().optional(),
    data: z.unknown(),
  })
  .passthrough();

/** Finds the charge id in a webhook payload without trusting anything else in it. */
export function parseWebhook(rawBody: string): { eventId: string; event: string; chargeId: string | null; devMode: boolean } | undefined {
  let json: unknown;
  try {
    json = JSON.parse(rawBody);
  } catch {
    return undefined;
  }
  const parsed = webhookSchema.safeParse(json);
  if (!parsed.success) return undefined;
  const data = parsed.data.data as Record<string, unknown> | null | undefined;
  const candidates = [
    data?.id,
    (data?.transparent as Record<string, unknown> | undefined)?.id,
    (data?.pixQrCode as Record<string, unknown> | undefined)?.id,
    (data?.payment as Record<string, unknown> | undefined)?.id,
  ];
  const chargeId = candidates.find((value): value is string => typeof value === "string" && value.length > 0) ?? null;
  return { eventId: parsed.data.id, event: parsed.data.event, chargeId, devMode: parsed.data.devMode ?? false };
}
