import { describe, expect, it } from "vitest";
import { baseSecurityHeaders, buildContentSecurityPolicy } from "@/server/security/headers";

describe("content security policy", () => {
  it("blocks framing, plugins and foreign scripts by default", () => {
    const csp = buildContentSecurityPolicy({ isDev: false, enableStripe: false });
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("frame-src 'none'");
    expect(csp).not.toContain("stripe");
    expect(csp).not.toContain("unsafe-eval");
    expect(csp).toContain("upgrade-insecure-requests");
  });

  it("allows Stripe origins only when real payments are enabled", () => {
    const csp = buildContentSecurityPolicy({ isDev: false, enableStripe: true });
    expect(csp).toContain("https://js.stripe.com");
    expect(csp).toContain("https://api.stripe.com");
  });

  it("allows blob: images for in-memory photo previews", () => {
    expect(buildContentSecurityPolicy({ isDev: true, enableStripe: false })).toMatch(/img-src [^;]*blob:/);
  });

  it("adds HSTS only outside development", () => {
    const keys = (isDev: boolean) => baseSecurityHeaders({ isDev, enableStripe: false }).map((h) => h.key);
    expect(keys(false)).toContain("Strict-Transport-Security");
    expect(keys(true)).not.toContain("Strict-Transport-Security");
  });
});
