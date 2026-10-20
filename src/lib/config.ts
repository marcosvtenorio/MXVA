// Client-safe configuration. Every NEXT_PUBLIC_* variable must be read with a static
// `process.env.NEXT_PUBLIC_X` expression so Next.js can inline it at build time.
// Server secrets live in src/server/config.ts and never pass through this module.

const flag = (value: string | undefined): boolean => value === "true";

export const isProductionBuild = process.env.NODE_ENV === "production";

export const publicConfig = Object.freeze({
  brandName: process.env.NEXT_PUBLIC_BRAND_NAME || "MXVA",
  appUrl: (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/+$/, ""),
  enableRealPayments: flag(process.env.NEXT_PUBLIC_ENABLE_REAL_PAYMENTS),
  enableRealAi: flag(process.env.NEXT_PUBLIC_ENABLE_REAL_AI),
  stripePublishableKey: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || "",
});

/**
 * Mock payment and mock results exist only in development and test builds.
 * A production build ignores NEXT_PUBLIC_SHOW_DEV_PREVIEW entirely, so no deploy
 * flag can unlock a simulated paid order.
 */
export const devPreviewEnabled = !isProductionBuild && flag(process.env.NEXT_PUBLIC_SHOW_DEV_PREVIEW);

/** Display-only prices. The server recomputes the authoritative amount for every order. */
export const DISPLAY_PRICE_USD_CENTS = 2900;
export const DISPLAY_PRICE_BRL_CENTS = 4799;

/**
 * The delivery time quoted before paying: a report takes about 150 s plus the email (see the
 * queue's estimate in src/server/fulfillment/queue.ts). After paying, the page shows the live estimate.
 */
export const TYPICAL_DELIVERY = "about 3 minutes";

export type Currency = "usd" | "brl";

/** "$29" for card, "R$ 47,99" for PIX (Brazilian notation). */
export function formatPrice(amountMinor: number, currency: Currency): string {
  if (currency === "brl") {
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(amountMinor / 100).replace(/\u00a0/g, " ");
  }
  return formatUsd(amountMinor);
}

export function formatUsd(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
  }).format(cents / 100);
}
