import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return { ...actual, after: (task: () => unknown) => void Promise.resolve().then(task) };
});

const dispatched: unknown[] = [];
vi.mock("@/server/analytics", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/analytics")>();
  return {
    ...actual,
    dispatchClientBatch: vi.fn(async (...args: unknown[]) => {
      dispatched.push(args);
    }),
  };
});

const { POST } = await import("@/app/api/events/route");
const { resetRateLimitsForTests } = await import("@/server/security/rate-limit");

const body = {
  context: {
    sid: "c".repeat(32),
    path: "/",
    attribution: {},
    consent: { analytics: true, marketing: true },
  },
  events: [{ name: "landing_view", props: {}, ts: Date.now() }],
};

function request(payload: unknown, headers: Record<string, string> = {}) {
  return new Request("http://localhost:3000/api/events", {
    method: "POST",
    headers: { "content-type": "text/plain;charset=UTF-8", origin: "http://localhost:3000", ...headers },
    body: typeof payload === "string" ? payload : JSON.stringify(payload),
  });
}

describe("POST /api/events", () => {
  beforeEach(() => {
    dispatched.length = 0;
    resetRateLimitsForTests();
  });
  afterEach(() => vi.clearAllMocks());

  it("accepts a valid batch with 204 and dispatches after the response", async () => {
    const response = await POST(request(body));
    expect(response.status).toBe(204);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(dispatched).toHaveLength(1);
  });

  it("downgrades consent to what the cookie says", async () => {
    await POST(request(body));
    await new Promise((resolve) => setTimeout(resolve, 0));
    const [batch] = dispatched[0] as [{ context: { consent: unknown } }];
    expect(batch.context.consent).toEqual({ analytics: false, marketing: false });
  });

  it("rejects malformed, non-allowlisted and cross-site batches", async () => {
    expect((await POST(request("not json"))).status).toBe(400);
    expect((await POST(request({ ...body, events: [{ name: "face_scan", props: {}, ts: 1 }] }))).status).toBe(400);
    expect((await POST(request(body, { "sec-fetch-site": "cross-site" }))).status).toBe(403);
    expect((await POST(request(body, { origin: "https://evil.example" }))).status).toBe(403);
    expect(dispatched).toHaveLength(0);
  });
});
