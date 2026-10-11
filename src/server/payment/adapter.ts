import "server-only";
import { randomUUID } from "node:crypto";
import { devPreviewEnabled } from "@/lib/config";
import { paymentMode } from "../config";
import { ApiError } from "../http";

export type CheckoutInput = {
  orderId: string;
  email: string;
  amountMinor: number;
  currency: "usd";
  priceVariant: string;
  /** Where redirect-based payment methods send the buyer back. */
  returnUrl: string;
};

export type CheckoutInit =
  | { mode: "mock"; checkoutSessionId: string }
  | { mode: "stripe"; checkoutSessionId: string; clientSecret: string };

/** A verified payment fact, translated from the provider's event. */
export type PaymentFact =
  | {
      kind: "payment_succeeded";
      eventId: string;
      orderId: string | null;
      checkoutSessionId: string;
      paymentIntentId: string | null;
      amountMinor: number;
      currency: string;
    }
  | { kind: "checkout_expired"; eventId: string; orderId: string | null; checkoutSessionId: string }
  | { kind: "refunded"; eventId: string; paymentIntentId: string }
  | { kind: "ignored"; eventId: string; type: string };

export interface PaymentProvider {
  readonly mode: "mock" | "stripe";
  createCheckout(input: CheckoutInput): Promise<CheckoutInit>;
}

/** Development/test only. Payment is simulated via POST /api/dev/mock-pay. */
class MockPaymentProvider implements PaymentProvider {
  readonly mode = "mock" as const;

  async createCheckout(): Promise<CheckoutInit> {
    if (!devPreviewEnabled) throw new ApiError("SERVICE_UNAVAILABLE");
    return { mode: "mock", checkoutSessionId: `mock_cs_${randomUUID()}` };
  }
}

export async function paymentProvider(): Promise<PaymentProvider> {
  switch (paymentMode()) {
    case "mock":
      return new MockPaymentProvider();
    case "stripe": {
      const { StripePaymentProvider } = await import("./stripe");
      return new StripePaymentProvider();
    }
    case "unavailable":
      throw new ApiError("SERVICE_UNAVAILABLE", "Checkout isn't open yet. Please check back soon.");
  }
}
