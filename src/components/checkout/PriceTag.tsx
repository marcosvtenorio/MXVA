"use client";

import { useDisplayPrice } from "@/features/checkout/use-offers";

/** The one-time price for this visitor ("$29", or "R$ 37,99" with Pix in Brazil). */
export function PriceTag() {
  return <>{useDisplayPrice()}</>;
}
