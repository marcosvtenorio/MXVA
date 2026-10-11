import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { isProductionBuild } from "@/lib/config";
import { cookieSigningSecret } from "../config";

/**
 * Opaque, HMAC-signed order session carried in an httpOnly cookie. It proves this
 * browser created the order; it holds no personal data (only the order id).
 */

export const ORDER_SESSION_TTL_SECONDS = 24 * 60 * 60;

/** `__Host-` pins the cookie to this exact origin over HTTPS (production only). */
export const ORDER_COOKIE_NAME = isProductionBuild ? "__Host-mxva_order" : "mxva_order";

const payloadSchema = z.object({
  v: z.literal(1),
  oid: z.uuid(),
  iat: z.number().int(),
  exp: z.number().int(),
});

export type OrderSession = z.infer<typeof payloadSchema>;

function sign(data: string, secret: string): string {
  return createHmac("sha256", secret).update(data).digest("base64url");
}

export function createOrderSessionToken(orderId: string, nowSeconds = Math.floor(Date.now() / 1000), secret = cookieSigningSecret()): string {
  const payload: OrderSession = { v: 1, oid: orderId, iat: nowSeconds, exp: nowSeconds + ORDER_SESSION_TTL_SECONDS };
  const data = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${data}.${sign(data, secret)}`;
}

export function verifyOrderSessionToken(
  token: string | undefined,
  nowSeconds = Math.floor(Date.now() / 1000),
  secret = cookieSigningSecret(),
): OrderSession | undefined {
  if (!token || token.length > 1024) return undefined;
  const [data, signature, ...rest] = token.split(".");
  if (!data || !signature || rest.length > 0) return undefined;

  const expected = Buffer.from(sign(data, secret));
  const actual = Buffer.from(signature);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return undefined;

  try {
    const payload = payloadSchema.parse(JSON.parse(Buffer.from(data, "base64url").toString("utf8")));
    if (payload.exp <= nowSeconds || payload.iat > nowSeconds + 60) return undefined;
    return payload;
  } catch {
    return undefined;
  }
}

export function orderCookieHeader(token: string): string {
  const parts = [
    `${ORDER_COOKIE_NAME}=${token}`,
    "Path=/",
    `Max-Age=${ORDER_SESSION_TTL_SECONDS}`,
    "HttpOnly",
    "SameSite=Lax",
  ];
  if (isProductionBuild) parts.push("Secure");
  return parts.join("; ");
}

export function clearOrderCookieHeader(): string {
  const parts = [`${ORDER_COOKIE_NAME}=`, "Path=/", "Max-Age=0", "HttpOnly", "SameSite=Lax"];
  if (isProductionBuild) parts.push("Secure");
  return parts.join("; ");
}

export function readOrderCookie(request: Request): string | undefined {
  const header = request.headers.get("cookie");
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const [name, ...value] = part.trim().split("=");
    if (name === ORDER_COOKIE_NAME) return value.join("=");
  }
  return undefined;
}
