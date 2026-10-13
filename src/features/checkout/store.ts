import { create } from "zustand";
import type { CheckoutOffer, PaymentMethod, PixCheckout, Price } from "@/lib/api-client";

export type CardCheckout = { checkout: { mode: "mock" } | { mode: "stripe"; clientSecret: string }; price: Price };
export type PixSession = { checkout: PixCheckout; price: Price };

/**
 * Checkout state for this tab, in memory only: the Stripe client secret never touches storage.
 * (The PIX copy-and-paste code may be kept in sessionStorage, see pix-session.ts: it is meant
 * to be copied and holds no personal data.)
 */
type CheckoutState = {
  offers?: CheckoutOffer[];
  method?: PaymentMethod;
  card?: CardCheckout;
  pix?: PixSession;
  /** This tab took the payment: only it starts the report by itself (other tabs follow). */
  paidHere: boolean;
  setOffers: (offers: CheckoutOffer[]) => void;
  setMethod: (method: PaymentMethod) => void;
  setCard: (card: CardCheckout | undefined) => void;
  setPix: (pix: PixSession | undefined) => void;
  setPaidHere: (paidHere: boolean) => void;
  clear: () => void;
};

export const useCheckoutStore = create<CheckoutState>()((set) => ({
  paidHere: false,
  setOffers: (offers) => set({ offers }),
  setMethod: (method) => set({ method }),
  setCard: (card) => set({ card }),
  setPix: (pix) => set({ pix }),
  setPaidHere: (paidHere) => set({ paidHere }),
  clear: () => set({ card: undefined, pix: undefined, method: undefined }),
}));
