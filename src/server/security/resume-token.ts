import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { publicConfig } from "@/lib/config";
import { cookieSigningSecret } from "../config";

/**
 * The link in a "create your report again" email: proves the holder bought this order, so they
 * can add their photo again on any device without paying twice. HMAC-signed, holds only the
 * order id, and is never accepted as an order cookie (different shape).
 */

export const RESUME_TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60;

const payloadSchema = z
  .object({
    v: z.literal(1),
    p: z.literal("resume"),
    oid: z.uuid(),
    iat: z.number().int(),
    exp: z.number().int(),
  })
  .strict();

function sign(data: string, secret: string): string {
  return createHmac("sha256", secret).update(`resume.${data}`).digest("base64url");
}

export function createResumeToken(orderId: string, nowSeconds = Math.floor(Date.now() / 1000), secret = cookieSigningSecret()): string {
  const payload = { v: 1, p: "resume", oid: orderId, iat: nowSeconds, exp: nowSeconds + RESUME_TOKEN_TTL_SECONDS };
  const data = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${data}.${sign(data, secret)}`;
}

/** The order id, or undefined when the token is malformed, tampered with or expired. */
export function verifyResumeToken(token: string | null | undefined, nowSeconds = Math.floor(Date.now() / 1000), secret = cookieSigningSecret()): string | undefined {
  if (!token || token.length > 1024) return undefined;
  const [data, signature, ...rest] = token.split(".");
  if (!data || !signature || rest.length > 0) return undefined;
  const expected = Buffer.from(sign(data, secret));
  const actual = Buffer.from(signature);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return undefined;
  try {
    const payload = payloadSchema.parse(JSON.parse(Buffer.from(data, "base64url").toString("utf8")));
    if (payload.exp <= nowSeconds || payload.iat > nowSeconds + 60) return undefined;
    return payload.oid;
  } catch {
    return undefined;
  }
}

export function resumeUrl(orderId: string): string {
  return `${publicConfig.appUrl}/resume?t=${encodeURIComponent(createResumeToken(orderId))}`;
}
