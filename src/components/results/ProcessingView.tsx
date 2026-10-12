"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { InlineError } from "@/components/common/InlineError";
import { Tick } from "@/components/common/icons";
import { PlasterHead } from "@/components/common/StudioArt";
import { PhotoCapture } from "@/components/photos/PhotoCapture";
import { track } from "@/features/analytics/client";
import { reportInputSchema } from "@/features/onboarding/schema";
import { useOnboardingStore } from "@/features/onboarding/store";
import { frontPhotoReady, usePhotoStore } from "@/features/photos/memory-store";
import { base64ToBlob, useResultStore } from "@/features/results/memory-store";
import type { PublicOrderStatus } from "@/features/orders/states";
import { API_ERRORS } from "@/lib/api-errors";
import { ApiClientError, api, type FulfillmentPhase } from "@/lib/api-client";

const PHASES: { id: FulfillmentPhase; label: string }[] = [
  { id: "analysing_photo", label: "Reading your photo" },
  { id: "preparing_image", label: "Preparing image" },
  { id: "checking_image", label: "Checking likeness" },
  { id: "building_report", label: "Building report" },
  { id: "sending_email", label: "Sending email" },
];

type Mode =
  | { kind: "checking" }
  | { kind: "waiting_payment" }
  | { kind: "not_paid" }
  | { kind: "reselect"; reason?: string }
  | { kind: "running"; phase?: FulfillmentPhase }
  | { kind: "elsewhere" }
  | { kind: "error"; message: string; canRetry: boolean }
  | { kind: "delivered" }
  | { kind: "support"; message: string };

const RESELECT_COPY =
  "Your payment is safe. Please reselect your photos so we can complete your report — there is no second charge.";

function Sheet({ children }: { children: React.ReactNode }) {
  return (
    <div className="sheet flex-1">
      <div className="grabber" aria-hidden="true" />
      <div className="mx-auto w-full max-w-[480px] px-5 pb-[max(20px,calc(env(safe-area-inset-bottom)+12px))] pt-4">{children}</div>
    </div>
  );
}

function PhaseList({ current }: { current?: FulfillmentPhase }) {
  const index = current ? PHASES.findIndex((phase) => phase.id === current) : -1;
  return (
    <ol className="mt-4 grid gap-1" aria-label="Progress">
      {PHASES.map((phase, i) => {
        const state = i < index ? "done" : i === index ? "now" : "todo";
        return (
          <li
            key={phase.id}
            aria-current={state === "now" ? "step" : undefined}
            className={`mono grid h-[34px] grid-cols-[30px_1fr_auto] items-center rounded-lg px-2.5 ${
              state === "now" ? "bg-accent text-on-accent" : state === "done" ? "text-ink" : "text-ink-2"
            }`}
          >
            <span>{String(i + 1).padStart(2, "0")}</span>
            <span>{phase.label}</span>
            <span>{state === "done" ? <Tick size={14} className="text-positive" /> : state === "now" ? "Now" : ""}</span>
          </li>
        );
      })}
    </ol>
  );
}

/**
 * After payment: the result layout with the key light off. Confirms payment with the
 * server (never the URL), sends the in-memory photos for fulfilment, streams the real
 * phases, and recovers without a second charge when the browser lost the photos.
 */
export function ProcessingView() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>({ kind: "checking" });
  const [consent, setConsent] = useState(false);
  const onboarding = useOnboardingStore();
  const front = usePhotoStore((s) => s.photos.front);
  const photosReady = usePhotoStore((s) => frontPhotoReady(s) && s.ownershipConfirmed);
  const setResult = useResultStore((s) => s.setResult);
  const hasResult = useResultStore((s) => Boolean(s.report));
  const confirmedTracked = useRef(false);
  const started = useRef(false);

  const reportInput = reportInputSchema.safeParse({
    goals: onboarding.goals,
    focusAreas: onboarding.focusAreas,
    timeline: onboarding.timeline,
    budget: onboarding.budget,
    preferences: onboarding.preferences,
    constraints: onboarding.constraints,
  });
  const consentGiven = onboarding.faceProcessingConsent || consent;

  const start = useCallback(async () => {
    if (started.current) return;
    if (!reportInput.success) {
      setMode({ kind: "support", message: "We lost your answers when this page reloaded. Contact support and we'll finish your report — you won't pay again." });
      return;
    }
    const photos = usePhotoStore.getState().photos;
    if (!photos.front) {
      setMode({ kind: "reselect" });
      return;
    }
    started.current = true;
    setMode({ kind: "running" });
    const form = new FormData();
    form.set("front", new File([photos.front.blob], "front.jpg", { type: "image/jpeg" }));
    if (photos.left) form.set("left", new File([photos.left.blob], "left.jpg", { type: "image/jpeg" }));
    if (photos.right) form.set("right", new File([photos.right.blob], "right.jpg", { type: "image/jpeg" }));
    form.set("input", JSON.stringify(reportInput.data));
    form.set("faceProcessingConsent", "true");
    try {
      const result = await api.fulfill(form, (phase) => setMode({ kind: "running", phase }));
      setResult({
        report: result.report,
        image: base64ToBlob(result.image.base64, result.image.mime),
        pdf: base64ToBlob(result.pdf.base64, "application/pdf"),
        pdfFilename: result.pdf.filename,
        emailDelivered: result.emailDelivered,
      });
      router.replace("/result");
    } catch (caught) {
      started.current = false;
      const error = caught instanceof ApiClientError ? caught : undefined;
      track("client_error", { code: error?.code ?? "SERVICE_UNAVAILABLE" });
      const action = error ? API_ERRORS[error.code].action : "retry";
      if (error && action === "reselect_photo") {
        // The failed attempt left the order retryable: reset it (no charge) before a new photo.
        try {
          await api.requestRetry();
        } catch {
          setMode({ kind: "support", message: "We couldn't use these photos and the retries are used up. Contact support — you won't pay again." });
          return;
        }
        usePhotoStore.getState().clearAll();
        setMode({ kind: "reselect", reason: error.message });
        return;
      }
      setMode({ kind: "error", message: error?.message ?? "Something interrupted your report.", canRetry: Boolean(error?.retryable) });
    }
  }, [reportInput, router, setResult]);

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
          if (photosReady && consentGiven) return void start();
          return setMode({ kind: "reselect" });
        case "processing":
          return setMode(order.canSubmitPhotos ? { kind: "reselect" } : { kind: "elsewhere" });
        case "delivered_to_provider":
          if (hasResult) return router.replace("/result");
          return setMode({ kind: "delivered" });
        case "failed_retryable":
        case "generated_email_failed":
          return setMode({ kind: "error", message: "Your last attempt didn't finish.", canRetry: order.canRequestRetry });
        case "withdrawn":
          return setMode({ kind: "support", message: "You withdrew consent, so nothing will be processed. Contact support for your refund." });
        case "refunded":
          return setMode({ kind: "support", message: "This order was refunded." });
        case "needs_support":
          return setMode({ kind: "support", message: "Our team needs to take a look at this order. We'll email you — you won't pay again." });
      }
    },
    [consentGiven, hasResult, photosReady, router, start],
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
            ? "We couldn't find a paid order in this browser. If you paid, check your email or contact support — you won't pay again."
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
        <div className="readouts mono text-[#EEF2F3]" style={{ top: "calc(env(safe-area-inset-top) + 30px)" }}>
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

          {mode.kind === "running" ? (
            <>
              <h1 className="title-28 two-tone">
                Payment confirmed. <span>Let&apos;s create your report.</span>
              </h1>
              <PhaseList current={mode.phase} />
              <p className="mt-5 text-center text-[15px] leading-[1.4] text-ink-2">Keep this tab open until it finishes. Photos are processed in memory, never stored.</p>
            </>
          ) : null}

          {mode.kind === "reselect" ? (
            <>
              <h1 className="title-28">Add your front photo again</h1>
              <p className="mt-3 text-[15px] leading-[1.4] text-ink-2">{mode.reason ?? RESELECT_COPY}</p>
              <div className="mt-5">
                <PhotoCapture frontOnly />
              </div>
              {!onboarding.faceProcessingConsent ? (
                <label className="mt-4 flex cursor-pointer items-start gap-3 text-[15px] leading-[1.4]">
                  <input type="checkbox" className="checkbox" checked={consent} onChange={(event) => setConsent(event.currentTarget.checked)} />
                  <span>
                    I agree that my photo is sent to MXVA&apos;s server and its AI providers, only to create my report (
                    <Link href="/privacy" target="_blank" className="underline underline-offset-2">Privacy Policy</Link>).
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
                Your report is being created. <span>Possibly in another tab.</span>
              </h1>
              <p className="mt-3 text-[15px] leading-[1.4] text-ink-2">Check your email in a few minutes. You won&apos;t pay again.</p>
            </>
          ) : null}

          {mode.kind === "delivered" ? (
            <>
              <h1 className="title-28 two-tone">
                Your report is in your email. <span>It&apos;s your permanent copy.</span>
              </h1>
              <p className="mt-3 text-[15px] leading-[1.4] text-ink-2">
                This page doesn&apos;t keep your report after a reload. Look for “Your personalized looksmaxxing report is ready”.
              </p>
            </>
          ) : null}

          {mode.kind === "error" ? (
            <>
              <h1 className="title-28 two-tone">
                That didn&apos;t finish. <span>Your payment is safe.</span>
              </h1>
              <InlineError id="processing-error">{mode.message}</InlineError>
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
        </main>
      </Sheet>
    </div>
  );
}
