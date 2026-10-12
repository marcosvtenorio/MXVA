"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { InlineError } from "@/components/common/InlineError";
import { Back, Lock, Tick } from "@/components/common/icons";
import { PlasterHead } from "@/components/common/StudioArt";
import { regionHint } from "@/features/analytics/attribution";
import { track } from "@/features/analytics/client";
import { useCheckoutStore } from "@/features/checkout/store";
import { FACE_PROCESSING_CONSENT_VERSION, TERMS_VERSION } from "@/features/onboarding/schema";
import { useOnboardingStore } from "@/features/onboarding/store";
import { ApiClientError, api } from "@/lib/api-client";
import { DISPLAY_PRICE_USD_CENTS, devPreviewEnabled, formatUsd } from "@/lib/config";

const StripePaymentForm = dynamic(() => import("./StripePaymentForm").then((m) => m.StripePaymentForm), {
  ssr: false,
  loading: () => <p className="text-[15px] text-ink-2">Loading secure payment…</p>,
});

function maskEmail(email: string): string {
  const [name = "", domain = ""] = email.split("@");
  return name && domain ? `${name.slice(0, 1)}•••@${domain}` : "your email";
}

type View = { state: "loading" } | { state: "ready" } | { state: "unavailable"; message: string };

/**
 * Paywall (spec §3, "Checkout arrangement"): heading, deliverables, one-time price,
 * payment, consent disclosure. No countdowns, no scarcity, no locked portrait.
 */
export function CheckoutView() {
  const router = useRouter();
  const checkout = useCheckoutStore((s) => s.checkout);
  const price = useCheckoutStore((s) => s.price);
  const setCheckout = useCheckoutStore((s) => s.set);
  const onboarding = useOnboardingStore();
  const [view, setView] = useState<View>(() => (checkout ? { state: "ready" } : { state: "loading" }));
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  // A reload loses the in-memory checkout: recover from the server, or re-create it.
  useEffect(() => {
    if (checkout || !onboarding.hydrated) return;
    let cancelled = false;
    (async () => {
      try {
        const current = await api.currentOrder().catch(() => undefined);
        if (current?.order.paid) return router.replace("/processing");
        if (!onboarding.email || !onboarding.faceProcessingConsent || !onboarding.termsAccepted) {
          return router.replace("/onboarding/review");
        }
        const response = await api.createOrder({
          sku: "mxva_report_v1",
          email: onboarding.email,
          adultConfirmed: onboarding.adultConfirmed,
          faceProcessingConsentVersion: FACE_PROCESSING_CONSENT_VERSION,
          termsVersion: TERMS_VERSION,
          marketingOptIn: onboarding.marketingOptIn,
          countryHint: regionHint(Intl.DateTimeFormat().resolvedOptions().timeZone, navigator.languages ?? []),
        });
        if (cancelled) return;
        if (response.alreadyPaid) return router.replace("/processing");
        setCheckout({ checkout: response.checkout, price: response.price });
        setView({ state: "ready" });
      } catch (caught) {
        if (cancelled) return;
        setView({ state: "unavailable", message: caught instanceof ApiClientError ? caught.message : "Checkout isn't available right now." });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [checkout, onboarding, router, setCheckout]);

  const amount = formatUsd(price?.amountMinor ?? DISPLAY_PRICE_USD_CENTS);

  function paid() {
    track("cta_clicked", { cta: "pay" });
    router.push("/processing");
  }

  function failed(code: ApiClientError["code"], message: string) {
    track("checkout_failed", { code });
    setError(message);
    setBusy(false);
  }

  async function simulate(outcome: "succeeded" | "declined" | "redirect") {
    setBusy(true);
    setError(undefined);
    try {
      await api.mockPay(outcome === "declined" ? "declined" : "succeeded");
      if (outcome === "redirect") {
        // A full page load, like a bank page or a wallet app sending you back: memory is gone.
        // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- deliberate hard navigation
        window.location.assign("/processing");
        return;
      }
      paid();
    } catch (caught) {
      if (caught instanceof ApiClientError) failed(caught.code, caught.message);
      else failed("SERVICE_UNAVAILABLE", "Payment didn't go through. Try again.");
    }
  }

  return (
    <div className="washed min-h-dvh">
      <div className="mx-auto w-full max-w-[480px] px-5 pb-10 pt-[max(12px,env(safe-area-inset-top))]">
        <div className="flex items-center justify-between">
          <Link href="/onboarding/review" className="icon-btn" aria-label="Back to review">
            <Back size={20} />
          </Link>
          <span className="mono text-ink-2">Checkout</span>
          <span className="mono inline-flex items-center gap-1.5 text-ink-2">
            <Lock size={13} /> Secure
          </span>
        </div>

        <main id="main">
          <h1 className="title-28 two-tone mt-4">
            One report.
            <br />
            <span>Made after you pay.</span>
          </h1>

          <div className="stage mt-5 h-[196px] rounded-[26px]">
            <span className="capsule frost mono absolute left-4 top-4">Sample</span>
            <div aria-hidden="true" className="absolute right-6 top-6 grid h-[148px] w-28 rotate-3 content-start gap-[5px] rounded bg-[#FBFBFA] px-2.5 py-3 shadow-[0_10px_24px_rgba(40,55,62,.28)]">
              <div className="stage mb-1 h-[52px] rounded-[3px]">
                <PlasterHead className="h-full w-full" />
              </div>
              {[84, 64, 76, 50, 70].map((width) => (
                <i key={width} className="block h-1 rounded bg-[#D3D9DB]" style={{ width: `${width}%` }} />
              ))}
            </div>
            <p className="absolute bottom-5 left-[22px] text-[color:var(--on-image)]">
              <span className="block text-[56px] leading-[.9] tracking-[-0.03em] tabular-nums">{amount}</span>
              <span className="mono mt-2 block">One-time · no subscription</span>
            </p>
          </div>

          <ul className="mt-4 grid gap-2.5 text-[15px] leading-[1.35]">
            <li className="flex gap-2.5"><Tick size={16} className="mt-0.5 flex-none text-ink-2" />An AI concept portrait from your own front photo</li>
            <li className="flex gap-2.5"><Tick size={16} className="mt-0.5 flex-none text-ink-2" />A PDF roadmap: 5 to 8 priorities, a 7, 30 and 90-day plan, every source</li>
            <li className="flex gap-2.5"><Tick size={16} className="mt-0.5 flex-none text-ink-2" />Sent to {maskEmail(onboarding.email)}, usually within minutes</li>
          </ul>
          <p className="mono mt-4 text-ink-2">Local currency is shown at payment where available</p>

          <section className="mt-6" aria-label="Payment">
            {view.state === "loading" ? <p className="text-[15px] text-ink-2">Preparing checkout…</p> : null}
            {view.state === "unavailable" ? (
              <p role="alert" className="text-[15px] leading-[1.4] text-negative">
                {view.message}
              </p>
            ) : null}
            {view.state === "ready" && checkout?.mode === "stripe" ? (
              <StripePaymentForm clientSecret={checkout.clientSecret} onPaid={paid} onError={(message) => failed("ORDER_NOT_PAID", message)} />
            ) : null}
            {view.state === "ready" && checkout?.mode === "mock" && devPreviewEnabled ? (
              <div className="grid gap-3">
                <p className="rounded-[14px] bg-raised p-3.5 text-[13px] leading-[1.4] text-ink-2 shadow-[inset_0_0_0_1px_var(--color-rule)]">
                  <span className="mono block text-ink">Development preview</span>
                  No real payment is taken. Choose what the payment provider would report.
                </p>
                <button type="button" className="btn" disabled={busy} onClick={() => void simulate("succeeded")}>
                  <Lock size={15} />
                  Pay {amount} (simulated)
                </button>
                <div className="grid grid-cols-2 gap-3">
                  <button type="button" className="btn btn-secondary px-3 text-[15px]" disabled={busy} onClick={() => void simulate("declined")}>
                    Simulate decline
                  </button>
                  <button type="button" className="btn btn-secondary px-3 text-[15px]" disabled={busy} onClick={() => void simulate("redirect")}>
                    Simulate bank page
                  </button>
                </div>
              </div>
            ) : null}
            <InlineError id="checkout-error">{error}</InlineError>
          </section>

          <p className="mt-5 text-[13px] leading-[1.4] text-ink-2">
            We don&apos;t save face photos. If your payment opens another page, we may ask you to select your photo again after payment. You
            won&apos;t be charged twice.
          </p>
          <nav className="mono mt-4 flex justify-center gap-6 text-ink-2" aria-label="Policies">
            <Link href="/refunds" target="_blank">Refunds</Link>
            <Link href="/help" target="_blank">Help</Link>
            <Link href="/privacy" target="_blank">Privacy</Link>
          </nav>
        </main>
      </div>
    </div>
  );
}
