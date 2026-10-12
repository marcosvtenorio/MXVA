import { regionHint } from "@/features/analytics/attribution";
import type { CheckoutOffer, PaymentMethod } from "@/lib/api-client";

/**
 * Best guess that the visitor is in Brazil, from the device time zone and languages.
 * Only picks which payment method is shown first; both stay one tap away, and PIX itself
 * can only be paid from a Brazilian bank account.
 */
export function visitorInBrazil(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return regionHint(Intl.DateTimeFormat().resolvedOptions().timeZone, navigator.languages ?? []) === "BR";
  } catch {
    return false;
  }
}

export function defaultMethod(offers: readonly CheckoutOffer[], inBrazil: boolean): PaymentMethod | undefined {
  const has = (method: PaymentMethod) => offers.some((offer) => offer.method === method);
  if (inBrazil && has("pix")) return "pix";
  if (has("card")) return "card";
  return offers[0]?.method;
}
