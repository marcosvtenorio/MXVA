import "server-only";
import { randomUUID } from "node:crypto";
import { devPreviewEnabled, publicConfig } from "@/lib/config";
import { paymentMode, paymentsAreSandbox } from "../config";
import { ApiError } from "../http";

export type CheckoutInput = {
  orderId: string;
  email: string;
  amountMinor: number;
  currency: "usd" | "brl";
  priceVariant: string;
  /** Where redirect-based payment methods send the buyer back. */
  returnUrl: string;
};

/** How long a PIX charge stays payable. Shown to the buyer as a real expiry, never as pressure. */
export const PIX_EXPIRES_IN_SECONDS = 30 * 60;

export type CheckoutInit =
  | { mode: "mock"; checkoutSessionId: string }
  | { mode: "stripe"; checkoutSessionId: string; clientSecret: string }
  | {
      mode: "pix";
      chargeId: string;
      /** PIX "copia e cola" code. */
      brCode: string;
      /** QR code image (provider-generated PNG data URL; no personal data). */
      qrCodeDataUrl: string;
      expiresAt: string;
      sandbox: boolean;
    };

/** The client-facing part of a checkout (never includes provider ids). */
export type PublicCheckout =
  | { mode: "mock" }
  | { mode: "stripe"; clientSecret: string }
  | { mode: "pix"; brCode: string; qrCodeDataUrl: string; expiresAt: string; sandbox: boolean };

export function toPublicCheckout(checkout: CheckoutInit): PublicCheckout {
  switch (checkout.mode) {
    case "mock":
      return { mode: "mock" };
    case "stripe":
      return { mode: "stripe", clientSecret: checkout.clientSecret };
    case "pix":
      return { mode: "pix", brCode: checkout.brCode, qrCodeDataUrl: checkout.qrCodeDataUrl, expiresAt: checkout.expiresAt, sandbox: checkout.sandbox };
  }
}

export type PaymentProviderRef = "mock" | "stripe" | "abacatepay";

/** A verified payment fact, translated from the provider's event or a server-side status check. */
export type PaymentFact =
  | {
      kind: "payment_succeeded";
      provider: PaymentProviderRef;
      eventId: string;
      orderId: string | null;
      /** Stripe/mock: checkout session id. AbacatePay: PIX charge id. */
      providerRef: string;
      paymentIntentId: string | null;
      amountMinor: number;
      currency: string;
    }
  | { kind: "checkout_expired"; provider: PaymentProviderRef; eventId: string; orderId: string | null; providerRef: string }
  | { kind: "refunded"; provider: PaymentProviderRef; eventId: string; paymentIntentId?: string; providerRef?: string }
  | { kind: "ignored"; provider: PaymentProviderRef; eventId: string; type: string };

export interface PaymentProvider {
  readonly mode: "mock" | "stripe" | "abacatepay";
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

/** PIX through AbacatePay's transparent checkout: QR code + copy-and-paste code, no redirect. */
class AbacatePayPixProvider implements PaymentProvider {
  readonly mode = "abacatepay" as const;

  async createCheckout(input: CheckoutInput): Promise<CheckoutInit> {
    if (input.currency !== "brl") throw new ApiError("INVALID_REQUEST", "PIX payments are charged in reais.");
    const { createPixCharge } = await import("./abacatepay");
    const charge = await createPixCharge({
      orderId: input.orderId,
      amountMinor: input.amountMinor,
      expiresInSeconds: PIX_EXPIRES_IN_SECONDS,
      description: `${publicConfig.brandName} report: AI concept portrait + PDF roadmap`,
    });
    if (charge.amount !== input.amountMinor) {
      console.error("[abacatepay] created charge amount differs from the order");
      throw new ApiError("SERVICE_UNAVAILABLE");
    }
    return {
      mode: "pix",
      chargeId: charge.id,
      brCode: charge.brCode,
      qrCodeDataUrl: charge.brCodeBase64,
      expiresAt: charge.expiresAt,
      sandbox: charge.devMode ?? paymentsAreSandbox(),
    };
  }
}

export async function paymentProvider(): Promise<PaymentProvider> {
  switch (paymentMode()) {
    case "mock":
      return new MockPaymentProvider();
    case "pix":
      return new AbacatePayPixProvider();
    case "stripe": {
      const { StripePaymentProvider } = await import("./stripe");
      return new StripePaymentProvider();
    }
    case "unavailable":
      throw new ApiError("SERVICE_UNAVAILABLE", "Checkout isn't open yet. Please check back soon.");
  }
}
