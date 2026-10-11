import "server-only";
import { randomUUID } from "node:crypto";
import type { ApiErrorCode } from "@/lib/api-errors";
import { serverEnv } from "@/server/config";
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
export function currentPrice(): { amountMinor: number; currency: "usd"; priceVariant: string } {
  const env = serverEnv();
  return { amountMinor: env.PRICE_USD_CENTS, currency: "usd", priceVariant: env.PRICE_VARIANT };
}

export async function createOrder(input: CreateOrderInput): Promise<{ order: Order; checkout: CheckoutInit }> {
  const provider = await paymentProvider();
  const repository = await orderRepository();
  const price = currentPrice();
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
    stripeCheckoutSessionId: checkout.checkoutSessionId,
    stripePaymentIntentId: null,
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

export async function applyPaymentFact(fact: PaymentFact): Promise<Order | undefined> {
  const repository = await orderRepository();
  if (await repository.hasExternalEvent("stripe", fact.eventId)) return undefined;

  let order: Order | undefined;
  switch (fact.kind) {
    case "payment_succeeded": {
      const target =
        (fact.orderId ? await repository.findById(fact.orderId) : undefined) ??
        (await repository.findByCheckoutSessionId(fact.checkoutSessionId));
      if (!target || target.stripeCheckoutSessionId !== fact.checkoutSessionId) break;
      order = await mutate(target.id, (current, now) =>
        paymentSucceeded(current, { amountMinor: fact.amountMinor, currency: fact.currency, paymentIntentId: fact.paymentIntentId }, now),
      );
      if (order.status === "paid" && target.status !== "paid") emit("payment_succeeded", {}, order);
      break;
    }
    case "checkout_expired": {
      const target = await repository.findByCheckoutSessionId(fact.checkoutSessionId);
      if (target) order = await mutate(target.id, checkoutExpired);
      break;
    }
    case "refunded": {
      const target = await repository.findByPaymentIntentId(fact.paymentIntentId);
      if (target) {
        order = await mutate(target.id, refunded);
        if (target.status !== "refunded" && order.status === "refunded") emit("refund_completed", {}, order);
      }
      break;
    }
    case "ignored":
      break;
  }
  await repository.markExternalEvent("stripe", fact.eventId);
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
