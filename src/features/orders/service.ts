import "server-only";
import { randomUUID } from "node:crypto";
import type { ApiErrorCode } from "@/lib/api-errors";
import { paymentOffer, providerIsSandbox, sandboxToolsAllowed, serverEnv, type PaymentMethod } from "@/server/config";
import { trackServer } from "@/server/analytics";
import { ApiError } from "@/server/http";
import { paymentProvider, type CheckoutInit, type PaymentFact } from "@/server/payment/adapter";
import { readOrderCookie, verifyOrderSessionToken } from "@/server/security/session";
import { orderRepository } from "./repository";
import {
  FULFILLMENT_VERSION,
  OrderTransitionError,
  checkoutExpired,
  claimFulfillment,
  consentWithdrawn,
  emailFailed,
  fulfillmentDelivered,
  fulfillmentFailed,
  isPaidStatus,
  paymentSucceeded,
  refunded,
  retryRequested,
  type Order,
  type TransitionResult,
} from "./states";

export const SKU = "mxva_report_v1";

export type CreateOrderInput = {
  method: PaymentMethod;
  email: string;
  consentVersion: string;
  termsVersion: string;
  marketingOptIn: boolean;
  countryHint: string | null;
  returnUrl: string;
};

/**
 * Server-authoritative price. The browser never sends or chooses an amount.
 * PIX is charged in reais (only payable from a Brazilian bank account); card in dollars.
 */
export function currentPrice(method: PaymentMethod): { amountMinor: number; currency: "usd" | "brl"; priceVariant: string } {
  const env = serverEnv();
  if (method === "pix") return { amountMinor: env.PRICE_BRL_CENTS, currency: "brl", priceVariant: `brl_${env.PRICE_BRL_CENTS}` };
  return { amountMinor: env.PRICE_USD_CENTS, currency: "usd", priceVariant: env.PRICE_VARIANT };
}

/** PIX orders carry a charge id; card orders a checkout session id. */
export function orderMethod(order: Order): PaymentMethod {
  return order.providerChargeId ? "pix" : "card";
}

/** Shorter than this left on a PIX code, another tab gets a fresh one instead. */
const PIX_REUSE_MIN_MS = 2 * 60_000;

/** A pending PIX order whose code can still be paid in a bank app. */
export function hasPayablePixCharge(order: Order, now = Date.now()): boolean {
  return order.status === "pending_payment" && Boolean(order.providerChargeId) && Date.parse(order.chargeExpiresAt ?? "") > now;
}

/**
 * One open checkout per browser. Another tab (or a return to checkout) asking for the same
 * method and email gets the checkout that is already open, so every tab pays the same order:
 * no card form goes stale and no second PIX code is issued. Undefined when it can't be reused.
 */
export async function reusableCheckout(order: Order, method: PaymentMethod, email: string): Promise<CheckoutInit | undefined> {
  if (order.status !== "pending_payment" || orderMethod(order) !== method || order.email !== email) return undefined;
  if (method === "pix") {
    if (!order.providerChargeId || !order.providerBrCode || !order.chargeExpiresAt) return undefined;
    if (Date.parse(order.chargeExpiresAt) - Date.now() < PIX_REUSE_MIN_MS) return undefined;
    const simulated = order.paymentMode === "mock";
    const sandbox = simulated || providerIsSandbox("abacatepay");
    return {
      mode: "pix",
      chargeId: order.providerChargeId,
      brCode: order.providerBrCode,
      expiresAt: order.chargeExpiresAt,
      sandbox,
      simulated,
      canSimulate: simulated || (sandbox && sandboxToolsAllowed()),
    };
  }
  if (!order.stripeCheckoutSessionId) return undefined;
  if (order.paymentMode === "mock") return { mode: "mock", checkoutSessionId: order.stripeCheckoutSessionId };
  if (order.paymentMode !== "stripe") return undefined;
  const { openSessionClientSecret } = await import("@/server/payment/stripe");
  const clientSecret = await openSessionClientSecret(order.stripeCheckoutSessionId);
  return clientSecret ? { mode: "stripe", checkoutSessionId: order.stripeCheckoutSessionId, clientSecret } : undefined;
}

/**
 * An earlier PIX order this browser was shown, if it got paid after a newer checkout replaced it
 * (e.g. the buyer paid the first code in the bank app, then opened checkout again). The browser
 * then follows that paid order instead of the newer, unpaid one.
 */
export async function paidPreviousOrder(request: Request): Promise<Order | undefined> {
  const previousId = verifyOrderSessionToken(readOrderCookie(request))?.prv;
  if (!previousId) return undefined;
  const previous = await (await orderRepository()).findById(previousId);
  if (!previous) return undefined;
  const fresh = await refreshPaymentStatus(previous).catch(() => previous);
  return isPaidStatus(fresh.status) && fresh.status !== "refunded" ? fresh : undefined;
}

export async function createOrder(input: CreateOrderInput): Promise<{ order: Order; checkout: CheckoutInit }> {
  const offer = paymentOffer(input.method);
  if (!offer) throw new ApiError("SERVICE_UNAVAILABLE", "This payment method isn't available right now. Try the other one, or check back soon.");
  const provider = await paymentProvider(offer);
  const repository = await orderRepository();
  const price = currentPrice(input.method);
  const now = new Date();
  const id = randomUUID();

  const checkout = await provider.createCheckout({
    orderId: id,
    email: input.email,
    method: input.method,
    amountMinor: price.amountMinor,
    currency: price.currency,
    priceVariant: price.priceVariant,
    returnUrl: input.returnUrl,
  });

  const order: Order = {
    id,
    version: 1,
    paymentMode: provider.mode,
    stripeCheckoutSessionId: checkout.mode === "pix" ? null : checkout.checkoutSessionId,
    stripePaymentIntentId: null,
    providerChargeId: checkout.mode === "pix" ? checkout.chargeId : null,
    chargeExpiresAt: checkout.mode === "pix" ? checkout.expiresAt : null,
    providerBrCode: checkout.mode === "pix" ? checkout.brCode : null,
    email: input.email,
    currency: price.currency,
    amountMinor: price.amountMinor,
    countryHint: input.countryHint,
    priceVariant: price.priceVariant,
    status: "pending_payment",
    consentVersion: input.consentVersion,
    termsVersion: input.termsVersion,
    marketingOptIn: input.marketingOptIn,
    createdAt: now.toISOString(),
    paidAt: null,
    fulfillmentAttempts: 0,
    processingStartedAt: null,
    emailProviderMessageId: null,
    lastFailureCode: null,
    fulfillmentVersion: FULFILLMENT_VERSION,
    completedAt: null,
    refundedAt: null,
  };
  await repository.create(order, { type: "created", from: null, to: "pending_payment", at: now.toISOString() });
  return { order, checkout };
}

/**
 * Read-modify-write with compare-and-set. Concurrent writers re-read and re-apply the
 * transition, so e.g. two simultaneous fulfilment claims yield exactly one winner.
 */
async function mutate(orderId: string, transition: (order: Order, now: Date) => TransitionResult): Promise<Order> {
  const repository = await orderRepository();
  for (let attempt = 0; attempt < 5; attempt++) {
    const current = await repository.findById(orderId);
    if (!current) throw new ApiError("ORDER_SESSION_INVALID");
    let result: TransitionResult;
    try {
      result = transition(current, new Date());
    } catch (error) {
      if (error instanceof OrderTransitionError) throw new ApiError(error.code);
      throw error;
    }
    if (!result.event) return result.order;
    if (await repository.save(result.order, current.version, result.event)) return result.order;
  }
  throw new ApiError("ALREADY_PROCESSING");
}

async function findByProviderRef(provider: PaymentFact["provider"], providerRef: string): Promise<Order | undefined> {
  const repository = await orderRepository();
  if (provider === "abacatepay") return repository.findByProviderChargeId(providerRef);
  if (provider === "stripe") return repository.findByCheckoutSessionId(providerRef);
  return (await repository.findByCheckoutSessionId(providerRef)) ?? (await repository.findByProviderChargeId(providerRef));
}

function refMatches(order: Order, providerRef: string): boolean {
  return order.stripeCheckoutSessionId === providerRef || order.providerChargeId === providerRef;
}

export async function applyPaymentFact(fact: PaymentFact): Promise<Order | undefined> {
  const repository = await orderRepository();
  const ledger = fact.provider === "abacatepay" ? "abacatepay" : "stripe";
  if (await repository.hasExternalEvent(ledger, fact.eventId)) return undefined;

  let order: Order | undefined;
  switch (fact.kind) {
    case "payment_succeeded": {
      const target = (fact.orderId ? await repository.findById(fact.orderId) : undefined) ?? (await findByProviderRef(fact.provider, fact.providerRef));
      if (!target || !refMatches(target, fact.providerRef)) break;
      order = await mutate(target.id, (current, now) =>
        paymentSucceeded(current, { amountMinor: fact.amountMinor, currency: fact.currency, paymentIntentId: fact.paymentIntentId }, now),
      );
      if (order.status === "paid" && target.status !== "paid") emit("payment_succeeded", {}, order);
      break;
    }
    case "checkout_expired": {
      const target = await findByProviderRef(fact.provider, fact.providerRef);
      if (target) order = await mutate(target.id, checkoutExpired);
      break;
    }
    case "refunded": {
      const target = fact.paymentIntentId
        ? await repository.findByPaymentIntentId(fact.paymentIntentId)
        : fact.providerRef
          ? await findByProviderRef(fact.provider, fact.providerRef)
          : undefined;
      if (target) {
        order = await mutate(target.id, refunded);
        if (target.status !== "refunded" && order.status === "refunded") emit("refund_completed", {}, order);
      }
      break;
    }
    case "ignored":
      break;
  }
  await repository.markExternalEvent(ledger, fact.eventId);
  return order;
}

/**
 * Confirms a pending order by asking the provider directly: AbacatePay for PIX, Stripe for
 * card. Works without a public webhook URL (local development) and covers late webhooks.
 * Throttled per order; the status poll calls it every few seconds.
 */
const lastProviderCheck = new Map<string, number>();

export async function refreshPaymentStatus(order: Order): Promise<Order> {
  if (order.status !== "pending_payment" || order.paymentMode === "mock") return order;
  const now = Date.now();
  if (now - (lastProviderCheck.get(order.id) ?? 0) < 2000) return order;
  lastProviderCheck.set(order.id, now);
  if (lastProviderCheck.size > 5000) lastProviderCheck.clear();

  if (order.paymentMode === "stripe" && order.stripeCheckoutSessionId) {
    const { checkCheckoutSession } = await import("@/server/payment/stripe");
    const fact = await checkCheckoutSession(order.stripeCheckoutSessionId);
    return fact ? ((await applyPaymentFact(fact)) ?? order) : order;
  }
  if (order.paymentMode !== "abacatepay" || !order.providerChargeId) return order;
  const { checkPixCharge, isClosedUnpaid, isPaid } = await import("@/server/payment/abacatepay");
  const charge = await checkPixCharge(order.providerChargeId);
  if (isPaid(charge.status)) {
    return (
      (await applyPaymentFact({
        kind: "payment_succeeded",
        provider: "abacatepay",
        eventId: `check_paid_${order.providerChargeId}`,
        orderId: order.id,
        providerRef: order.providerChargeId,
        paymentIntentId: null,
        // The charge was created server-side for exactly this order's amount.
        amountMinor: order.amountMinor,
        currency: order.currency,
      })) ?? order
    );
  }
  if (isClosedUnpaid(charge.status)) {
    return (
      (await applyPaymentFact({
        kind: "checkout_expired",
        provider: "abacatepay",
        eventId: `check_closed_${order.providerChargeId}`,
        orderId: order.id,
        providerRef: order.providerChargeId,
      })) ?? order
    );
  }
  return order;
}

/** Lets the next status check for this order (or all orders) go straight to the provider. */
export function clearPaymentCheckThrottle(orderId?: string): void {
  if (orderId) lastProviderCheck.delete(orderId);
  else lastProviderCheck.clear();
}

/**
 * The buyer is starting a new checkout from this browser. Closes the old card session so it
 * can't also be paid. (A PIX code can't be withdrawn; if it's paid anyway, the payment is
 * still recorded against its order and support can refund or deliver.)
 */
export async function abandonPendingCheckout(order: Order): Promise<void> {
  if (order.status !== "pending_payment" || order.paymentMode !== "stripe" || !order.stripeCheckoutSessionId) return;
  const { expireCheckoutSession } = await import("@/server/payment/stripe");
  await expireCheckoutSession(order.stripeCheckoutSessionId);
}

/** Fire-and-forget server analytics; never delays or fails the business operation. */
function emit<N extends Parameters<typeof trackServer>[0]>(
  name: N,
  props: Parameters<typeof trackServer<N>>[1],
  order: Order,
): void {
  void trackServer(name, props, order.id, order.countryHint).catch(() => undefined);
}

export const claimForFulfillment = (orderId: string) => mutate(orderId, claimFulfillment);
/** Keeps a running fulfilment's claim fresh, so a stopped server's claim expires quickly. */
export async function touchProcessing(orderId: string): Promise<void> {
  const repository = await orderRepository();
  await repository.touchProcessing(orderId, new Date());
}
export const markDelivered = (orderId: string, messageId: string) =>
  mutate(orderId, (order, now) => fulfillmentDelivered(order, messageId, now));
export const markEmailFailed = (orderId: string) => mutate(orderId, emailFailed);
export const markFailed = (orderId: string, code: ApiErrorCode, retryable: boolean) =>
  mutate(orderId, (order, now) => fulfillmentFailed(order, code, retryable, now));
export const requestRetry = (orderId: string) => mutate(orderId, retryRequested);
export const withdrawConsent = (orderId: string) => mutate(orderId, consentWithdrawn);
