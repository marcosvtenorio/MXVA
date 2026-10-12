import "server-only";
import { randomUUID } from "node:crypto";
import { devPreviewEnabled, publicConfig } from "@/lib/config";
import { providerIsSandbox, type PaymentMethod, type PaymentOffer } from "../config";
import { ApiError } from "../http";

export type CheckoutInput = {
  orderId: string;
  email: string;
  method: PaymentMethod;
  amountMinor: number;
  currency: "usd" | "brl";
  priceVariant: string;
  /** Where redirect-based payment methods send the buyer back. */
  returnUrl: string;
};

/** How long a PIX charge stays payable. Shown to the buyer as a real expiry, never as pressure. */
export const PIX_EXPIRES_IN_SECONDS = 30 * 60;

type PixCheckout = {
  mode: "pix";
  chargeId: string;
  /** PIX "copia e cola" code. The browser draws the QR code from it. */
  brCode: string;
  expiresAt: string;
  sandbox: boolean;
  simulated: boolean;
};

export type CheckoutInit =
  | { mode: "mock"; checkoutSessionId: string }
  | { mode: "stripe"; checkoutSessionId: string; clientSecret: string }
  | PixCheckout;

/** The client-facing part of a checkout (never includes provider ids). */
export type PublicCheckout =
  | { mode: "mock" }
  | { mode: "stripe"; clientSecret: string }
  | { mode: "pix"; brCode: string; expiresAt: string; sandbox: boolean; simulated: boolean };

export function toPublicCheckout(checkout: CheckoutInit): PublicCheckout {
  switch (checkout.mode) {
    case "mock":
      return { mode: "mock" };
    case "stripe":
      return { mode: "stripe", clientSecret: checkout.clientSecret };
    case "pix": {
      const { brCode, expiresAt, sandbox, simulated } = checkout;
      return { mode: "pix", brCode, expiresAt, sandbox, simulated };
    }
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
      /** Stripe/mock card: checkout session id. AbacatePay/mock PIX: charge id. */
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

/** Development/test only. Payment is simulated via POST /api/dev/mock-pay, for card and PIX alike. */
class MockPaymentProvider implements PaymentProvider {
  readonly mode = "mock" as const;

  async createCheckout(input: CheckoutInput): Promise<CheckoutInit> {
    if (!devPreviewEnabled) throw new ApiError("SERVICE_UNAVAILABLE");
    if (input.method === "card") return { mode: "mock", checkoutSessionId: `mock_cs_${randomUUID()}` };
    const chargeId = `mock_pix_${randomUUID()}`;
    return {
      mode: "pix",
      chargeId,
      brCode: `00020101021226850014br.gov.bcb.pix2563simulated.${publicConfig.brandName.toLowerCase()}.dev/${chargeId.slice(-12)}5204000053039865406${(input.amountMinor / 100).toFixed(2)}5802BR5904MXVA6009SAO PAULO6304SIMU`,
      expiresAt: new Date(Date.now() + PIX_EXPIRES_IN_SECONDS * 1000).toISOString(),
      sandbox: true,
      simulated: true,
    };
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
      expiresAt: charge.expiresAt,
      sandbox: charge.devMode ?? providerIsSandbox("abacatepay"),
      simulated: false,
    };
  }
}

export async function paymentProvider(offer: PaymentOffer): Promise<PaymentProvider> {
  switch (offer.provider) {
    case "mock":
      return new MockPaymentProvider();
    case "abacatepay":
      return new AbacatePayPixProvider();
    case "stripe": {
      const { StripePaymentProvider } = await import("./stripe");
      return new StripePaymentProvider();
    }
  }
}
