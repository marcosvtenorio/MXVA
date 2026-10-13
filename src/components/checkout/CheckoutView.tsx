"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { InlineError } from "@/components/common/InlineError";
import { Back, Lock, Tick } from "@/components/common/icons";
import { regionHint } from "@/features/analytics/attribution";
import { track } from "@/features/analytics/client";
import { defaultMethod, visitorInBrazil } from "@/features/checkout/method";
import { clearPixSession, loadPixSession, savePixSession } from "@/features/checkout/pix-session";
import { useCheckoutStore } from "@/features/checkout/store";
import { FACE_PROCESSING_CONSENT_VERSION, TERMS_VERSION } from "@/features/onboarding/schema";
import { useOnboardingStore } from "@/features/onboarding/store";
import { useResultStore } from "@/features/results/memory-store";
import { ApiClientError, api, type CreateOrderResponse, type PaymentMethod } from "@/lib/api-client";
import { DISPLAY_PRICE_BRL_CENTS, DISPLAY_PRICE_USD_CENTS, devPreviewEnabled, formatPrice } from "@/lib/config";
import { ExampleCompare } from "./ExampleCompare";
import { GlowUpTeaser } from "./GlowUpTeaser";
import { PixPayment } from "./PixPayment";
import { StickyPayBar } from "./StickyPayBar";

const StripePaymentForm = dynamic(() => import("./StripePaymentForm").then((m) => m.StripePaymentForm), {
  ssr: false,
  loading: () => <p className="text-[15px] text-ink-2">Loading secure payment…</p>,
});

function maskEmail(email: string): string {
  const [name = "", domain = ""] = email.split("@");
  return name && domain ? `${name.slice(0, 1)}•••@${domain}` : "your email";
}

type View = { state: "loading" } | { state: "ready" } | { state: "unavailable"; message: string };

const VALUE: readonly (readonly [string, string])[] = [
  ["Your AI glow-up concept:", "your own face, upgraded"],
  ["The haircut that suits your face shape,", "named so your barber can do it"],
  ["A step-by-step plan", "for skin, brows, beard, eyes and jawline"],
  ["What to do in 7, 30 and 90 days,", "in order of impact"],
  ["Backed by sources", "from dermatology and health bodies"],
];

/**
 * Paywall (spec §3, "Checkout arrangement"): heading, deliverables, one-time price,
 * payment, consent disclosure. No countdowns, no scarcity, no locked portrait.
 * Two ways to pay: Pix (Brazil, in reais) and card (Stripe). Visitors in Brazil see Pix
 * first; the other method is always one tap away.
 */
export function CheckoutView() {
  const router = useRouter();
  const offers = useCheckoutStore((s) => s.offers);
  const method = useCheckoutStore((s) => s.method);
  const card = useCheckoutStore((s) => s.card);
  const pix = useCheckoutStore((s) => s.pix);
  const { setOffers, setMethod, setCard, setPix } = useCheckoutStore.getState();
  const onboarding = useOnboardingStore();
  const [view, setView] = useState<View>(() => (offers && method ? { state: "ready" } : { state: "loading" }));
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const started = useRef(false);
  const inflight = useRef<Partial<Record<PaymentMethod, Promise<CreateOrderResponse>>>>({});

  const offer = offers?.find((candidate) => candidate.method === method);
  const otherMethod = offers?.find((candidate) => candidate.method !== method)?.method;

  // Which methods exist, whether this browser already paid, and an open Pix code to resume
  // (phones often reload the tab while the buyer is in the bank app).
  useEffect(() => {
    if (started.current || !onboarding.hydrated) return;
    started.current = true;
    useCheckoutStore.getState().setPaidHere(false);
    (async () => {
      try {
        const current = await api.currentOrder().catch(() => undefined);
        // A paid order still being made is finished there, never paid twice. A finished order
        // (delivered, or with support) doesn't block buying another report.
        if (current?.order.unfinished) return router.replace("/processing");
        if (current?.order.deliveredToEmail && useResultStore.getState().report) return router.replace("/result");
        // A card or Pix session kept from an order that is no longer open can't take this payment.
        if (!current?.pending) {
          setCard(undefined);
          setPix(undefined);
        }
        const { offers: available } = await api.checkoutOptions();
        // An open Pix code survives a reload (the order already exists; the email isn't kept in the browser).
        const saved = current?.pending?.method === "pix" ? loadPixSession() : undefined;
        if (saved && saved.checkout.expiresAt === current?.pending?.expiresAt && available.some((o) => o.method === "pix")) {
          setOffers(available);
          setPix(saved);
          setMethod("pix");
          setView({ state: "ready" });
          return;
        }
        clearPixSession();
        if (!hasCheckoutDetails()) return router.replace("/onboarding/review");
        if (available.length === 0) {
          setView({ state: "unavailable", message: "Checkout isn't open yet. Please check back soon." });
          return;
        }
        setOffers(available);
        const chosen = useCheckoutStore.getState().method;
        if (!chosen || !available.some((o) => o.method === chosen)) {
          setMethod(defaultMethod(available, visitorInBrazil()) ?? available[0]!.method);
        }
        setView({ state: "ready" });
      } catch (caught) {
        setView({ state: "unavailable", message: caught instanceof ApiClientError ? caught.message : "Checkout isn't available right now." });
      }
    })();
  }, [onboarding, router, setCard, setMethod, setOffers, setPix]);

  // Paid in another tab, or a PIX code paid in the bank app: move on from this tab too. Only an
  // order this tab saw open counts, so a finished earlier purchase never blocks buying again.
  useEffect(() => {
    if (view.state !== "ready") return;
    let cancelled = false;
    let sawOpen = false;
    const timer = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      api
        .currentOrder()
        .then(({ order, pending }) => {
          if (cancelled) return;
          if (pending) sawOpen = true;
          // This tab holds a checkout (card session or Pix code) for the browser's order.
          const { card: openCard, pix: openPix, confirming } = useCheckoutStore.getState();
          if (confirming) return; // this tab's own card payment is finishing: its handler moves on
          if (!(order.unfinished || ((sawOpen || Boolean(openCard || openPix)) && order.paid))) return;
          // The Pix code shown here was paid (the bank app): this tab is the one that paid.
          if (openPix) useCheckoutStore.getState().setPaidHere(true);
          router.replace("/processing");
        })
        .catch(() => undefined);
    }, 5000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [view.state, router]);

  // Next keeps this page alive (hidden) after leaving it. Coming back (e.g. Back from the
  // result) must check the order again before showing a payment form.
  useLayoutEffect(
    () => () => {
      started.current = false;
      setView({ state: "loading" });
    },
    [],
  );

  function hasCheckoutDetails(): boolean {
    const details = useOnboardingStore.getState();
    return Boolean(details.email && details.faceProcessingConsent && details.termsAccepted);
  }

  /** One order per payment attempt. Deduplicated, so a double effect or double tap opens one checkout. */
  function createOrder(forMethod: PaymentMethod): Promise<CreateOrderResponse> {
    inflight.current[forMethod] ??= api
      .createOrder({
        sku: "mxva_report_v1",
        method: forMethod,
        email: onboarding.email,
        adultConfirmed: onboarding.adultConfirmed,
        faceProcessingConsentVersion: FACE_PROCESSING_CONSENT_VERSION,
        termsVersion: TERMS_VERSION,
        marketingOptIn: onboarding.marketingOptIn,
        countryHint: regionHint(Intl.DateTimeFormat().resolvedOptions().timeZone, navigator.languages ?? []),
      })
      .finally(() => {
        delete inflight.current[forMethod];
      });
    return inflight.current[forMethod];
  }

  // Card: the payment form needs an open checkout session, so open one as soon as card is shown.
  useEffect(() => {
    if (view.state !== "ready" || method !== "card" || card) return;
    if (!hasCheckoutDetails()) {
      router.replace("/onboarding/review");
      return;
    }
    let cancelled = false;
    createOrder("card")
      .then((response) => {
        if (cancelled) return;
        if (response.alreadyPaid) return router.replace("/processing");
        if (response.checkout.mode === "pix") return;
        setCard({ checkout: response.checkout, price: response.price });
        track("checkout_started", { method: "card" });
      })
      .catch((caught) => {
        if (cancelled) return;
        failed(caught instanceof ApiClientError ? caught.code : "SERVICE_UNAVAILABLE", caught instanceof ApiClientError ? caught.message : "Checkout isn't available right now.");
      });
    return () => {
      cancelled = true;
    };
    // createOrder/failed are stable for this purpose: they read the latest store and onboarding values.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view.state, method, card, router, setCard]);

  async function generatePix() {
    if (!hasCheckoutDetails()) return router.replace("/onboarding/review");
    setBusy(true);
    setError(undefined);
    try {
      const response = await createOrder("pix");
      if (response.alreadyPaid) return router.replace("/processing");
      if (response.checkout.mode !== "pix") throw new ApiClientError("SERVICE_UNAVAILABLE", "Pix isn't available right now.", true, 503);
      const session = { checkout: response.checkout, price: response.price };
      setPix(session);
      savePixSession(session);
      track("checkout_started", { method: "pix" });
    } catch (caught) {
      failed(caught instanceof ApiClientError ? caught.code : "SERVICE_UNAVAILABLE", caught instanceof ApiClientError ? caught.message : "Pix isn't available right now.");
    } finally {
      setBusy(false);
    }
  }

  function switchTo(next: PaymentMethod) {
    setError(undefined);
    // A new attempt replaces the old one (the server closes an unpaid card session).
    setPix(undefined);
    clearPixSession();
    setCard(undefined);
    setMethod(next);
  }

  const amount = offer
    ? formatPrice(offer.price.amountMinor, offer.price.currency)
    : method === "pix"
      ? formatPrice(DISPLAY_PRICE_BRL_CENTS, "brl")
      : formatPrice(DISPLAY_PRICE_USD_CENTS, "usd");

  function paid() {
    useCheckoutStore.getState().setPaidHere(true);
    clearPixSession();
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
            Your glow-up is
            <br />
            <span>one step away.</span>
          </h1>

          <GlowUpTeaser />

          <section aria-labelledby="value-heading" className="mt-6">
            <h2 id="value-heading" className="mono text-ink-2">What you get</h2>
            <ul className="mt-3 grid gap-2.5 text-[15px] leading-[1.35]">
              {VALUE.map(([lead, rest]) => (
                <li key={lead} className="flex gap-2.5">
                  <Tick size={16} className="mt-0.5 flex-none text-positive" />
                  <span>
                    <strong className="font-semibold">{lead}</strong> {rest}
                  </span>
                </li>
              ))}
              <li className="flex gap-2.5">
                <Tick size={16} className="mt-0.5 flex-none text-positive" />
                <span>
                  <strong className="font-semibold">Sent to {maskEmail(onboarding.email)}</strong> as a PDF, yours to keep
                </span>
              </li>
            </ul>
          </section>

          <section aria-labelledby="example-heading" className="mt-7">
            <h2 id="example-heading" className="mono text-ink-2">See a real example</h2>
            <ExampleCompare />
          </section>

          <section aria-label="Price" className="mt-7 rounded-[22px] bg-raised p-5 shadow-[inset_0_0_0_1px_var(--color-rule)]">
            <p className="whitespace-nowrap text-[clamp(38px,12vw,52px)] leading-none tracking-[-0.03em] tabular-nums">{amount}</p>
            <p className="mono mt-2 text-ink-2">One-time payment · no weekly subscription</p>
            <p className="mt-4 flex gap-2.5 border-t border-rule pt-3.5 text-[14px] leading-[1.4]">
              <Lock size={15} className="mt-0.5 flex-none text-ink-2" />
              <span>
                <strong className="font-semibold">Money-back promise.</strong> If we can&apos;t make your report, you get a full refund.
              </span>
            </p>
          </section>
          {method === "card" ? <p className="mono mt-4 text-ink-2">Local currency is shown at payment where available</p> : null}
          {offer?.sandbox && !offer.simulated ? (
            <p className="mono mt-3 rounded-[10px] bg-raised px-3 py-2 text-ink shadow-[inset_0_0_0_1px_var(--color-rule)]">
              Test mode · no real money{method === "card" ? " · card 4242 4242 4242 4242, any future date, any CVC" : ""}
            </p>
          ) : null}

          <section id="payment" className="mt-6 scroll-mt-4" aria-label="Payment">
            {view.state === "loading" ? <p className="text-[15px] text-ink-2">Preparing checkout…</p> : null}
            {view.state === "unavailable" ? (
              <p role="alert" className="text-[15px] leading-[1.4] text-negative">
                {view.message}
              </p>
            ) : null}

            {view.state === "ready" && method === "pix" && offer ? (
              <PixPayment
                offer={offer}
                session={pix}
                busy={busy}
                onGenerate={() => void generatePix()}
                onPaid={paid}
                onError={(message) => failed("ORDER_NOT_PAID", message)}
              />
            ) : null}

            {view.state === "ready" && method === "card" ? (
              <>
                {!card && !error ? <p className="text-[15px] text-ink-2">Preparing card payment…</p> : null}
                {card?.checkout.mode === "stripe" ? (
                  <StripePaymentForm
                    key={card.checkout.clientSecret}
                    clientSecret={card.checkout.clientSecret}
                    onPaid={paid}
                    onError={(message) => failed("ORDER_NOT_PAID", message)}
                    onStale={() => {
                      // Checkout was opened again in another tab: load this browser's current one.
                      setError("Your checkout was refreshed. Please enter your card again.");
                      setCard(undefined);
                    }}
                  />
                ) : null}
                {card?.checkout.mode === "mock" && devPreviewEnabled ? (
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
              </>
            ) : null}

            <InlineError id="checkout-error">{error}</InlineError>

            {view.state === "ready" && otherMethod ? (
              <button type="button" className="pill-link mt-5 text-[15px] font-semibold" onClick={() => switchTo(otherMethod)}>
                {otherMethod === "pix" ? "In Brazil? Pay with Pix" : "Pay by card instead"}
              </button>
            ) : null}
          </section>

          <p className="mono mt-6 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-ink-2">
            <span className="inline-flex items-center gap-1.5">
              <Lock size={12} /> Secure payment
            </span>
            <span>Photos never stored</span>
            <span>No second charges</span>
          </p>
          <nav className="mono mt-4 flex justify-center gap-6 pb-20 text-ink-2" aria-label="Policies">
            <Link href="/refunds" target="_blank">Refunds</Link>
            <Link href="/help" target="_blank">Help</Link>
            <Link href="/privacy" target="_blank">Privacy</Link>
          </nav>
        </main>
      </div>
      {view.state === "ready" ? <StickyPayBar price={amount} targetId="payment" /> : null}
    </div>
  );
}
