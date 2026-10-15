"use client";

import { loadStripe, type Appearance } from "@stripe/stripe-js";
import { CheckoutElementsProvider, PaymentElement, ExpressCheckoutElement, useCheckoutElements } from "@stripe/react-stripe-js/checkout";
import { useMemo, useState } from "react";
import { Lock } from "@/components/common/icons";
import { useCheckoutStore } from "@/features/checkout/store";
import { api } from "@/lib/api-client";
import { publicConfig } from "@/lib/config";

/**
 * Phase B: Stripe Checkout Sessions with the embedded Payment Element. Only mounted when
 * the server returned a Stripe client secret (real payments enabled and fully configured).
 * Wallets (Apple Pay, Google Pay) come first when the device has one; then the card fields,
 * with the pay button right under them.
 */
function PaymentBody({
  amountLabel,
  onPaid,
  onError,
  onStale,
}: {
  amountLabel: string;
  onPaid: () => void;
  onError: (message: string) => void;
  onStale: () => void;
}) {
  const result = useCheckoutElements();
  const [busy, setBusy] = useState(false);
  const [wallets, setWallets] = useState(false);
  if (result.type !== "success") {
    return (
      <button type="button" className="btn" disabled aria-disabled="true">
        {result.type === "error" ? "Payment unavailable" : "Loading payment…"}
      </button>
    );
  }
  const { checkout } = result;
  // The session's return_url (/processing, set by the server) brings redirect-based methods back.
  // Cards confirm in place, so the photos stay in memory.
  async function confirm(options: Parameters<typeof checkout.confirm>[0]) {
    setBusy(true);
    useCheckoutStore.getState().setConfirming(true);
    try {
      const outcome = await checkout.confirm(options);
      if (outcome.type === "success") onPaid();
      // A decline is already shown on the card field; add what it means instead of repeating it.
      else if (outcome.error.code === "paymentFailed") onError("Nothing was charged. Check the card details above or try another card.");
      else await settleElsewhere(outcome.error.message);
    } catch {
      onError("The payment couldn't be confirmed. Nothing was charged; try again.");
    } finally {
      setBusy(false);
      useCheckoutStore.getState().setConfirming(false);
    }
  }
  // This form's session may have been paid or replaced in another tab: ask before showing an error.
  async function settleElsewhere(message: string) {
    const current = await api.currentOrder().catch(() => undefined);
    if (current?.order.unfinished) return onPaid();
    if (!current?.pending || current.pending.method !== "card") return onStale();
    onError(message);
  }
  return (
    <div className="grid gap-4">
      {/* Takes no room until the device has a wallet to show. */}
      <div className={wallets ? undefined : "-mb-4 h-0 overflow-hidden"}>
        <ExpressCheckoutElement
          options={{
            buttonHeight: 50,
            buttonType: { applePay: "buy", googlePay: "buy" },
            buttonTheme: { applePay: "black", googlePay: "black" },
            layout: undefined,
            paymentMethodOrder: undefined,
            paymentMethods: undefined,
          }}
          onReady={(event) => setWallets(Boolean(event.availablePaymentMethods && Object.values(event.availablePaymentMethods).some(Boolean)))}
          onConfirm={(event) => void confirm({ expressCheckoutConfirmEvent: event, redirect: "if_required" })}
        />
      </div>
      {wallets ? (
        <p className="mono flex items-center gap-3 text-ink-2 before:h-px before:flex-1 before:bg-rule after:h-px after:flex-1 after:bg-rule">Or pay by card</p>
      ) : null}
      {/* Wallets already have their own buttons above. */}
      <PaymentElement options={{ layout: { type: "tabs" }, wallets: { applePay: "never", googlePay: "never" } }} />
      <button type="button" className="btn" disabled={busy} aria-busy={busy} onClick={() => void confirm({ redirect: "if_required" })}>
        {busy ? <span className="btn-spinner" aria-hidden="true" /> : <Lock size={15} />}
        {busy ? "Confirming…" : `Pay ${amountLabel}`}
      </button>
    </div>
  );
}

/** The card fields in the site's own materials (globals.css tokens), light or dark like the page. */
function appearanceFor(dark: boolean): Appearance {
  const c = dark
    ? { field: "#0D1012", panel: "#161A1D", ink: "#ECEFF0", ink2: "#A3AEB5", ink3: "#808B92", rule: "#262C30", accent: "#9CB5C3", negative: "#F08C7C" }
    : { field: "#F4F5F3", panel: "#FFFFFF", ink: "#111417", ink2: "#56626B", ink3: "#76818A", rule: "#D9DEE0", accent: "#3F5B6B", negative: "#A2392A" };
  return {
    theme: dark ? "night" : "flat",
    // Labels above the fields keep expiry and CVC side by side on a phone; floating labels stack them.
    labels: "above",
    variables: {
      colorPrimary: c.accent,
      colorBackground: c.field,
      colorText: c.ink,
      colorTextSecondary: c.ink2,
      colorTextPlaceholder: c.ink3,
      colorDanger: c.negative,
      borderRadius: "12px",
      fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
      fontSizeBase: "16px",
      spacingUnit: "3.5px",
    },
    rules: {
      ".Input": { backgroundColor: c.field, boxShadow: `inset 0 0 0 1px ${c.rule}`, border: "none" },
      ".Input:focus": { boxShadow: `inset 0 0 0 2px ${c.accent}` },
      ".Tab": { backgroundColor: c.panel, boxShadow: `inset 0 0 0 1px ${c.rule}`, border: "none" },
    },
  };
}

export function StripePaymentForm({
  amountLabel,
  clientSecret,
  onPaid,
  onError,
  onStale,
}: {
  /** The order's price as the page shows it ("R$ 47,99"); the session charges exactly this. */
  amountLabel: string;
  clientSecret: string;
  onPaid: () => void;
  onError: (message: string) => void;
  /** This card session is no longer this browser's open checkout (replaced in another tab). */
  onStale: () => void;
}) {
  // English like the rest of the site: a pt-BR browser otherwise gets "Cartão". The sandbox's
  // testing assistant would sit over the page's own buttons, so it stays off.
  const stripePromise = useMemo(() => loadStripe(publicConfig.stripePublishableKey, { locale: "en", developerTools: { assistant: { enabled: false } } }), []);
  const appearance = useMemo(() => appearanceFor(window.matchMedia("(prefers-color-scheme: dark)").matches), []);
  return (
    <CheckoutElementsProvider
      stripe={stripePromise}
      options={{
        clientSecret,
        elementsOptions: { appearance },
      }}
    >
      <PaymentBody amountLabel={amountLabel} onPaid={onPaid} onError={onError} onStale={onStale} />
    </CheckoutElementsProvider>
  );
}
