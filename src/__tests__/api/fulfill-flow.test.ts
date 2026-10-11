import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as createOrderRoute } from "@/app/api/orders/route";
import { GET as currentOrderRoute } from "@/app/api/orders/current/route";
import { POST as mockPayRoute } from "@/app/api/dev/mock-pay/route";
import { POST as fulfillRoute } from "@/app/api/fulfill/route";
import { POST as retryRoute } from "@/app/api/fulfill/retry/route";
import { FACE_PROCESSING_CONSENT_VERSION, TERMS_VERSION, type ReportInput } from "@/features/onboarding/schema";
import { InMemoryOrderRepository, setOrderRepositoryForTests } from "@/features/orders/repository";
import { resetServerEnvCache } from "@/server/config";
import { resetRateLimitsForTests } from "@/server/security/rate-limit";

const ORIGIN = "http://localhost:3000";
const frontBytes = readFileSync(new URL("../../../e2e/fixtures/synthetic-front.jpg", import.meta.url));

const input: ReportInput = {
  goals: ["grooming"],
  focusAreas: ["brows", "facial_hair", "hair"],
  timeline: "30d",
  budget: "low",
  preferences: { skin: [], brows: ["shape"], eyes: [], hair: ["routine"], facialHairRelevant: "yes", facialHair: ["shape"], smile: [], jaw: [] },
  constraints: { dailyMinutes: "15", avoid: [] },
};

const headers = (cookie?: string) => ({ origin: ORIGIN, "x-mxva-request": "1", ...(cookie ? { cookie } : {}) });

async function paidCookie(): Promise<string> {
  const created = await createOrderRoute(
    new Request(`${ORIGIN}/api/orders`, {
      method: "POST",
      headers: { ...headers(), "content-type": "application/json" },
      body: JSON.stringify({
        sku: "mxva_report_v1",
        email: "buyer@example.com",
        adultConfirmed: true,
        faceProcessingConsentVersion: FACE_PROCESSING_CONSENT_VERSION,
        termsVersion: TERMS_VERSION,
        marketingOptIn: false,
      }),
    }),
  );
  const cookie = (created.headers.get("set-cookie") ?? "").split(";")[0]!;
  await mockPayRoute(
    new Request(`${ORIGIN}/api/dev/mock-pay`, {
      method: "POST",
      headers: { ...headers(cookie), "content-type": "application/json" },
      body: JSON.stringify({ outcome: "succeeded" }),
    }),
  );
  return cookie;
}

function fulfillRequest(cookie: string, options: { consent?: boolean; front?: boolean } = {}) {
  const form = new FormData();
  if (options.front !== false) form.set("front", new File([frontBytes], "front.jpg", { type: "image/jpeg" }));
  form.set("input", JSON.stringify(input));
  form.set("faceProcessingConsent", options.consent === false ? "false" : "true");
  return new Request(`${ORIGIN}/api/fulfill`, { method: "POST", headers: headers(cookie), body: form });
}

async function lines(response: Response) {
  return (await response.text())
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line) as { type: string; phase?: string; error?: { code: string }; emailDelivered?: boolean; report?: { recommendations: unknown[]; simulated: boolean }; image?: { base64: string }; pdf?: { base64: string; filename: string } });
}

async function status(cookie: string) {
  return (await (await currentOrderRoute(new Request(`${ORIGIN}/api/orders/current`, { headers: { cookie } }))).json()).order;
}

beforeEach(() => {
  setOrderRepositoryForTests(new InMemoryOrderRepository());
  resetRateLimitsForTests();
  vi.spyOn(console, "info").mockImplementation(() => undefined);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});

afterEach(() => {
  setOrderRepositoryForTests(undefined);
  resetServerEnvCache();
});

describe("paid fulfilment (mock providers)", () => {
  it("streams real phases, then the report, concept image and PDF; marks the order delivered", async () => {
    const cookie = await paidCookie();
    const response = await fulfillRoute(fulfillRequest(cookie));
    expect(response.headers.get("content-type")).toContain("application/x-ndjson");
    expect(response.headers.get("cache-control")).toContain("no-store");
    const events = await lines(response);
    expect(events.filter((e) => e.type === "phase").map((e) => e.phase)).toEqual([
      "analysing_photo",
      "preparing_image",
      "checking_image",
      "building_report",
      "sending_email",
    ]);
    const result = events.at(-1)!;
    expect(result.type).toBe("result");
    expect(result.emailDelivered).toBe(true);
    expect(result.report?.simulated).toBe(true);
    expect(result.report?.recommendations.length).toBeGreaterThanOrEqual(5);
    expect(Buffer.from(result.pdf!.base64, "base64").subarray(0, 5).toString()).toBe("%PDF-");
    expect(result.pdf?.filename).toBe("your-appearance-roadmap.pdf");
    expect(Buffer.from(result.image!.base64, "base64").subarray(0, 3)).toEqual(Buffer.from([0xff, 0xd8, 0xff]));
    expect((await status(cookie)).status).toBe("delivered_to_provider");

    // A second submission never produces a second delivery.
    const again = await fulfillRoute(fulfillRequest(cookie));
    expect((await again.json()).error.code).toBe("ORDER_NOT_RETRYABLE");
  });

  it("refuses before payment, without consent, and without a front photo", async () => {
    const created = await createOrderRoute(
      new Request(`${ORIGIN}/api/orders`, {
        method: "POST",
        headers: { ...headers(), "content-type": "application/json" },
        body: JSON.stringify({
          sku: "mxva_report_v1",
          email: "buyer@example.com",
          adultConfirmed: true,
          faceProcessingConsentVersion: FACE_PROCESSING_CONSENT_VERSION,
          termsVersion: TERMS_VERSION,
          marketingOptIn: false,
        }),
      }),
    );
    const unpaid = (created.headers.get("set-cookie") ?? "").split(";")[0]!;
    const notPaid = await fulfillRoute(fulfillRequest(unpaid));
    expect(notPaid.status).toBe(402);
    expect((await notPaid.json()).error.code).toBe("ORDER_NOT_PAID");

    const cookie = await paidCookie();
    expect((await (await fulfillRoute(fulfillRequest(cookie, { consent: false }))).json()).error.code).toBe("CONSENT_REQUIRED");
    expect((await (await fulfillRoute(fulfillRequest(cookie, { front: false }))).json()).error.code).toBe("PHOTO_REQUIRED");
    // Rejected input never costs an attempt.
    expect((await status(cookie)).attemptsRemaining).toBe(3);
  });

  it("never delivers when the concept fails quality checks; retry works without paying again", async () => {
    vi.stubEnv("MOCK_FORCE_FAILURE", "qc");
    resetServerEnvCache();
    const cookie = await paidCookie();
    const events = await lines(await fulfillRoute(fulfillRequest(cookie)));
    expect(events.at(-1)).toMatchObject({ type: "error", error: { code: "SIMULATION_QUALITY_FAILED" } });
    expect(events.some((e) => e.type === "result")).toBe(false);
    expect((await status(cookie)).status).toBe("failed_retryable");

    vi.stubEnv("MOCK_FORCE_FAILURE", "");
    resetServerEnvCache();
    const retried = await (await retryRoute(new Request(`${ORIGIN}/api/fulfill/retry`, { method: "POST", headers: headers(cookie) }))).json();
    expect(retried.order).toMatchObject({ status: "paid", canSubmitPhotos: true, attemptsRemaining: 2 });
    const second = await lines(await fulfillRoute(fulfillRequest(cookie)));
    expect(second.at(-1)?.type).toBe("result");
  });

  it("keeps the report available when email fails, and records it", async () => {
    vi.stubEnv("MOCK_FORCE_FAILURE", "email");
    resetServerEnvCache();
    const cookie = await paidCookie();
    const events = await lines(await fulfillRoute(fulfillRequest(cookie)));
    expect(events.at(-1)).toMatchObject({ type: "result", emailDelivered: false });
    expect((await status(cookie)).status).toBe("generated_email_failed");
  }, 20_000);

  it("lets only one of two simultaneous submissions run", async () => {
    const cookie = await paidCookie();
    const [a, b] = await Promise.all([fulfillRoute(fulfillRequest(cookie)), fulfillRoute(fulfillRequest(cookie))]);
    const outcomes = await Promise.all(
      [a, b].map(async (response) =>
        response.headers.get("content-type")?.includes("ndjson") ? (await lines(response)).at(-1)?.type : (await response.json()).error.code,
      ),
    );
    expect(outcomes.sort()).toEqual(["ALREADY_PROCESSING", "result"]);
  });
});
