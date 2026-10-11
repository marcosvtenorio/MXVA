import { describe, expect, it } from "vitest";
import {
  ORDER_COOKIE_NAME,
  ORDER_SESSION_TTL_SECONDS,
  createOrderSessionToken,
  orderCookieHeader,
  readOrderCookie,
  verifyOrderSessionToken,
} from "@/server/security/session";

const id = "7a1d3f0e-1b2c-4d5e-8f90-123456789abc";
const secret = "x".repeat(40);

describe("signed order session", () => {
  it("round-trips a valid token", () => {
    const token = createOrderSessionToken(id, 1000, secret);
    expect(verifyOrderSessionToken(token, 1001, secret)?.oid).toBe(id);
  });

  it("rejects tampering, a wrong secret and expiry", () => {
    const token = createOrderSessionToken(id, 1000, secret);
    const [data, sig] = token.split(".");
    const forged = Buffer.from(JSON.stringify({ v: 1, oid: id, iat: 1000, exp: 9_999_999_999 })).toString("base64url");
    expect(verifyOrderSessionToken(`${forged}.${sig}`, 1001, secret)).toBeUndefined();
    expect(verifyOrderSessionToken(`${data}.${sig}x`, 1001, secret)).toBeUndefined();
    expect(verifyOrderSessionToken(token, 1001, "y".repeat(40))).toBeUndefined();
    expect(verifyOrderSessionToken(token, 1000 + ORDER_SESSION_TTL_SECONDS, secret)).toBeUndefined();
    expect(verifyOrderSessionToken("garbage", 1001, secret)).toBeUndefined();
    expect(verifyOrderSessionToken(undefined, 1001, secret)).toBeUndefined();
  });

  it("sets an httpOnly, SameSite=Lax cookie and reads it back", () => {
    const header = orderCookieHeader("abc.def");
    expect(header).toContain("HttpOnly");
    expect(header).toContain("SameSite=Lax");
    expect(header).toContain("Path=/");
    const request = new Request("http://localhost/api", { headers: { cookie: `other=1; ${ORDER_COOKIE_NAME}=abc.def` } });
    expect(readOrderCookie(request)).toBe("abc.def");
  });
});
