import "server-only";
import Stripe from "stripe";
import { publicConfig } from "@/lib/config";
import { ConfigError, serverEnv } from "../config";
import type { CheckoutInit, CheckoutInput, PaymentFact, PaymentProvider } from "./adapter";

/**
 * Stripe Checkout Sessions with the embedded Payment Element (`ui_mode: "elements"`).
 * Phase B: enabled only when NEXT_PUBLIC_ENABLE_REAL_PAYMENTS=true AND every downstream
 * provider is configured (see paymentMode()). Verify against the installed SDK before going live.
 */

let client: Stripe | undefined;

function stripe(): Stripe {
  const key = serverEnv().STRIPE_SECRET_KEY;
  if (!key) throw new ConfigError("STRIPE_SECRET_KEY is missing.");
  client ??= new Stripe(key, { maxNetworkRetries: 2, timeout: 20_000, appInfo: { name: publicConfig.brandName } });
  return client;
}

export class StripePaymentProvider implements PaymentProvider {
  readonly mode = "stripe" as const;

  async createCheckout(input: CheckoutInput): Promise<CheckoutInit> {
    const session = await stripe().checkout.sessions.create(
      {
        ui_mode: "elements",
        mode: "payment",
        client_reference_id: input.orderId,
        customer_email: input.email,
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: input.currency,
              unit_amount: input.amountMinor,
              product_data: {
                name: `${publicConfig.brandName} report: AI concept portrait + PDF roadmap`,
              },
            },
          },
        ],
        metadata: { order_id: input.orderId, price_variant: input.priceVariant },
        payment_intent_data: { metadata: { order_id: input.orderId } },
        // Shows local currency where Stripe supports it; settlement stays in USD.
        adaptive_pricing: { enabled: true },
        return_url: input.returnUrl,
        expires_at: Math.floor(Date.now() / 1000) + 60 * 60,
      },
      { idempotencyKey: `checkout-${input.orderId}` },
    );
    if (!session.client_secret) throw new Error("Stripe returned no client secret");
    return { mode: "stripe", checkoutSessionId: session.id, clientSecret: session.client_secret };
  }
}

/** Verifies the signature over the exact raw bytes, then maps the event to a payment fact. */
export function parseStripeWebhook(rawBody: string, signature: string | null): PaymentFact {
  const secret = serverEnv().STRIPE_WEBHOOK_SECRET;
  if (!secret) throw new ConfigError("STRIPE_WEBHOOK_SECRET is missing.");
  if (!signature) throw new Error("Missing Stripe-Signature header");
  const event = stripe().webhooks.constructEvent(rawBody, signature, secret);
  return toPaymentFact(event);
}

export function toPaymentFact(event: Stripe.Event): PaymentFact {
  switch (event.type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded": {
      const session = event.data.object;
      if (session.payment_status !== "paid") return { kind: "ignored", provider: "stripe", eventId: event.id, type: event.type };
      // With Adaptive Pricing the buyer may pay in local currency; compare the source amount.
      const conversion = session.currency_conversion;
      return {
        kind: "payment_succeeded",
        provider: "stripe",
        eventId: event.id,
        orderId: session.client_reference_id ?? session.metadata?.order_id ?? null,
        providerRef: session.id,
        paymentIntentId: typeof session.payment_intent === "string" ? session.payment_intent : (session.payment_intent?.id ?? null),
        amountMinor: conversion ? conversion.amount_total : (session.amount_total ?? 0),
        currency: conversion ? conversion.source_currency : (session.currency ?? ""),
      };
    }
    case "checkout.session.expired": {
      const session = event.data.object;
      return {
        kind: "checkout_expired",
        provider: "stripe",
        eventId: event.id,
        orderId: session.client_reference_id ?? session.metadata?.order_id ?? null,
        providerRef: session.id,
      };
    }
    case "charge.refunded": {
      const charge = event.data.object;
      const paymentIntentId = typeof charge.payment_intent === "string" ? charge.payment_intent : charge.payment_intent?.id;
      if (!paymentIntentId || !charge.refunded) return { kind: "ignored", provider: "stripe", eventId: event.id, type: event.type };
      return { kind: "refunded", provider: "stripe", eventId: event.id, paymentIntentId };
    }
    default:
      return { kind: "ignored", provider: "stripe", eventId: event.id, type: event.type };
  }
}
