import Stripe from "stripe";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as createOrderRoute } from "@/app/api/orders/route";
import { GET as currentOrderRoute } from "@/app/api/orders/current/route";
import { POST as mockPayRoute } from "@/app/api/dev/mock-pay/route";
import { POST as retryRoute } from "@/app/api/fulfill/retry/route";
import { POST as withdrawRoute } from "@/app/api/consent/withdraw/route";
import { POST as webhookRoute } from "@/app/api/stripe/webhook/route";
import { FACE_PROCESSING_CONSENT_VERSION, TERMS_VERSION } from "@/features/onboarding/schema";
import { InMemoryOrderRepository, setOrderRepositoryForTests } from "@/features/orders/repository";
import { applyPaymentFact, claimForFulfillment } from "@/features/orders/service";
import { resetServerEnvCache } from "@/server/config";
import { ApiError } from "@/server/http";
import { resetRateLimitsForTests } from "@/server/security/rate-limit";

const ORIGIN = "http://localhost:3000";

const orderBody = {
  sku: "mxva_report_v1",
  method: "card",
  email: "Buyer@Example.com",
  adultConfirmed: true,
  faceProcessingConsentVersion: FACE_PROCESSING_CONSENT_VERSION,
  termsVersion: TERMS_VERSION,
  marketingOptIn: false,
  countryHint: "BR",
};

function post(path: string, body?: unknown, cookie?: string, headers: Record<string, string> = {}) {
  return new Request(`${ORIGIN}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: ORIGIN,
      "x-mxva-request": "1",
      ...(cookie ? { cookie } : {}),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

const get = (path: string, cookie?: string) =>
  new Request(`${ORIGIN}${path}`, { headers: cookie ? { cookie } : {} });

function cookieFrom(response: Response): string {
  const header = response.headers.get("set-cookie") ?? "";
  return header.split(";")[0]!;
}

let repository: InMemoryOrderRepository;

beforeEach(() => {
  repository = new InMemoryOrderRepository();
  setOrderRepositoryForTests(repository);
  resetRateLimitsForTests();
});

afterEach(() => {
  setOrderRepositoryForTests(undefined);
  resetServerEnvCache();
});

describe("order API (mock payments, development build)", () => {
  it("creates an order with a signed cookie and no personal data in the response", async () => {
    const response = await createOrderRoute(post("/api/orders", orderBody));
    expect(response.status).toBe(201);
    expect(response.headers.get("cache-control")).toContain("no-store");
    const text = await response.clone().text();
    expect(text).not.toMatch(/buyer@example\.com/i);
    const body = await response.json();
    expect(body).toMatchObject({ alreadyPaid: false, checkout: { mode: "mock" }, price: { amountMinor: 2900, currency: "usd" } });
    expect(cookieFrom(response)).toMatch(/^mxva_order=.+\..+$/);
  });

  it("rejects requests without the same-origin header", async () => {
    const response = await createOrderRoute(post("/api/orders", orderBody, undefined, { "x-mxva-request": "0" }));
    expect(response.status).toBe(403);
    expect((await response.json()).error.code).toBe("FORBIDDEN_ORIGIN");
  });

  it("refuses minors and outdated consent", async () => {
    const minor = await createOrderRoute(post("/api/orders", { ...orderBody, adultConfirmed: false }));
    expect((await minor.json()).error.code).toBe("AGE_RESTRICTED");
    const stale = await createOrderRoute(post("/api/orders", { ...orderBody, termsVersion: "2020-01-01.v0" }));
    expect((await stale.json()).error.code).toBe("CONSENT_REQUIRED");
  });

  it("never accepts a client-supplied price or extra fields", async () => {
    const response = await createOrderRoute(post("/api/orders", { ...orderBody, amountMinor: 1 }));
    expect((await response.json()).error.code).toBe("INVALID_REQUEST");
  });

  it("goes from pending to paid only through the payment path", async () => {
    const created = await createOrderRoute(post("/api/orders", orderBody));
    const cookie = cookieFrom(created);

    const pending = await (await currentOrderRoute(get("/api/orders/current", cookie))).json();
    expect(pending.order).toMatchObject({ status: "pending_payment", paid: false, canSubmitPhotos: false });

    const declined = await mockPayRoute(post("/api/dev/mock-pay", { outcome: "declined" }, cookie));
    expect((await declined.json()).error.code).toBe("ORDER_NOT_PAID");

    const paid = await (await mockPayRoute(post("/api/dev/mock-pay", { outcome: "succeeded" }, cookie))).json();
    expect(paid.order).toMatchObject({ status: "paid", paid: true, canSubmitPhotos: true, attemptsRemaining: 3 });

    // Same browser starting checkout again: no second order, no second charge.
    const again = await (await createOrderRoute(post("/api/orders", orderBody, cookie))).json();
    expect(again).toMatchObject({ alreadyPaid: true, order: { status: "paid" } });
  });

  it("simulates Pix in reais through the same payment path", async () => {
    const created = await createOrderRoute(post("/api/orders", { ...orderBody, method: "pix" }));
    expect(created.status).toBe(201);
    const body = await created.json();
    expect(body.price).toEqual({ amountMinor: 3799, currency: "brl" });
    expect(body.checkout).toMatchObject({ mode: "pix", sandbox: true, simulated: true, brCode: expect.stringContaining("simulated") });
    expect(Date.parse(body.checkout.expiresAt) - Date.now()).toBeGreaterThan(29 * 60_000);
    const cookie = cookieFrom(created);

    const pending = await (await currentOrderRoute(get("/api/orders/current", cookie))).json();
    expect(pending.pending).toEqual({ method: "pix", expiresAt: body.checkout.expiresAt });

    const paid = await (await mockPayRoute(post("/api/dev/mock-pay", { outcome: "succeeded" }, cookie))).json();
    expect(paid.order).toMatchObject({ status: "paid", paid: true, canSubmitPhotos: true });
    expect(repository.list()[0]).toMatchObject({ currency: "brl", amountMinor: 3799, paymentMode: "mock", stripeCheckoutSessionId: null });
  });

  it("refuses an unknown payment method", async () => {
    const response = await createOrderRoute(post("/api/orders", { ...orderBody, method: "boleto" }));
    expect((await response.json()).error.code).toBe("INVALID_REQUEST");
  });

  it("returns ORDER_SESSION_INVALID without a valid cookie", async () => {
    const response = await currentOrderRoute(get("/api/orders/current"));
    expect(response.status).toBe(401);
    const forged = await currentOrderRoute(get("/api/orders/current", "mxva_order=eyJ2IjoxfQ.forged"));
    expect((await forged.json()).error.code).toBe("ORDER_SESSION_INVALID");
  });

  it("refuses fulfilment claims before payment (client cannot fake paid=true)", async () => {
    const created = await createOrderRoute(post("/api/orders", orderBody));
    const body = await created.json();
    expect(body.order.paid).toBe(false);
    const [order] = repository.list();
    await expect(claimForFulfillment(order!.id)).rejects.toMatchObject({ code: "ORDER_NOT_PAID" });
    await expect(claimForFulfillment(order!.id)).rejects.toBeInstanceOf(ApiError);
  });

  it("withdraws consent before processing and blocks later processing", async () => {
    const cookie = cookieFrom(await createOrderRoute(post("/api/orders", orderBody)));
    await mockPayRoute(post("/api/dev/mock-pay", { outcome: "succeeded" }, cookie));
    const withdrawn = await (await withdrawRoute(post("/api/consent/withdraw", {}, cookie))).json();
    expect(withdrawn).toMatchObject({ withdrawn: true, order: { status: "withdrawn", canSubmitPhotos: false } });
    const retry = await retryRoute(post("/api/fulfill/retry", {}, cookie));
    expect((await retry.json()).error.code).toBe("ORDER_NOT_RETRYABLE");
  });

  it("keeps the Stripe webhook closed while real payments are disabled", async () => {
    const response = await webhookRoute(post("/api/stripe/webhook", { id: "evt_1" }));
    expect(response.status).toBe(503);
  });
});

describe("payment facts (webhook semantics)", () => {
  it("applies a duplicated payment event exactly once", async () => {
    const cookie = cookieFrom(await createOrderRoute(post("/api/orders", orderBody)));
    expect(cookie).toBeTruthy();
    const order = repository.list()[0]!;
    const fact = {
      kind: "payment_succeeded" as const,
      provider: "mock" as const,
      eventId: "evt_dup",
      orderId: order.id,
      providerRef: order.stripeCheckoutSessionId!,
      paymentIntentId: "pi_1",
      amountMinor: 2900,
      currency: "usd",
    };
    await applyPaymentFact(fact);
    await applyPaymentFact(fact); // same event id: skipped
    await applyPaymentFact({ ...fact, eventId: "evt_other_delivery" }); // different id, same payment: no-op transition
    const types = repository.eventsFor(order.id).map((event) => event.type);
    expect(types.filter((type) => type === "payment_succeeded")).toHaveLength(1);
  });

  it("verifies Stripe signatures over the raw body", async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_dummy");
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_test_secret");
    resetServerEnvCache();
    const { parseStripeWebhook } = await import("@/server/payment/stripe");
    const payload = JSON.stringify({
      id: "evt_123",
      object: "event",
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_123",
          object: "checkout.session",
          client_reference_id: "7a1d3f0e-1b2c-4d5e-8f90-123456789abc",
          payment_status: "paid",
          amount_total: 15000,
          currency: "brl",
          currency_conversion: { amount_subtotal: 2900, amount_total: 2900, fx_rate: "5.17", source_currency: "usd" },
          payment_intent: "pi_123",
          metadata: {},
        },
      },
    });
    const header = Stripe.webhooks.generateTestHeaderString({ payload, secret: "whsec_test_secret" });
    const fact = parseStripeWebhook(payload, header);
    // Adaptive Pricing: the source (USD) amount is what gets checked.
    expect(fact).toMatchObject({ kind: "payment_succeeded", amountMinor: 2900, currency: "usd", paymentIntentId: "pi_123" });
    expect(() => parseStripeWebhook(payload.replace("15000", "1"), header)).toThrow();
    expect(() => parseStripeWebhook(payload, null)).toThrow();
  });
});
