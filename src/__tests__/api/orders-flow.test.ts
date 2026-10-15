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
import { applyPaymentFact, claimForFulfillment, markDelivered, markFailed, markInterrupted, touchProcessing } from "@/features/orders/service";
import { PROCESSING_LEASE_MS } from "@/features/orders/states";
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
    // A card order from Brazil is priced in reais, like Pix.
    expect(body).toMatchObject({ alreadyPaid: false, checkout: { mode: "mock" }, price: { amountMinor: 4799, currency: "brl" } });
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

  it("lets a browser buy another report once its last order is finished", async () => {
    // Delivered: a new report is a new purchase.
    const first = await createOrderRoute(post("/api/orders", orderBody));
    let cookie = cookieFrom(first);
    await mockPayRoute(post("/api/dev/mock-pay", { outcome: "succeeded" }, cookie));
    const delivered = repository.list()[0]!;
    await claimForFulfillment(delivered.id);
    await markDelivered(delivered.id, "msg_unit");
    const status = await (await currentOrderRoute(get("/api/orders/current", cookie))).json();
    expect(status.order).toMatchObject({ status: "delivered_to_provider", paid: true, unfinished: false });
    const second = await createOrderRoute(post("/api/orders", orderBody, cookie));
    expect(second.status).toBe(201);
    expect(await second.json()).toMatchObject({ alreadyPaid: false, order: { status: "pending_payment" } });

    // Handed to support (e.g. held for review): the browser isn't locked out of buying either.
    cookie = cookieFrom(second);
    await mockPayRoute(post("/api/dev/mock-pay", { outcome: "succeeded" }, cookie));
    const held = repository.list().find((order) => order.id !== delivered.id)!;
    await claimForFulfillment(held.id);
    await markFailed(held.id, "SIMULATION_QUALITY_FAILED", false);
    const third = await createOrderRoute(post("/api/orders", orderBody, cookie));
    expect(await third.json()).toMatchObject({ alreadyPaid: false, order: { status: "pending_payment" } });
    expect(repository.list()).toHaveLength(3);
  });

  it("keeps a paid, unfinished order from paying again (a retry continues it)", async () => {
    const cookie = cookieFrom(await createOrderRoute(post("/api/orders", orderBody)));
    await mockPayRoute(post("/api/dev/mock-pay", { outcome: "succeeded" }, cookie));
    const [order] = repository.list();
    await claimForFulfillment(order!.id);
    await markFailed(order!.id, "AI_PROVIDER_FAILED", true);
    const again = await (await createOrderRoute(post("/api/orders", orderBody, cookie))).json();
    expect(again).toMatchObject({ alreadyPaid: true, order: { status: "failed_retryable", unfinished: true } });
    expect(repository.list()).toHaveLength(1);
  });

  it("a queued report keeps its claim; one whose server stopped is failed for a new attempt, without paying", async () => {
    vi.useFakeTimers({ now: new Date("2026-10-12T12:00:00Z"), toFake: ["Date"] });
    try {
      const cookie = cookieFrom(await createOrderRoute(post("/api/orders", orderBody)));
      await mockPayRoute(post("/api/dev/mock-pay", { outcome: "succeeded" }, cookie));
      const [order] = repository.list();
      await claimForFulfillment(order!.id);
      const status = async () => (await (await currentOrderRoute(get("/api/orders/current", cookie))).json()).order;

      // The server is alive: its heartbeats keep the claim, past the lease since the claim.
      vi.setSystemTime(Date.now() + PROCESSING_LEASE_MS - 1000);
      await touchProcessing([order!.id]);
      vi.setSystemTime(Date.now() + PROCESSING_LEASE_MS - 1000);
      await expect(claimForFulfillment(order!.id)).rejects.toMatchObject({ code: "ALREADY_PROCESSING" });
      expect(await markInterrupted(order!.id)).toMatchObject({ changed: false });
      expect(await status()).toMatchObject({ status: "processing", canSubmitPhotos: false });

      // Heartbeats stop (a deploy replaced the server): the order is failed once, for a free new attempt.
      vi.setSystemTime(Date.now() + PROCESSING_LEASE_MS + 1000);
      expect(await status()).toMatchObject({ status: "processing", canSubmitPhotos: false });
      const [interrupted, again] = await Promise.all([markInterrupted(order!.id), markInterrupted(order!.id)]);
      expect([interrupted.changed, again.changed].filter(Boolean)).toHaveLength(1);
      expect(await status()).toMatchObject({ status: "failed_retryable", canRequestRetry: true, attemptsRemaining: 2 });
      expect(repository.list()).toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("gives a second tab the checkout already open (same method and email), not a new order", async () => {
    const first = await createOrderRoute(post("/api/orders", orderBody));
    const cookie = cookieFrom(first);
    const again = await createOrderRoute(post("/api/orders", orderBody, cookie));
    expect(again.status).toBe(200);
    expect(await again.json()).toMatchObject({ alreadyPaid: false, checkout: { mode: "mock" }, order: { status: "pending_payment" } });
    expect(repository.list()).toHaveLength(1);

    // A Pix code is shown again as the same code.
    const pix = await createOrderRoute(post("/api/orders", { ...orderBody, method: "pix" }));
    const pixCookie = cookieFrom(pix);
    const code = (await pix.json()).checkout.brCode;
    const samePix = await (await createOrderRoute(post("/api/orders", { ...orderBody, method: "pix" }, pixCookie))).json();
    expect(samePix.checkout.brCode).toBe(code);
    expect(repository.list()).toHaveLength(2);

    // Another email is another purchase.
    const other = await createOrderRoute(post("/api/orders", { ...orderBody, email: "someone.else@example.com" }, cookie));
    expect(other.status).toBe(201);
    expect(repository.list()).toHaveLength(3);
  });

  it("follows an earlier Pix code that was paid after checkout was opened again with another method", async () => {
    const pix = await createOrderRoute(post("/api/orders", { ...orderBody, method: "pix" }));
    const pixCookie = cookieFrom(pix);
    // The buyer switches to card: a new order, but the Pix code may still be paid in the bank app.
    const card = await createOrderRoute(post("/api/orders", orderBody, pixCookie));
    expect(card.status).toBe(201);
    const cardCookie = cookieFrom(card);
    // ...and it is: the bank pays the first code.
    await mockPayRoute(post("/api/dev/mock-pay", { outcome: "succeeded" }, pixCookie));

    const current = await currentOrderRoute(get("/api/orders/current", cardCookie));
    expect(await current.json()).toMatchObject({ order: { status: "paid", unfinished: true }, pending: null });
    expect(current.headers.get("set-cookie")).toMatch(/mxva_order=/);
    const checkoutAgain = await (await createOrderRoute(post("/api/orders", orderBody, cardCookie))).json();
    expect(checkoutAgain).toMatchObject({ alreadyPaid: true, order: { status: "paid" } });
  });

  it("simulates Pix in reais through the same payment path", async () => {
    const created = await createOrderRoute(post("/api/orders", { ...orderBody, method: "pix" }));
    expect(created.status).toBe(201);
    const body = await created.json();
    expect(body.price).toEqual({ amountMinor: 4799, currency: "brl" });
    expect(body.checkout).toMatchObject({ mode: "pix", sandbox: true, simulated: true, brCode: expect.stringContaining("simulated") });
    expect(Date.parse(body.checkout.expiresAt) - Date.now()).toBeGreaterThan(29 * 60_000);
    const cookie = cookieFrom(created);

    const pending = await (await currentOrderRoute(get("/api/orders/current", cookie))).json();
    expect(pending.pending).toEqual({ method: "pix", expiresAt: body.checkout.expiresAt });

    const paid = await (await mockPayRoute(post("/api/dev/mock-pay", { outcome: "succeeded" }, cookie))).json();
    expect(paid.order).toMatchObject({ status: "paid", paid: true, canSubmitPhotos: true });
    expect(repository.list()[0]).toMatchObject({ currency: "brl", amountMinor: 4799, paymentMode: "mock", stripeCheckoutSessionId: null });
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
