import { describe, expect, it } from "vitest";
import { defaultMethod } from "@/features/checkout/method";
import type { CheckoutOffer } from "@/lib/api-client";

const pix: CheckoutOffer = { method: "pix", price: { amountMinor: 3799, currency: "brl" }, sandbox: true, simulated: false };
const card: CheckoutOffer = { method: "card", price: { amountMinor: 2900, currency: "usd" }, sandbox: true, simulated: false };

describe("defaultMethod", () => {
  it("shows Pix first to visitors in Brazil", () => {
    expect(defaultMethod([pix, card], true)).toBe("pix");
  });

  it("shows card first everywhere else", () => {
    expect(defaultMethod([pix, card], false)).toBe("card");
  });

  it("falls back to whatever is on offer", () => {
    expect(defaultMethod([card], true)).toBe("card");
    expect(defaultMethod([pix], false)).toBe("pix");
    expect(defaultMethod([], false)).toBeUndefined();
  });
});
