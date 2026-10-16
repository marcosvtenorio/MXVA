import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET as resumeRoute } from "@/app/resume/route";
import { InMemoryOrderRepository, setOrderRepositoryForTests } from "@/features/orders/repository";
import { FULFILLMENT_VERSION, type Order } from "@/features/orders/states";
import { resetServerEnvCache } from "@/server/config";
import * as pipeline from "@/server/fulfillment/pipeline";
import { FulfillmentQueue, classifyFailure, describeError } from "@/server/fulfillment/queue";
import { ApiError } from "@/server/http";
import { mockSentEmails } from "@/server/mail/email-adapter";
import { validateUploadedPhoto } from "@/server/photos/validate";
import { createResumeToken, verifyResumeToken } from "@/server/security/resume-token";
import { verifyOrderSessionToken } from "@/server/security/session";
import { resetRateLimitsForTests } from "@/server/security/rate-limit";

const frontBytes = readFileSync(new URL("../../../e2e/fixtures/synthetic-front.jpg", import.meta.url));

function providerError(status: number, extra: Record<string, unknown> = {}): Error {
  return Object.assign(new Error(`provider said ${status}`), { name: "APIError", status, ...extra });
}

function paidProcessingOrder(): Order {
  const now = new Date().toISOString();
  return {
    id: randomUUID(),
    version: 3,
    paymentMode: "mock",
    stripeCheckoutSessionId: `mock_cs_${randomUUID()}`,
    stripePaymentIntentId: null,
    providerChargeId: null,
    chargeExpiresAt: null,
    providerBrCode: null,
    email: "buyer@example.com",
    currency: "usd",
    amountMinor: 2900,
    countryHint: "US",
    priceVariant: "usd_29",
    status: "processing",
    consentVersion: "x",
    termsVersion: "x",
    marketingOptIn: false,
    createdAt: now,
    paidAt: now,
    fulfillmentAttempts: 1,
    processingStartedAt: now,
    emailProviderMessageId: null,
    lastFailureCode: null,
    fulfillmentVersion: FULFILLMENT_VERSION,
    completedAt: null,
    refundedAt: null,
  };
}

let repository: InMemoryOrderRepository;

async function queued(queue: FulfillmentQueue): Promise<Order> {
  const order = paidProcessingOrder();
  await repository.create(order, { type: "fulfillment_claimed", from: "paid", to: "processing", at: order.createdAt });
  const front = await validateUploadedPhoto(new File([frontBytes], "front.jpg", { type: "image/jpeg" }), 8 * 1024 * 1024);
  queue.enqueue({ order, front, profiles: [], constraints: { dailyMinutes: "30", avoid: [] } });
  return order;
}

beforeEach(() => {
  repository = new InMemoryOrderRepository();
  setOrderRepositoryForTests(repository);
  resetRateLimitsForTests();
  mockSentEmails().length = 0;
  vi.stubEnv("OWNER_ALERT_EMAIL", "owner@example.com");
  resetServerEnvCache();
  vi.spyOn(console, "info").mockImplementation(() => undefined);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  resetServerEnvCache();
  setOrderRepositoryForTests(undefined);
});

describe("failure classification", () => {
  it("retries provider hiccups and rate limits, honouring Retry-After", () => {
    expect(classifyFailure(providerError(500))).toMatchObject({ code: "AI_PROVIDER_FAILED", retry: true, notice: "regenerate" });
    const limited = classifyFailure(providerError(429, { headers: new Headers({ "retry-after": "20" }) }));
    expect(limited).toMatchObject({ retry: true, retryAfterMs: 20_000 });
    expect(classifyFailure(new TypeError("fetch failed"))).toMatchObject({ code: "AI_PROVIDER_FAILED", retry: true });
  });

  it("doesn't retry what waiting can't fix: an empty balance, a bad request, missing settings", () => {
    expect(classifyFailure(providerError(429, { code: "insufficient_quota" }))).toMatchObject({ retry: false, notice: "regenerate" });
    expect(classifyFailure(providerError(400))).toMatchObject({ retry: false });
    expect(classifyFailure(providerError(401))).toMatchObject({ retry: false });
    expect(classifyFailure(new ApiError("SERVICE_UNAVAILABLE"))).toMatchObject({ retry: false });
  });

  it("asks for another photo, or a person, when the photo is the problem", () => {
    expect(classifyFailure(new ApiError("PHOTO_QUALITY_INSUFFICIENT", "We need a front photo with just you in it."))).toMatchObject({
      retry: false,
      notice: "photo",
      reason: "We need a front photo with just you in it.",
    });
    expect(classifyFailure(new ApiError("SIMULATION_QUALITY_FAILED"))).toMatchObject({ retry: true, notice: "photo" });
    expect(classifyFailure(new pipeline.NeedsHumanReview("AGE_RESTRICTED"))).toMatchObject({ code: "AGE_RESTRICTED", retry: false, notice: "review" });
  });

  it("keeps emails, keys and image data out of the owner's log", () => {
    const detail = describeError(
      Object.assign(new Error(`bad input for buyer@example.com with sk-proj-abcdefghijklmnop data:image/jpeg;base64,/9j/${"A".repeat(400)}`), {
        status: 400,
        requestID: "req_123",
      }),
    );
    expect(detail).toContain("HTTP 400");
    expect(detail).toContain("request=req_123");
    expect(detail).not.toMatch(/buyer@example\.com|sk-proj|base64|AAAAAAAAAA/);
  });
});

describe("queue retries", () => {
  it("retries a rate-limited report after the pause, then emails it", async () => {
    const generate = pipeline.generateReport;
    let calls = 0;
    vi.spyOn(pipeline, "generateReport").mockImplementation(async (args) => {
      if (++calls === 1) throw providerError(429, { headers: new Headers({ "retry-after": "0.05" }) });
      return generate(args);
    });
    const queue = new FulfillmentQueue({ concurrency: 1, maxQueued: 10, retryDelayMs: 10 });
    const order = await queued(queue);
    await queue.drained();
    expect(calls).toBe(2);
    expect(await repository.findById(order.id)).toMatchObject({ status: "delivered_to_provider" });
    expect(mockSentEmails()).toEqual([
      expect.objectContaining({ kind: "report", to: "buyer@example.com" }),
      expect.objectContaining({ kind: "notice", to: "owner@example.com", subject: expect.stringContaining("Relatório entregue") }),
    ]);
  });

  it("waits out a busy AI provider without spending the report's tries", async () => {
    const generate = pipeline.generateReport;
    let calls = 0;
    vi.spyOn(pipeline, "generateReport").mockImplementation(async (args) => {
      if (++calls <= 5) throw providerError(429, { headers: new Headers({ "retry-after": "0.01" }) });
      return generate(args);
    });
    const queue = new FulfillmentQueue({ concurrency: 1, maxQueued: 10, retryDelayMs: 10 });
    const order = await queued(queue);
    await queue.drained();
    expect(calls).toBe(6);
    expect(await repository.findById(order.id)).toMatchObject({ status: "delivered_to_provider" });
  });

  it("keeps the photo analysis between tries, so a retry doesn't pay for it again", async () => {
    const vision = await import("@/server/ai/vision-adapter");
    const real = vision.visionProvider();
    const observe = vi.fn((input: Parameters<typeof real.observe>[0]) => real.observe(input));
    vi.spyOn(vision, "visionProvider").mockReturnValue({ simulated: real.simulated, observe });
    const editor = await import("@/server/ai/image-edit-adapter");
    const realEditor = editor.imageEditProvider();
    let edits = 0;
    vi.spyOn(editor, "imageEditProvider").mockReturnValue({
      simulated: realEditor.simulated,
      edit: async (input) => {
        if (++edits <= 2) throw providerError(429, { headers: new Headers({ "retry-after": "0.01" }) });
        return realEditor.edit(input);
      },
    });
    const queue = new FulfillmentQueue({ concurrency: 1, maxQueued: 10, retryDelayMs: 10 });
    const order = await queued(queue);
    await queue.drained();
    expect(edits).toBe(3);
    expect(observe).toHaveBeenCalledTimes(1);
    expect(await repository.findById(order.id)).toMatchObject({ status: "delivered_to_provider" });
  });

  it("gives up at once on an empty AI balance: the buyer gets a link, the owner the cause", async () => {
    vi.spyOn(pipeline, "generateReport").mockRejectedValue(providerError(429, { code: "insufficient_quota" }));
    const queue = new FulfillmentQueue({ concurrency: 1, maxQueued: 10, retryDelayMs: 10 });
    const order = await queued(queue);
    await queue.drained();
    expect(pipeline.generateReport).toHaveBeenCalledTimes(1);
    expect(await repository.findById(order.id)).toMatchObject({ status: "failed_retryable", lastFailureCode: "AI_PROVIDER_FAILED" });
    const [notice, alert] = mockSentEmails();
    expect(notice).toMatchObject({ to: "buyer@example.com", subject: expect.stringContaining("create it again") });
    expect(alert).toMatchObject({ to: "owner@example.com" });
    expect(alert!.text).toContain("code=insufficient_quota");
  });

  it("refuses new work when full, before a payment's attempt is spent", async () => {
    vi.spyOn(pipeline, "generateReport").mockImplementation(() => new Promise(() => undefined));
    const queue = new FulfillmentQueue({ concurrency: 1, maxQueued: 2, retryDelayMs: 10 });
    await queued(queue);
    await queued(queue);
    expect(() => queue.assertCapacity()).toThrow(expect.objectContaining({ code: "QUEUE_FULL" }));
  });
});

describe("the email link to create a report again", () => {
  it("signs in to the paid order on any device and opens the processing page", async () => {
    const order = paidProcessingOrder();
    await repository.create(order, { type: "created", from: null, to: "processing", at: order.createdAt });
    const response = await resumeRoute(new Request(`http://localhost:3000/resume?t=${createResumeToken(order.id)}`));
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("/processing");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    const cookie = response.headers.get("set-cookie") ?? "";
    expect(verifyOrderSessionToken(cookie.split(";")[0]!.split("=").slice(1).join("="))?.oid).toBe(order.id);
  });

  it("sends a broken, tampered or expired link to Help, and never accepts an order cookie as a link", async () => {
    const order = paidProcessingOrder();
    await repository.create(order, { type: "created", from: null, to: "processing", at: order.createdAt });
    const token = createResumeToken(order.id);
    const tampered = `${token.slice(0, -2)}xx`;
    const expired = createResumeToken(order.id, Math.floor(Date.now() / 1000) - 8 * 24 * 3600);
    for (const t of ["", "junk", tampered, expired]) {
      const response = await resumeRoute(new Request(`http://localhost:3000/resume?t=${encodeURIComponent(t)}`));
      expect(response.headers.get("location")).toBe("/help#expired-link");
      expect(response.headers.get("set-cookie")).toBeNull();
    }
    expect(verifyResumeToken(token)).toBe(order.id);
    const { createOrderSessionToken } = await import("@/server/security/session");
    expect(verifyResumeToken(createOrderSessionToken(order.id))).toBeUndefined();
    expect(verifyOrderSessionToken(token)).toBeUndefined();
  });
});
