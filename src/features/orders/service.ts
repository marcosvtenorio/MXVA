import "server-only";
import { randomUUID } from "node:crypto";
import type { ApiErrorCode } from "@/lib/api-errors";
import { paymentMode, serverEnv } from "@/server/config";
import { trackServer } from "@/server/analytics";
import { ApiError } from "@/server/http";
import { paymentProvider, type CheckoutInit, type PaymentFact } from "@/server/payment/adapter";
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
  paymentSucceeded,
  refunded,
  retryRequested,
  type Order,
  type TransitionResult,
} from "./states";

export const SKU = "mxva_report_v1";

export type CreateOrderInput = {
  email: string;
  consentVersion: string;
  termsVersion: string;
  marketingOptIn: boolean;
  countryHint: string | null;
  returnUrl: string;
};

/** Server-authoritative price. The browser never sends or chooses an amount. */
export function currentPrice(currency: "usd" | "brl" = "usd"): { amountMinor: number; currency: "usd" | "brl"; priceVariant: string } {
  const env = serverEnv();
  if (currency === "brl") return { amountMinor: env.PRICE_BRL_CENTS, currency: "brl", priceVariant: `brl_${Math.round(env.PRICE_BRL_CENTS / 100)}` };
  return { amountMinor: env.PRICE_USD_CENTS, currency: "usd", priceVariant: env.PRICE_VARIANT };
}

/** The currency each payment path charges in: PIX is reais; card and the simulator are dollars. */
export function checkoutCurrency(): "usd" | "brl" {
  return paymentMode() === "pix" ? "brl" : "usd";
}

export async function createOrder(input: CreateOrderInput): Promise<{ order: Order; checkout: CheckoutInit }> {
  const provider = await paymentProvider();
  const repository = await orderRepository();
  const price = currentPrice(checkoutCurrency());
  const now = new Date();
  const id = randomUUID();

  const checkout = await provider.createCheckout({
    orderId: id,
    email: input.email,
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
  return provider === "abacatepay" ? repository.findByProviderChargeId(providerRef) : repository.findByCheckoutSessionId(providerRef);
}

function refMatches(order: Order, provider: PaymentFact["provider"], providerRef: string): boolean {
  return provider === "abacatepay" ? order.providerChargeId === providerRef : order.stripeCheckoutSessionId === providerRef;
}

export async function applyPaymentFact(fact: PaymentFact): Promise<Order | undefined> {
  const repository = await orderRepository();
  const ledger = fact.provider === "abacatepay" ? "abacatepay" : "stripe";
  if (await repository.hasExternalEvent(ledger, fact.eventId)) return undefined;

  let order: Order | undefined;
  switch (fact.kind) {
    case "payment_succeeded": {
      const target = (fact.orderId ? await repository.findById(fact.orderId) : undefined) ?? (await findByProviderRef(fact.provider, fact.providerRef));
      if (!target || !refMatches(target, fact.provider, fact.providerRef)) break;
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
 * PIX confirmation by asking AbacatePay directly (works without a public webhook URL,
 * e.g. in local development, and double-checks webhooks). Throttled per order.
 */
const lastPixCheck = new Map<string, number>();

export async function refreshPixStatus(order: Order): Promise<Order> {
  if (order.paymentMode !== "abacatepay" || order.status !== "pending_payment" || !order.providerChargeId) return order;
  const now = Date.now();
  if (now - (lastPixCheck.get(order.id) ?? 0) < 2000) return order;
  lastPixCheck.set(order.id, now);
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

/** Fire-and-forget server analytics; never delays or fails the business operation. */
function emit<N extends Parameters<typeof trackServer>[0]>(
  name: N,
  props: Parameters<typeof trackServer<N>>[1],
  order: Order,
): void {
  void trackServer(name, props, order.id, order.countryHint).catch(() => undefined);
}

export const claimForFulfillment = (orderId: string) => mutate(orderId, claimFulfillment);
export const markDelivered = (orderId: string, messageId: string) =>
  mutate(orderId, (order, now) => fulfillmentDelivered(order, messageId, now));
export const markEmailFailed = (orderId: string) => mutate(orderId, emailFailed);
export const markFailed = (orderId: string, code: ApiErrorCode, retryable: boolean) =>
  mutate(orderId, (order, now) => fulfillmentFailed(order, code, retryable, now));
export const requestRetry = (orderId: string) => mutate(orderId, retryRequested);
export const withdrawConsent = (orderId: string) => mutate(orderId, consentWithdrawn);
