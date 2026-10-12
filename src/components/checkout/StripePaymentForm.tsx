"use client";

import { loadStripe } from "@stripe/stripe-js";
import { CheckoutElementsProvider, PaymentElement, ExpressCheckoutElement, useCheckoutElements } from "@stripe/react-stripe-js/checkout";
import { useMemo, useState } from "react";
import { Lock } from "@/components/common/icons";
import { publicConfig } from "@/lib/config";

/**
 * Phase B: Stripe Checkout Sessions with the embedded Payment Element. Only mounted when
 * the server returned a Stripe client secret (real payments enabled and fully configured).
 */
function PaymentBody({ onPaid, onError }: { onPaid: () => void; onError: (message: string) => void }) {
  const result = useCheckoutElements();
  const [busy, setBusy] = useState(false);
  if (result.type !== "success") {
    return (
      <button type="button" className="btn" disabled aria-disabled="true">
        {result.type === "error" ? "Payment unavailable" : "Loading payment…"}
      </button>
    );
  }
  const { checkout } = result;
  const returnUrl = `${window.location.origin}/processing`;
  return (
    <div className="grid gap-4">
      <ExpressCheckoutElement
        onConfirm={async (event) => {
          const outcome = await checkout.confirm({ expressCheckoutConfirmEvent: event, redirect: "if_required", returnUrl });
          if (outcome.type === "success") onPaid();
          else onError(outcome.error.message);
        }}
      />
      <PaymentElement />
      <button
        type="button"
        className="btn"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          // Cards confirm in place (photos stay in memory); redirect-based methods come back to /processing.
          const outcome = await checkout.confirm({ redirect: "if_required", returnUrl });
          setBusy(false);
          if (outcome.type === "success") onPaid();
          else onError(outcome.error.message);
        }}
      >
        <Lock size={15} />
        {busy ? "Confirming…" : `Pay ${checkout.total.total.amount}`}
      </button>
    </div>
  );
}

export function StripePaymentForm({
  clientSecret,
  onPaid,
  onError,
}: {
  clientSecret: string;
  onPaid: () => void;
  onError: (message: string) => void;
}) {
  const stripePromise = useMemo(() => loadStripe(publicConfig.stripePublishableKey), []);
  return (
    <CheckoutElementsProvider
      stripe={stripePromise}
      options={{
        clientSecret,
        adaptivePricing: { allowed: true },
        elementsOptions: {
          appearance: {
            theme: "flat",
            variables: {
              colorPrimary: "#3F5B6B",
              colorBackground: "#FFFFFF",
              colorText: "#111417",
              colorTextSecondary: "#56626B",
              colorDanger: "#A2392A",
              borderRadius: "10px",
              fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
              fontSizeBase: "16px",
            },
          },
        },
      }}
    >
      <PaymentBody onPaid={onPaid} onError={onError} />
    </CheckoutElementsProvider>
  );
}
