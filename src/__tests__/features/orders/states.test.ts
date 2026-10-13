import { describe, expect, it } from "vitest";
import {
  MAX_FULFILLMENT_ATTEMPTS,
  PROCESSING_LEASE_MS,
  OrderTransitionError,
  checkoutExpired,
  claimFulfillment,
  consentWithdrawn,
  emailFailed,
  fulfillmentDelivered,
  fulfillmentFailed,
  paymentSucceeded,
  publicStatus,
  refunded,
  retryRequested,
  type Order,
} from "@/features/orders/states";

const now = new Date("2026-10-11T12:00:00Z");
const later = (ms: number) => new Date(now.getTime() + ms);

const base: Order = {
  id: "7a1d3f0e-1b2c-4d5e-8f90-123456789abc",
  version: 1,
  paymentMode: "mock",
  stripeCheckoutSessionId: "cs_1",
  stripePaymentIntentId: null,
  providerChargeId: null,
  chargeExpiresAt: null,
  providerBrCode: null,
  email: "buyer@example.com",
  currency: "usd",
  amountMinor: 2900,
  countryHint: "BR",
  priceVariant: "usd_29",
  status: "pending_payment",
  consentVersion: "v",
  termsVersion: "v",
  marketingOptIn: false,
  createdAt: now.toISOString(),
  paidAt: null,
  fulfillmentAttempts: 0,
  processingStartedAt: null,
  emailProviderMessageId: null,
  lastFailureCode: null,
  fulfillmentVersion: "report-v1",
  completedAt: null,
  refundedAt: null,
};

const pay = (order: Order) => paymentSucceeded(order, { amountMinor: 2900, currency: "usd", paymentIntentId: "pi_1" }, now).order;

const expectCode = (fn: () => unknown, code: string) => {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(OrderTransitionError);
    expect((error as OrderTransitionError).code).toBe(code);
    return;
  }
  throw new Error(`expected ${code}`);
};

describe("order state machine", () => {
  it("marks a matching payment as paid exactly once", () => {
    const first = paymentSucceeded(base, { amountMinor: 2900, currency: "USD", paymentIntentId: "pi_1" }, now);
    expect(first.order.status).toBe("paid");
    expect(first.event?.type).toBe("payment_succeeded");
    const duplicate = paymentSucceeded(first.order, { amountMinor: 2900, currency: "usd", paymentIntentId: "pi_1" }, now);
    expect(duplicate.event).toBeUndefined();
    expect(duplicate.order).toBe(first.order);
  });

  it("never grants an automatic entitlement for a mismatched amount or currency", () => {
    const wrongAmount = paymentSucceeded(base, { amountMinor: 100, currency: "usd", paymentIntentId: "pi_x" }, now);
    expect(wrongAmount.order.status).toBe("needs_support");
    expect(wrongAmount.order.lastFailureCode).toBe("PAYMENT_MISMATCH");
    expect(publicStatus(wrongAmount.order).canSubmitPhotos).toBe(false);
    const wrongCurrency = paymentSucceeded(base, { amountMinor: 2900, currency: "brl", paymentIntentId: "pi_x" }, now);
    expect(wrongCurrency.order.status).toBe("needs_support");
  });

  it("refuses fulfilment before payment", () => {
    expectCode(() => claimFulfillment(base, now), "ORDER_NOT_PAID");
    expectCode(() => claimFulfillment(checkoutExpired(base, now).order, now), "ORDER_NOT_PAID");
  });

  it("allows one claim at a time, and reclaims a stale processing lease", () => {
    const claimed = claimFulfillment(pay(base), now).order;
    expect(claimed.status).toBe("processing");
    expect(claimed.fulfillmentAttempts).toBe(1);
    expectCode(() => claimFulfillment(claimed, later(1000)), "ALREADY_PROCESSING");
    const reclaimed = claimFulfillment(claimed, later(PROCESSING_LEASE_MS + 1)).order;
    expect(reclaimed.status).toBe("processing");
    expect(reclaimed.fulfillmentAttempts).toBe(2);
  });

  it("delivers, or records an email failure, only from processing", () => {
    const claimed = claimFulfillment(pay(base), now).order;
    const delivered = fulfillmentDelivered(claimed, "msg_1", now).order;
    expect(delivered.status).toBe("delivered_to_provider");
    expect(delivered.emailProviderMessageId).toBe("msg_1");
    expect(fulfillmentDelivered(delivered, "msg_2", now).event).toBeUndefined();
    expect(emailFailed(claimed, now).order.status).toBe("generated_email_failed");
    expectCode(() => claimFulfillment(delivered, now), "ORDER_NOT_RETRYABLE");
  });

  it("retries a retryable failure until attempts run out, then needs support", () => {
    let order = pay(base);
    for (let attempt = 1; attempt <= MAX_FULFILLMENT_ATTEMPTS; attempt++) {
      order = claimFulfillment(order, now).order;
      order = fulfillmentFailed(order, "AI_PROVIDER_FAILED", true, now).order;
      if (attempt < MAX_FULFILLMENT_ATTEMPTS) {
        expect(order.status).toBe("failed_retryable");
        expectCode(() => claimFulfillment(order, now), "ORDER_NOT_RETRYABLE");
        order = retryRequested(order, now).order;
        expect(order.status).toBe("paid");
      }
    }
    expect(order.status).toBe("needs_support");
    expect(publicStatus(order).canRequestRetry).toBe(false);
  });

  it("sends a non-retryable failure straight to support", () => {
    const claimed = claimFulfillment(pay(base), now).order;
    expect(fulfillmentFailed(claimed, "SIMULATION_QUALITY_FAILED", false, now).order.status).toBe("needs_support");
  });

  it("halts unstarted processing on consent withdrawal, but not running work", () => {
    expect(consentWithdrawn(pay(base), now).order.status).toBe("withdrawn");
    expectCode(() => consentWithdrawn(claimFulfillment(pay(base), now).order, now), "ALREADY_PROCESSING");
    const withdrawn = consentWithdrawn(base, now).order;
    expectCode(() => claimFulfillment(withdrawn, now), "CONSENT_REQUIRED");
    // Paying after withdrawing routes to a human (refund), never to processing.
    expect(pay(withdrawn).status).toBe("needs_support");
  });

  it("refunds paid orders and ignores unpaid ones", () => {
    expect(refunded(pay(base), now).order.status).toBe("refunded");
    expect(refunded(base, now).event).toBeUndefined();
  });

  it("exposes no personal data in the public status", () => {
    const view = JSON.stringify(publicStatus(pay(base)));
    expect(view).not.toContain("buyer@example.com");
    expect(view).not.toContain(base.id);
    expect(view).not.toContain("pi_1");
  });
});
