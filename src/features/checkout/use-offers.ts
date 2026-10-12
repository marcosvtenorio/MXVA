"use client";

import { useEffect, useSyncExternalStore } from "react";
import { api, type CheckoutOffer } from "@/lib/api-client";
import { DISPLAY_PRICE_BRL_CENTS, DISPLAY_PRICE_USD_CENTS, formatPrice } from "@/lib/config";
import { defaultMethod, visitorInBrazil } from "./method";
import { useCheckoutStore } from "./store";

let request: Promise<CheckoutOffer[]> | undefined;

/** The payment methods on offer, fetched once per tab. */
export function useCheckoutOffers(): CheckoutOffer[] | undefined {
  const offers = useCheckoutStore((s) => s.offers);
  useEffect(() => {
    if (offers) return;
    request ??= api.checkoutOptions().then((response) => response.offers);
    request.then(
      (loaded) => useCheckoutStore.getState().setOffers(loaded),
      () => {
        request = undefined;
      },
    );
  }, [offers]);
  return offers;
}

const noSubscription = () => () => undefined;

/**
 * The price this visitor will see at checkout: Pix in reais for visitors in Brazil, card in
 * dollars otherwise. Server-rendered HTML shows dollars; the browser corrects it after load.
 */
export function useDisplayPrice(): string {
  const offers = useCheckoutOffers();
  const inBrazil = useSyncExternalStore(noSubscription, visitorInBrazil, () => false);
  const method = offers ? defaultMethod(offers, inBrazil) : inBrazil ? "pix" : "card";
  const offer = offers?.find((candidate) => candidate.method === method);
  if (offer) return formatPrice(offer.price.amountMinor, offer.price.currency);
  return method === "pix" ? formatPrice(DISPLAY_PRICE_BRL_CENTS, "brl") : formatPrice(DISPLAY_PRICE_USD_CENTS, "usd");
}
