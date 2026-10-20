"use client";

import Link from "next/link";
import { useCallback, useEffect, useEffectEvent, useRef, useState } from "react";
import { InlineError } from "@/components/common/InlineError";
import { PlasterHead } from "@/components/common/StudioArt";
import { PhotoCapture } from "@/components/photos/PhotoCapture";
import { track } from "@/features/analytics/client";
import { fulfillInputSchema, timeZoneSchema } from "@/features/onboarding/schema";
import { useCheckoutStore } from "@/features/checkout/store";
import { useOnboardingStore } from "@/features/onboarding/store";
import { frontPhotoReady, usePhotoStore } from "@/features/photos/memory-store";
import type { PublicOrderStatus } from "@/features/orders/states";
import { API_ERRORS } from "@/lib/api-errors";
import { ApiClientError, api, type QueueTicket } from "@/lib/api-client";

type Mode =
  | { kind: "checking" }
  | { kind: "waiting_payment" }
  | { kind: "not_paid" }
  | { kind: "reselect"; reason?: string }
  | { kind: "sending" }
  /** The report is in the server's queue. The ticket is known only in the tab that sent the photo. */
  | { kind: "queued"; ticket?: QueueTicket }
  /** Paid in another tab, which is about to send its photo. */
  | { kind: "elsewhere"; canStartHere?: boolean }
  /** The photo didn't reach the queue; nothing was started. */
  | { kind: "request_error"; message: string; canRetry: boolean }
  /** The report failed after the server's retries; the buyer was emailed a link too. */
  | { kind: "failed"; canRetry: boolean }
  | { kind: "delivered" }
  | { kind: "support"; message: string };

const RESELECT_COPY =
  "Your payment is safe. Please reselect your photos so we can complete your report. There is no second charge.";

/** How long an open page keeps checking for the email to go out. The report arrives either way. */
const FOLLOW_FOR_MS = 90 * 60_000;

/** The buyer's time zone, so the report carries their date. Left out if the browser's is unknown. */
function browserTimeZone(): string | undefined {
  try {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return timeZoneSchema.safeParse(zone).success ? zone : undefined;
  } catch {
    return undefined;
  }
}

function minutes(value: number): string {
  return value <= 1 ? "about a minute" : `about ${value} minutes`;
}

function Sheet({ children }: { children: React.ReactNode }) {
  return (
    <div className="sheet flex-1">
      <div className="grabber" aria-hidden="true" />
      <div className="mx-auto w-full max-w-[480px] px-5 pb-[max(20px,calc(env(safe-area-inset-bottom)+12px))] pt-4">{children}</div>
    </div>
  );
}

/**
 * After payment. Confirms payment with the server (never the URL), sends the in-memory photo and
 * shows that the request was received: the report is made in the server's queue and arrives by
 * email. Nobody waits for it here. Recovers without a second charge when the browser lost the photo.
 */
export function ProcessingView() {
  const [mode, setMode] = useState<Mode>({ kind: "checking" });
  const [consent, setConsent] = useState(false);
  const onboarding = useOnboardingStore();
  const front = usePhotoStore((s) => s.photos.front);
  const photosReady = usePhotoStore((s) => frontPhotoReady(s) && s.ownershipConfirmed);
  // Only the tab that took the payment sends the photo by itself; other tabs follow it.
  const paidHere = useCheckoutStore((s) => s.paidHere);
  const confirmedTracked = useRef(false);
  const started = useRef(false);

  // The plan and the concept are decided from the photo; only the buyer's constraints go along.
  const reportInput = fulfillInputSchema.safeParse({ constraints: onboarding.constraints, timeZone: browserTimeZone() });
  const consentGiven = onboarding.faceProcessingConsent || consent;

  const start = useCallback(async () => {
    if (started.current) return;
    if (!reportInput.success) {
      setMode({ kind: "support", message: "We lost your answers when this page reloaded. Contact support and we'll finish your report. You won't pay again." });
      return;
    }
    const photos = usePhotoStore.getState().photos;
    if (!photos.front) {
      setMode({ kind: "reselect" });
      return;
    }
    started.current = true;
    setMode({ kind: "sending" });
    const form = new FormData();
    form.set("front", new File([photos.front.blob], "front.jpg", { type: "image/jpeg" }));
    if (photos.left) form.set("left", new File([photos.left.blob], "left.jpg", { type: "image/jpeg" }));
    if (photos.right) form.set("right", new File([photos.right.blob], "right.jpg", { type: "image/jpeg" }));
    form.set("input", JSON.stringify(reportInput.data));
    form.set("faceProcessingConsent", "true");
    try {
      const { queue } = await api.fulfill(form);
      // The photo is with the server now: nothing of it stays in this tab.
      usePhotoStore.getState().clearAll();
      track("report_requested", {});
      setMode({ kind: "queued", ticket: queue });
    } catch (caught) {
      started.current = false;
      const error = caught instanceof ApiClientError ? caught : undefined;
      track("client_error", { code: error?.code ?? "SERVICE_UNAVAILABLE" });
      if (error?.code === "ALREADY_PROCESSING") {
        // Another tab already sent it: this one just shows that it's on its way.
        setMode({ kind: "queued" });
        return;
      }
      if (error && API_ERRORS[error.code].action === "reselect_photo") {
        // Refused before anything started (no attempt used): pick another photo.
        usePhotoStore.getState().clearAll();
        setMode({ kind: "reselect", reason: error.message });
        return;
      }
      setMode({ kind: "request_error", message: error?.message ?? "We couldn't send your photo.", canRetry: error?.retryable ?? true });
    }
  }, [reportInput]);

  const route = useCallback(
    (order: PublicOrderStatus) => {
      if (order.paid && !confirmedTracked.current) {
        confirmedTracked.current = true;
        track("payment_confirmed", {});
      }
      switch (order.status) {
        case "pending_payment":
          return setMode({ kind: "waiting_payment" });
        case "expired":
          return setMode({ kind: "not_paid" });
        case "paid":
          if (photosReady && consentGiven && paidHere) return void start();
          // Paid in another tab, which is about to send its photo: follow it, or send it from here.
          if (photosReady && consentGiven) return setMode({ kind: "elsewhere", canStartHere: true });
          return setMode({ kind: "reselect" });
        case "processing":
          return setMode((current) => (current.kind === "queued" ? current : { kind: "queued" }));
        case "delivered_to_provider":
          return setMode({ kind: "delivered" });
        case "failed_retryable":
        case "generated_email_failed":
          return setMode({ kind: "failed", canRetry: order.canRequestRetry });
        case "withdrawn":
          return setMode({ kind: "support", message: "You withdrew consent, so nothing will be processed. Contact support for your refund." });
        case "refunded":
          return setMode({ kind: "support", message: "This order was refunded." });
        case "needs_support":
          return setMode({ kind: "support", message: "Our team needs to take a look at this order. We'll email you. You won't pay again." });
      }
    },
    [consentGiven, paidHere, photosReady, start],
  );

  // Server-confirmed status; polls briefly while the payment provider confirms.
  useEffect(() => {
    if (!onboarding.hydrated || started.current) return;
    let cancelled = false;
    let attempts = 0;
    const poll = async () => {
      try {
        const { order } = await api.currentOrder();
        if (cancelled) return;
        if (order.status === "pending_payment" && attempts++ < 30) {
          setMode({ kind: "waiting_payment" });
          setTimeout(() => void poll(), 2000);
          return;
        }
        route(order);
      } catch (caught) {
        if (cancelled) return;
        const message =
          caught instanceof ApiClientError && caught.code === "ORDER_SESSION_INVALID"
            ? "We couldn't find a paid order in this browser. If you paid, check your email or contact support. You won't pay again."
            : "We couldn't check your order. Refresh in a moment.";
        setMode({ kind: "support", message });
      }
    };
    void poll();
    return () => {
      cancelled = true;
    };
    // Run once per mount after hydration; `route` captures the latest state when called.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onboarding.hydrated]);

  // While the report is in the queue (or another tab is about to send it), an open page follows the
  // order so it can say when the email went out. Closing the page changes nothing.
  const onOrderSettled = useEffectEvent((order: PublicOrderStatus) => route(order));
  useEffect(() => {
    if (mode.kind !== "queued" && mode.kind !== "elsewhere") return;
    const following = mode.kind === "elsewhere";
    let cancelled = false;
    const deadline = Date.now() + FOLLOW_FOR_MS;
    const every = following ? 4000 : 10_000;
    const poll = async () => {
      if (cancelled) return;
      try {
        const { order } = await api.currentOrder();
        if (cancelled) return;
        const waiting = following ? order.status === "paid" : order.status === "processing";
        if (!waiting) return onOrderSettled(order);
      } catch {
        // Offline for a moment: keep trying until the deadline.
      }
      if (Date.now() < deadline) setTimeout(() => void poll(), every);
    };
    const first = setTimeout(() => void poll(), every);
    return () => {
      cancelled = true;
      clearTimeout(first);
    };
  }, [mode.kind]);

  async function retry() {
    try {
      await api.requestRetry();
      usePhotoStore.getState().clearAll();
      setMode({ kind: "reselect" });
    } catch (caught) {
      setMode({ kind: "support", message: caught instanceof ApiClientError ? caught.message : "Retry isn't available. Contact support." });
    }
  }

  const lightOff = mode.kind !== "delivered";

  return (
    <div className="flex min-h-dvh flex-col bg-raised">
      <div className={`stage relative h-[52dvh] min-h-[300px] rounded-none ${lightOff ? "stage-off" : ""}`}>
        {mode.kind === "reselect" && front ? null : <PlasterHead className="absolute inset-x-0 bottom-[30px] h-[78%] w-full" dimmed={lightOff} />}
        <span className="crop crop-tl" style={{ top: "calc(env(safe-area-inset-top) + 16px)" }} aria-hidden="true" />
        <span className="crop crop-tr" style={{ top: "calc(env(safe-area-inset-top) + 16px)" }} aria-hidden="true" />
        {/* On frost glass, clear of the crop marks: legible on the dim and the lit stage alike. */}
        <div className="readouts mono frost right-10 rounded-[14px] px-3 py-2.5" style={{ top: "calc(env(safe-area-inset-top) + 40px)" }}>
          <span>{lightOff ? "Light · off" : "Sent"}</span>
        </div>
      </div>
      <Sheet>
        <main id="main" aria-live="polite">
          {mode.kind === "checking" ? <h1 className="title-28">Checking your payment…</h1> : null}

          {mode.kind === "waiting_payment" ? (
            <>
              <h1 className="title-28 two-tone">
                Confirming your payment. <span>This takes a few seconds.</span>
              </h1>
              <p className="mt-3 text-[15px] leading-[1.4] text-ink-2">We wait for the payment provider to confirm before making anything.</p>
            </>
          ) : null}

          {mode.kind === "not_paid" ? (
            <>
              <h1 className="title-28 two-tone">
                No payment yet. <span>Nothing was charged.</span>
              </h1>
              <Link href="/checkout" className="btn mt-6">Back to checkout</Link>
            </>
          ) : null}

          {mode.kind === "sending" ? (
            <>
              <h1 className="title-28 two-tone">
                Payment confirmed. <span>Sending your photo.</span>
              </h1>
              <p className="mt-3 text-[15px] leading-[1.4] text-ink-2">This takes a few seconds.</p>
            </>
          ) : null}

          {mode.kind === "queued" ? (
            mode.ticket ? (
              <>
                <h1 className="title-28 two-tone">
                  Request received. <span>Your report arrives by email in {minutes(mode.ticket.etaMinutes)}.</span>
                </h1>
                {mode.ticket.position > 1 ? (
                  <p className="mt-3 text-[15px] leading-[1.4] text-ink-2">You&apos;re number {mode.ticket.position} in line.</p>
                ) : null}
                <p className="mt-3 text-[15px] leading-[1.4] text-ink-2">
                  You can close this page. If anything goes wrong, we&apos;ll email you a link to try again. You won&apos;t pay again.
                </p>
              </>
            ) : (
              <>
                <h1 className="title-28 two-tone">
                  Your report is being made. <span>It arrives by email.</span>
                </h1>
                <p className="mt-3 text-[15px] leading-[1.4] text-ink-2">You can close this page. You won&apos;t pay again.</p>
              </>
            )
          ) : null}

          {mode.kind === "reselect" ? (
            <>
              <h1 className="title-28">Add your front photo again</h1>
              <p className="mt-3 text-[15px] leading-[1.4] text-ink-2">{mode.reason ?? RESELECT_COPY}</p>
              <div className="mt-5">
                <PhotoCapture frontOnly />
              </div>
              {!onboarding.faceProcessingConsent ? (
                <label className="mt-2 flex min-h-11 cursor-pointer items-start gap-3 py-2.5 text-[15px] leading-[1.4]">
                  <input type="checkbox" className="checkbox" checked={consent} onChange={(event) => setConsent(event.currentTarget.checked)} />
                  <span>
                    I agree my photo goes to MXVA&apos;s server and its AI providers only to make my report, emailed to me with my photo next to
                    the concept (<Link href="/privacy" target="_blank" className="underline underline-offset-2">Privacy Policy</Link>).
                  </span>
                </label>
              ) : null}
              <button
                type="button"
                className="btn mt-6"
                disabled={!photosReady || !consentGiven}
                onClick={() => {
                  track("reselect_requested", {});
                  void start();
                }}
              >
                Create my report
              </button>
            </>
          ) : null}

          {mode.kind === "elsewhere" ? (
            <>
              <h1 className="title-28 two-tone">
                Your report is on its way. <span>It arrives by email.</span>
              </h1>
              <p className="mt-3 text-[15px] leading-[1.4] text-ink-2">Another tab is sending your photo. You won&apos;t pay again.</p>
              {mode.canStartHere ? (
                <button
                  type="button"
                  className="btn btn-secondary mt-6"
                  onClick={() => {
                    track("reselect_requested", {});
                    void start();
                  }}
                >
                  Make it in this tab instead
                </button>
              ) : null}
            </>
          ) : null}

          {mode.kind === "delivered" ? (
            <>
              <h1 className="title-28 two-tone">
                Your report is in your email. <span>It&apos;s your permanent copy.</span>
              </h1>
              <p className="mt-3 text-[15px] leading-[1.4] text-ink-2">
                Look for “Your personalized looksmaxxing report is ready”. If it isn&apos;t there, check your spam folder.
              </p>
            </>
          ) : null}

          {mode.kind === "request_error" ? (
            <>
              <h1 className="title-28 two-tone">
                We couldn&apos;t send your photo. <span>Your payment is safe.</span>
              </h1>
              <InlineError id="processing-error">{mode.message}</InlineError>
              {mode.canRetry ? (
                <button type="button" className="btn mt-6" onClick={() => void start()}>
                  Try again
                </button>
              ) : null}
              <p className="mt-4 text-[15px] text-ink-2">
                Still stuck? <Link href="/help" className="underline underline-offset-2">Contact support</Link>. You won&apos;t pay again.
              </p>
            </>
          ) : null}

          {mode.kind === "failed" ? (
            <>
              <h1 className="title-28 two-tone">
                That didn&apos;t finish. <span>Your payment is safe.</span>
              </h1>
              <InlineError id="processing-error">
                We couldn&apos;t make your report, even after trying again. We emailed you a link to create it again; you can also do it here.
              </InlineError>
              {mode.canRetry ? (
                <button type="button" className="btn mt-6" onClick={() => void retry()}>
                  Try again
                </button>
              ) : null}
              <p className="mt-4 text-[15px] text-ink-2">
                Still stuck? <Link href="/help" className="underline underline-offset-2">Contact support</Link>. You won&apos;t pay again.
              </p>
            </>
          ) : null}

          {mode.kind === "support" ? (
            <>
              <h1 className="title-28">We need to help with this one.</h1>
              <p className="mt-3 text-[15px] leading-[1.4] text-ink-2">{mode.message}</p>
              <Link href="/help" className="btn btn-secondary mt-6">Contact support</Link>
            </>
          ) : null}

          {/* The report goes on without this page: the buyer can leave it. */}
          {mode.kind === "queued" || mode.kind === "elsewhere" || mode.kind === "delivered" ? (
            <Link href="/" className="btn btn-secondary mt-6">
              Back to home
            </Link>
          ) : null}
        </main>
      </Sheet>
    </div>
  );
}
