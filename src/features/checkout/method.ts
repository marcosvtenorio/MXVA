import { regionHint } from "@/features/analytics/attribution";
import type { CheckoutOffer, PaymentMethod } from "@/lib/api-client";

/**
 * Best guess that the visitor is in Brazil, from the device time zone and languages. Picks
 * which payment method is shown first and prices the card in reais; both methods stay one
 * tap away, and PIX itself can only be paid from a Brazilian bank account.
 */
export function visitorInBrazil(): boolean {
  return visitorRegion() === "BR";
}

/** The visitor's likely country ("BR", "US"…), from the device time zone and languages. Sent with the order. */
export function visitorRegion(): string | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    return regionHint(Intl.DateTimeFormat().resolvedOptions().timeZone, navigator.languages ?? []);
  } catch {
    return undefined;
  }
}

export function defaultMethod(offers: readonly CheckoutOffer[], inBrazil: boolean): PaymentMethod | undefined {
  const has = (method: PaymentMethod) => offers.some((offer) => offer.method === method);
  if (inBrazil && has("pix")) return "pix";
  if (has("card")) return "card";
  return offers[0]?.method;
}
