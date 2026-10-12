import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

/**
 * Staging: a production build in test mode where sandbox payments are allowed, optionally
 * behind a password. Without STAGING, production keeps requiring live keys.
 */
const PRODUCTION_ENV = {
  NODE_ENV: "production",
  NEXT_PUBLIC_ENABLE_REAL_PAYMENTS: "true",
  NEXT_PUBLIC_ENABLE_REAL_AI: "true",
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: "pk_test_unit",
  STRIPE_SECRET_KEY: "sk_test_unit",
  STRIPE_WEBHOOK_SECRET: "whsec_unit",
  ABACATEPAY_API_KEY: "abc_dev_unit",
  ABACATEPAY_SANDBOX: "true",
  ABACATEPAY_WEBHOOK_SECRET: "unit-webhook-secret",
  DATABASE_URL: "postgres://unit@localhost:5432/unit",
  COOKIE_SIGNING_SECRET: "unit-cookie-secret-unit-cookie-secret-0123456789",
  VISION_API_KEY: "unit",
  VISION_MODEL: "unit-model",
  IMAGE_API_KEY: "unit",
  IMAGE_EDIT_MODEL: "unit-image-model",
  RESEND_API_KEY: "unit",
  EMAIL_FROM: "MXVA <unit@example.com>",
};

const saved = new Map<string, string | undefined>();
function setEnv(values: Record<string, string | undefined>) {
  for (const [key, value] of Object.entries(values)) {
    if (!saved.has(key)) saved.set(key, process.env[key]);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

afterEach(() => {
  for (const [key, value] of saved) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  saved.clear();
  vi.resetModules();
});

async function offersWith(extra: Record<string, string | undefined>) {
  setEnv({ ...PRODUCTION_ENV, ...extra });
  vi.resetModules();
  const config = await import("@/server/config");
  return { offers: config.paymentOffers(), tools: config.sandboxToolsAllowed() };
}

describe("payments on a production build", () => {
  it("refuse sandbox keys without staging", async () => {
    expect(await offersWith({ STAGING: undefined, STAGING_PASSWORD: undefined })).toEqual({ offers: [], tools: false });
  });

  it("allow sandbox keys on public staging (no password), with the simulate tools", async () => {
    const { offers, tools } = await offersWith({ STAGING: "true", STAGING_PASSWORD: undefined });
    expect(offers.map((offer) => offer.sandbox)).toEqual([true, true]);
    expect(tools).toBe(true);
  });

  it("allow sandbox keys on password-protected staging, with the simulate tools", async () => {
    const { offers, tools } = await offersWith({ STAGING: "true", STAGING_PASSWORD: "a-long-staging-password" });
    expect(offers).toEqual([
      { method: "pix", provider: "abacatepay", sandbox: true },
      { method: "card", provider: "stripe", sandbox: true },
    ]);
    expect(tools).toBe(true);
  });

  it("treat staging with a too-short password as production", async () => {
    expect(await offersWith({ STAGING: "true", STAGING_PASSWORD: "short" })).toEqual({ offers: [], tools: false });
  });
});

describe("staging gate (proxy)", () => {
  const request = (path: string, password?: string) =>
    new NextRequest(`https://staging.example.com${path}`, {
      headers: password === undefined ? {} : { authorization: `Basic ${Buffer.from(`mxva:${password}`).toString("base64")}` },
    });
  const passedThrough = (response: Response) => response.headers.get("x-middleware-next") === "1";

  it("does nothing outside staging", async () => {
    setEnv({ STAGING: undefined });
    const { proxy } = await import("@/proxy");
    expect(passedThrough(proxy(request("/")))).toBe(true);
  });

  it("without a password: open to everyone, never indexed", async () => {
    setEnv({ STAGING: "true", STAGING_PASSWORD: undefined });
    const { proxy } = await import("@/proxy");
    const open = proxy(request("/checkout"));
    expect(passedThrough(open)).toBe(true);
    expect(open.headers.get("x-robots-tag")).toContain("noindex");
  });

  it("asks for the password, accepts the right one, and keeps webhooks and health open", async () => {
    setEnv({ STAGING: "true", STAGING_PASSWORD: "a-long-staging-password" });
    const { proxy } = await import("@/proxy");
    const locked = proxy(request("/checkout"));
    expect(locked.status).toBe(401);
    expect(locked.headers.get("www-authenticate")).toContain("Basic");
    expect(proxy(request("/checkout", "wrong-password-123")).status).toBe(401);
    const open = proxy(request("/checkout", "a-long-staging-password"));
    expect(passedThrough(open)).toBe(true);
    expect(open.headers.get("x-robots-tag")).toContain("noindex");
    for (const path of ["/api/stripe/webhook", "/api/abacatepay/webhook", "/api/health"]) expect(passedThrough(proxy(request(path)))).toBe(true);
  });

  it("serves nothing when the password is too short", async () => {
    setEnv({ STAGING: "true", STAGING_PASSWORD: "short" });
    const { proxy } = await import("@/proxy");
    expect(proxy(request("/")).status).toBe(503);
  });
});
