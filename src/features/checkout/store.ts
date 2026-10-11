import { create } from "zustand";
import type { CreateOrderResponse } from "@/lib/api-client";

/** The checkout session for this tab, in memory only (the client secret never touches storage). */
type CheckoutState = {
  checkout?: Extract<CreateOrderResponse, { alreadyPaid: false }>["checkout"];
  price?: { amountMinor: number; currency: "usd" };
  set: (value: { checkout: CheckoutState["checkout"]; price: CheckoutState["price"] }) => void;
  clear: () => void;
};

export const useCheckoutStore = create<CheckoutState>()((set) => ({
  set: (value) => set(value),
  clear: () => set({ checkout: undefined, price: undefined }),
}));
