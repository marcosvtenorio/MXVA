import type { ApiErrorCode } from "@/lib/api-errors";

/**
 * Order lifecycle (metadata only). Pure transition functions: every state change in
 * the app goes through here, so duplicate webhooks or double submits cannot skip or
 * repeat a step.
 *
 *   pending_payment ──payment──▶ paid ──claim──▶ processing ──▶ delivered_to_provider
 *         │                       ▲                │
 *         └─expire─▶ expired      │ retry          ├─▶ generated_email_failed ─┐
 *                                 └────────────────├─▶ failed_retryable ───────┤
 *                                                  └─▶ needs_support           │
 *   any paid state ──refund──▶ refunded           (retry resets to paid) ◀─────┘
 */

export const ORDER_STATUSES = [
  "pending_payment",
  "paid",
  "processing",
  "delivered_to_provider",
  "generated_email_failed",
  "failed_retryable",
  "needs_support",
  "refunded",
  "expired",
  "withdrawn",
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const MAX_FULFILLMENT_ATTEMPTS = 3;
/** A running fulfilment refreshes its claim this often (the heartbeat in /api/fulfill). */
export const PROCESSING_HEARTBEAT_MS = 20_000;
/**
 * A processing claim not refreshed for this long belongs to a server that stopped mid-report
 * (a deploy replaced it, it crashed) and may be re-claimed: the buyer's page then carries on
 * with a new attempt, without a second charge.
 */
export const PROCESSING_LEASE_MS = 90_000;
export const FULFILLMENT_VERSION = "report-v1";

export type Order = {
  id: string;
  /** Optimistic-concurrency counter; every save must match the version it read. */
  version: number;
  paymentMode: "mock" | "stripe" | "abacatepay";
  stripeCheckoutSessionId: string | null;
  stripePaymentIntentId: string | null;
  /** AbacatePay PIX charge id (transparent checkout). */
  providerChargeId: string | null;
  chargeExpiresAt: string | null;
  email: string;
  currency: "usd" | "brl";
  amountMinor: number;
  countryHint: string | null;
  priceVariant: string;
  status: OrderStatus;
  consentVersion: string;
  termsVersion: string;
  marketingOptIn: boolean;
  createdAt: string;
  paidAt: string | null;
  fulfillmentAttempts: number;
  processingStartedAt: string | null;
  emailProviderMessageId: string | null;
  lastFailureCode: string | null;
  fulfillmentVersion: string;
  completedAt: string | null;
  refundedAt: string | null;
};

export type OrderEventType =
  | "created"
  | "payment_succeeded"
  | "checkout_expired"
  | "fulfillment_claimed"
  | "fulfillment_delivered"
  | "email_failed"
  | "fulfillment_failed"
  | "retry_requested"
  | "refunded"
  | "consent_withdrawn";

export type OrderEvent = { type: OrderEventType; from: OrderStatus | null; to: OrderStatus; at: string };

export class OrderTransitionError extends Error {
  override readonly name = "OrderTransitionError";
  constructor(readonly code: ApiErrorCode, message?: string) {
    super(message ?? code);
  }
}

export type TransitionResult = { order: Order; event?: OrderEvent };

const PAID_STATES: readonly OrderStatus[] = [
  "paid",
  "processing",
  "delivered_to_provider",
  "generated_email_failed",
  "failed_retryable",
  "needs_support",
];

export function isPaidStatus(status: OrderStatus): boolean {
  return PAID_STATES.includes(status) || status === "refunded";
}

const UNFINISHED_STATES: readonly OrderStatus[] = ["paid", "processing", "failed_retryable", "generated_email_failed"];

/**
 * Paid, and the buyer can still get this report without paying again (a retry, a reselected
 * photo, a report already being made). Such an order blocks a second checkout. A finished
 * order (delivered, refunded, withdrawn, or handed to support) does not: the buyer may buy
 * another report.
 */
export function isUnfinishedPaidStatus(status: OrderStatus): boolean {
  return UNFINISHED_STATES.includes(status);
}

function move(order: Order, to: OrderStatus, type: OrderEventType, now: Date, patch: Partial<Order> = {}): TransitionResult {
  const at = now.toISOString();
  return {
    order: { ...order, ...patch, status: to, version: order.version + 1 },
    event: { type, from: order.status, to, at },
  };
}

export function paymentSucceeded(
  order: Order,
  payment: { amountMinor: number; currency: string; paymentIntentId: string | null },
  now: Date,
): TransitionResult {
  const matchesSku =
    payment.amountMinor === order.amountMinor && payment.currency.toLowerCase() === order.currency;
  if (!matchesSku && (order.status === "pending_payment" || order.status === "expired")) {
    // Never grant an automatic entitlement for a payment that doesn't match the approved
    // SKU price; a human reconciles it (refund or manual fulfilment).
    return move(order, "needs_support", "payment_succeeded", now, {
      paidAt: now.toISOString(),
      stripePaymentIntentId: payment.paymentIntentId ?? order.stripePaymentIntentId,
      lastFailureCode: "PAYMENT_MISMATCH",
    });
  }
  if (order.status === "pending_payment" || order.status === "expired") {
    return move(order, "paid", "payment_succeeded", now, {
      paidAt: now.toISOString(),
      stripePaymentIntentId: payment.paymentIntentId ?? order.stripePaymentIntentId,
    });
  }
  if (order.status === "withdrawn") {
    // Paid after withdrawing consent: a human refunds it; nothing is processed.
    return move(order, "needs_support", "payment_succeeded", now, {
      paidAt: now.toISOString(),
      stripePaymentIntentId: payment.paymentIntentId ?? order.stripePaymentIntentId,
      lastFailureCode: "PAID_AFTER_WITHDRAWAL",
    });
  }
  // Already paid (duplicate webhook, browser poll racing the webhook): no change.
  return { order };
}

export function checkoutExpired(order: Order, now: Date): TransitionResult {
  return order.status === "pending_payment" ? move(order, "expired", "checkout_expired", now) : { order };
}

export function claimFulfillment(order: Order, now: Date): TransitionResult {
  switch (order.status) {
    case "pending_payment":
    case "expired":
      throw new OrderTransitionError("ORDER_NOT_PAID");
    case "withdrawn":
      throw new OrderTransitionError("CONSENT_REQUIRED");
    case "refunded":
    case "needs_support":
    case "delivered_to_provider":
      throw new OrderTransitionError("ORDER_NOT_RETRYABLE");
    case "generated_email_failed":
    case "failed_retryable":
      // The buyer asks for a retry first (POST /api/fulfill/retry), which resets to paid.
      throw new OrderTransitionError("ORDER_NOT_RETRYABLE", "Request a retry before resubmitting photos.");
    case "processing": {
      const started = order.processingStartedAt ? Date.parse(order.processingStartedAt) : 0;
      if (now.getTime() - started < PROCESSING_LEASE_MS) throw new OrderTransitionError("ALREADY_PROCESSING");
      break; // stale lease: a crashed attempt, may be re-claimed below
    }
    case "paid":
      break;
  }
  if (order.fulfillmentAttempts >= MAX_FULFILLMENT_ATTEMPTS) {
    return move(order, "needs_support", "fulfillment_failed", now, { lastFailureCode: "ATTEMPTS_EXHAUSTED" });
  }
  return move(order, "processing", "fulfillment_claimed", now, {
    fulfillmentAttempts: order.fulfillmentAttempts + 1,
    processingStartedAt: now.toISOString(),
  });
}

export function fulfillmentDelivered(order: Order, messageId: string, now: Date): TransitionResult {
  if (order.status !== "processing") return { order };
  return move(order, "delivered_to_provider", "fulfillment_delivered", now, {
    emailProviderMessageId: messageId,
    completedAt: now.toISOString(),
    processingStartedAt: null,
    lastFailureCode: null,
  });
}

export function emailFailed(order: Order, now: Date): TransitionResult {
  if (order.status !== "processing") return { order };
  return move(order, "generated_email_failed", "email_failed", now, {
    lastFailureCode: "EMAIL_FAILED",
    processingStartedAt: null,
  });
}

export function fulfillmentFailed(order: Order, code: ApiErrorCode, retryable: boolean, now: Date): TransitionResult {
  if (order.status !== "processing") return { order };
  const exhausted = order.fulfillmentAttempts >= MAX_FULFILLMENT_ATTEMPTS;
  return move(order, retryable && !exhausted ? "failed_retryable" : "needs_support", "fulfillment_failed", now, {
    lastFailureCode: code,
    processingStartedAt: null,
  });
}

export function retryRequested(order: Order, now: Date): TransitionResult {
  if (order.status === "paid") return { order };
  if (order.status !== "failed_retryable" && order.status !== "generated_email_failed") {
    throw new OrderTransitionError("ORDER_NOT_RETRYABLE");
  }
  if (order.fulfillmentAttempts >= MAX_FULFILLMENT_ATTEMPTS) {
    return move(order, "needs_support", "retry_requested", now, { lastFailureCode: "ATTEMPTS_EXHAUSTED" });
  }
  return move(order, "paid", "retry_requested", now);
}

export function refunded(order: Order, now: Date): TransitionResult {
  if (order.status === "refunded" || !isPaidStatus(order.status)) return { order };
  return move(order, "refunded", "refunded", now, { refundedAt: now.toISOString(), processingStartedAt: null });
}

export function consentWithdrawn(order: Order, now: Date): TransitionResult {
  switch (order.status) {
    case "pending_payment":
    case "paid":
    case "failed_retryable":
    case "generated_email_failed":
    case "expired":
      return move(order, "withdrawn", "consent_withdrawn", now);
    case "processing":
      throw new OrderTransitionError("ALREADY_PROCESSING", "Processing has already started and can't be halted.");
    default:
      // Delivered, refunded, already withdrawn or with support: nothing left to halt.
      return { order };
  }
}

/** What the browser may know about an order. No email, ids or provider references. */
export type PublicOrderStatus = {
  status: OrderStatus;
  paid: boolean;
  /** Paid and not finished: the browser continues this order instead of paying again. */
  unfinished: boolean;
  canSubmitPhotos: boolean;
  canRequestRetry: boolean;
  attemptsRemaining: number;
  deliveredToEmail: boolean;
};

export function publicStatus(order: Order, now = new Date()): PublicOrderStatus {
  const staleProcessing =
    order.status === "processing" &&
    now.getTime() - Date.parse(order.processingStartedAt ?? order.createdAt) >= PROCESSING_LEASE_MS;
  const attemptsRemaining = Math.max(0, MAX_FULFILLMENT_ATTEMPTS - order.fulfillmentAttempts);
  return {
    status: order.status,
    paid: isPaidStatus(order.status) && order.status !== "refunded",
    unfinished: isUnfinishedPaidStatus(order.status),
    canSubmitPhotos: (order.status === "paid" || staleProcessing) && attemptsRemaining > 0,
    canRequestRetry:
      (order.status === "failed_retryable" || order.status === "generated_email_failed") && attemptsRemaining > 0,
    attemptsRemaining,
    deliveredToEmail: order.status === "delivered_to_provider",
  };
}
