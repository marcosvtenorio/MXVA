import { beforeEach, describe, expect, it } from "vitest";
import { ApiError } from "@/server/http";
import { assertSameOriginRequest } from "@/server/security/csrf";
import { hit, resetRateLimitsForTests } from "@/server/security/rate-limit";

const post = (headers: Record<string, string>) =>
  new Request("http://localhost:3000/api/orders", { method: "POST", headers });

const code = (fn: () => void) => {
  try {
    fn();
    return "ok";
  } catch (error) {
    return error instanceof ApiError ? error.code : "other";
  }
};

describe("CSRF guard", () => {
  it("accepts a same-origin fetch with the request header", () => {
    expect(code(() => assertSameOriginRequest(post({ "x-mxva-request": "1", origin: "http://localhost:3000" })))).toBe("ok");
    expect(code(() => assertSameOriginRequest(post({ "x-mxva-request": "1", "sec-fetch-site": "same-origin" })))).toBe("ok");
  });

  it("rejects missing headers, foreign origins and cross-site fetches", () => {
    expect(code(() => assertSameOriginRequest(post({ origin: "http://localhost:3000" })))).toBe("FORBIDDEN_ORIGIN");
    expect(code(() => assertSameOriginRequest(post({ "x-mxva-request": "1", origin: "https://evil.example" })))).toBe(
      "FORBIDDEN_ORIGIN",
    );
    expect(code(() => assertSameOriginRequest(post({ "x-mxva-request": "1", "sec-fetch-site": "cross-site" })))).toBe(
      "FORBIDDEN_ORIGIN",
    );
    expect(code(() => assertSameOriginRequest(post({ "x-mxva-request": "1" })))).toBe("FORBIDDEN_ORIGIN");
  });
});

describe("rate limiter", () => {
  beforeEach(() => resetRateLimitsForTests());

  it("allows up to the limit inside the window, then reports a wait", () => {
    const rule = { limit: 2, windowMs: 1000 };
    expect(hit("k", rule, 0)).toBe(0);
    expect(hit("k", rule, 10)).toBe(0);
    expect(hit("k", rule, 20)).toBeGreaterThan(0);
    expect(hit("k", rule, 1001)).toBe(0);
    expect(hit("other", rule, 20)).toBe(0);
  });
});
