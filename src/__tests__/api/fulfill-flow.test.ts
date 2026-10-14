import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as createOrderRoute } from "@/app/api/orders/route";
import { GET as currentOrderRoute } from "@/app/api/orders/current/route";
import { POST as mockPayRoute } from "@/app/api/dev/mock-pay/route";
import { POST as fulfillRoute } from "@/app/api/fulfill/route";
import { POST as retryRoute } from "@/app/api/fulfill/retry/route";
import { FACE_PROCESSING_CONSENT_VERSION, TERMS_VERSION, type FulfillInput } from "@/features/onboarding/schema";
import { InMemoryOrderRepository, setOrderRepositoryForTests } from "@/features/orders/repository";
import { claimForFulfillment } from "@/features/orders/service";
import { PROCESSING_LEASE_MS } from "@/features/orders/states";
import { resetServerEnvCache } from "@/server/config";
import * as pipeline from "@/server/fulfillment/pipeline";
import { fulfillmentQueue, resetFulfillmentQueueForTests } from "@/server/fulfillment/queue";
import { mockSentEmails } from "@/server/mail/email-adapter";
import { resetRateLimitsForTests } from "@/server/security/rate-limit";

const ORIGIN = "http://localhost:3000";
const frontBytes = readFileSync(new URL("../../../e2e/fixtures/synthetic-front.jpg", import.meta.url));

// The browser sends only constraints; the plan and concept come from the photo analysis.
const input: FulfillInput = { constraints: { dailyMinutes: "30", avoid: [] } };

const headers = (cookie?: string) => ({ origin: ORIGIN, "x-mxva-request": "1", ...(cookie ? { cookie } : {}) });

async function paidCookie(email = "buyer@example.com"): Promise<string> {
  const created = await createOrderRoute(
    new Request(`${ORIGIN}/api/orders`, {
      method: "POST",
      headers: { ...headers(), "content-type": "application/json" },
      body: JSON.stringify({
        sku: "mxva_report_v1",
        method: "card",
        email,
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

async function status(cookie: string) {
  return (await (await currentOrderRoute(new Request(`${ORIGIN}/api/orders/current`, { headers: { cookie } }))).json()).order;
}

const OWNER = "owner@example.com";
let repository: InMemoryOrderRepository;
const sent = (to: string) => mockSentEmails().filter((email) => email.to === to);

beforeEach(() => {
  repository = new InMemoryOrderRepository();
  setOrderRepositoryForTests(repository);
  resetRateLimitsForTests();
  resetFulfillmentQueueForTests();
  mockSentEmails().length = 0;
  vi.stubEnv("FULFILLMENT_RETRY_DELAY_MS", "10");
  vi.stubEnv("OWNER_ALERT_EMAIL", OWNER);
  resetServerEnvCache();
  vi.spyOn(console, "info").mockImplementation(() => undefined);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
  resetFulfillmentQueueForTests();
  setOrderRepositoryForTests(undefined);
  vi.unstubAllEnvs();
  resetServerEnvCache();
});

describe("paid fulfilment through the queue (mock providers)", () => {
  it("answers at once with the place in line; the queue makes the report and emails it", async () => {
    const cookie = await paidCookie();
    const response = await fulfillRoute(fulfillRequest(cookie));
    expect(response.status).toBe(202);
    expect(response.headers.get("cache-control")).toContain("no-store");
    const body = await response.json();
    expect(body.queue).toEqual({ position: 0, etaMinutes: expect.any(Number) });
    expect(body.order).toMatchObject({ status: "processing", canSubmitPhotos: false });

    await fulfillmentQueue().drained();
    expect((await status(cookie)).status).toBe("delivered_to_provider");
    expect(sent("buyer@example.com")).toEqual([expect.objectContaining({ kind: "report" })]);
    expect(sent(OWNER)).toHaveLength(0);

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
          method: "card",
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
    // Rejected input never costs an attempt, and nothing was queued.
    expect((await status(cookie)).attemptsRemaining).toBe(3);
    expect(fulfillmentQueue().size).toMatchObject({ waiting: 0, running: 0 });
  });

  it("queues beyond the concurrency limit, in order, with growing estimates", async () => {
    vi.stubEnv("FULFILLMENT_CONCURRENCY", "2");
    resetServerEnvCache();
    resetFulfillmentQueueForTests();
    // Reports take a while for real: hold them until all five buyers are in line.
    let release!: () => void;
    const held = new Promise<void>((resolve) => (release = resolve));
    const generate = pipeline.generateReport;
    vi.spyOn(pipeline, "generateReport").mockImplementation(async (args) => {
      await held;
      return generate(args);
    });
    const cookies = await Promise.all([1, 2, 3, 4, 5].map((n) => paidCookie(`buyer${n}@example.com`)));
    const tickets = [];
    for (const cookie of cookies) tickets.push((await (await fulfillRoute(fulfillRequest(cookie))).json()).queue);
    expect(tickets.map((t) => t.position)).toEqual([0, 0, 1, 2, 3]);
    const etas = tickets.map((t) => t.etaMinutes);
    expect([...etas].sort((a, b) => a - b)).toEqual(etas);
    expect(fulfillmentQueue().size).toMatchObject({ running: 2, waiting: 3, concurrency: 2 });

    release();
    await fulfillmentQueue().drained();
    for (const cookie of cookies) expect((await status(cookie)).status).toBe("delivered_to_provider");
    for (const n of [1, 2, 3, 4, 5]) expect(sent(`buyer${n}@example.com`)).toHaveLength(1);
  }, 20_000);

  it("retries a concept that fails the likeness check, then emails the buyer a new-photo link and the owner an alert without images", async () => {
    vi.stubEnv("MOCK_FORCE_FAILURE", "qc");
    resetServerEnvCache();
    const cookie = await paidCookie();
    expect((await fulfillRoute(fulfillRequest(cookie))).status).toBe(202);
    await fulfillmentQueue().drained();
    expect((await status(cookie)).status).toBe("failed_retryable");

    const [notice] = sent("buyer@example.com");
    expect(notice).toMatchObject({ kind: "notice", subject: expect.stringContaining("photo") });
    expect(notice!.text).toMatch(/\/resume\?t=/);
    const [alert] = sent(OWNER);
    expect(alert!.subject).toContain("SIMULATION_QUALITY_FAILED");
    expect(alert!.text).toContain("buyer@example.com");
    expect(alert!.text).toMatch(/tentativa 3 de 3/);
    expect(alert!.text).not.toMatch(/data:image|base64|\/9j\//);
    expect(sent("buyer@example.com").filter((e) => e.kind === "report")).toHaveLength(0);

    // The link's way back: a retry (no second charge) and a new photo.
    vi.stubEnv("MOCK_FORCE_FAILURE", "");
    resetServerEnvCache();
    const retried = await (await retryRoute(new Request(`${ORIGIN}/api/fulfill/retry`, { method: "POST", headers: headers(cookie) }))).json();
    expect(retried.order).toMatchObject({ status: "paid", canSubmitPhotos: true, attemptsRemaining: 2 });
    expect((await fulfillRoute(fulfillRequest(cookie))).status).toBe(202);
    await fulfillmentQueue().drained();
    expect((await status(cookie)).status).toBe("delivered_to_provider");
  }, 20_000);

  it("retries the email, then records the failure and alerts the owner", async () => {
    vi.stubEnv("MOCK_FORCE_FAILURE", "email");
    resetServerEnvCache();
    const cookie = await paidCookie();
    await fulfillRoute(fulfillRequest(cookie));
    await fulfillmentQueue().drained();
    expect((await status(cookie)).status).toBe("generated_email_failed");
    const [alert] = sent(OWNER);
    expect(alert!.subject).toContain("EMAIL_FAILED");
    expect(alert!.text).toMatch(/enviar email, tentativa 4 de 4/);
    // The buyer is asked to create it again (the notice is a separate, attachment-free email).
    expect(sent("buyer@example.com")).toEqual([expect.objectContaining({ kind: "notice", subject: expect.stringContaining("create it again") })]);
  }, 20_000);

  it("lets only one of two simultaneous submissions in", async () => {
    const cookie = await paidCookie();
    const [a, b] = await Promise.all([fulfillRoute(fulfillRequest(cookie)), fulfillRoute(fulfillRequest(cookie))]);
    const outcomes = await Promise.all([a, b].map(async (response) => (response.status === 202 ? "queued" : (await response.json()).error.code)));
    expect(outcomes.sort()).toEqual(["ALREADY_PROCESSING", "queued"]);
    await fulfillmentQueue().drained();
    expect(sent("buyer@example.com")).toHaveLength(1);
  });

  it("fails a report whose server stopped, once, and sends both emails", async () => {
    vi.useFakeTimers({ now: new Date("2026-10-14T12:00:00Z"), toFake: ["Date"] });
    try {
      const cookie = await paidCookie();
      // Claimed by a server that then stopped: no job holds it, and no heartbeat refreshes it.
      await claimForFulfillment(repository.list()[0]!.id);
      expect(await fulfillmentQueue().sweep()).toBe(0);
      vi.setSystemTime(Date.now() + PROCESSING_LEASE_MS + 1000);
      expect(await fulfillmentQueue().sweep()).toBe(1);
      expect(await fulfillmentQueue().sweep()).toBe(0);
      expect((await status(cookie)).status).toBe("failed_retryable");
      expect(sent("buyer@example.com")).toEqual([expect.objectContaining({ kind: "notice", subject: expect.stringContaining("create it again") })]);
      expect(sent(OWNER)).toEqual([expect.objectContaining({ subject: expect.stringContaining("FULFILLMENT_INTERRUPTED") })]);
    } finally {
      vi.useRealTimers();
    }
  });
});
