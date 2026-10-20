"use client";

import { useEffect, useEffectEvent, useRef, useState, useSyncExternalStore } from "react";
import { ChevronDown, Copy, Lock, Tick } from "@/components/common/icons";
import type { PixSession } from "@/features/checkout/store";
import { ApiClientError, api, type CheckoutOffer } from "@/lib/api-client";
import { formatPrice } from "@/lib/config";
import { PixQrCode } from "./PixQrCode";

const POLL_MS = 3000;

function validUntil(iso: string): string {
  return new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
}

const TOUCH_QUERY = "(pointer: coarse)";

/** A phone pays Pix by pasting the code in the bank app on the same phone; a computer shows the QR to scan. */
function usePhone(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const query = window.matchMedia(TOUCH_QUERY);
      query.addEventListener("change", onChange);
      return () => query.removeEventListener("change", onChange);
    },
    () => window.matchMedia(TOUCH_QUERY).matches,
    () => true,
  );
}

/**
 * PIX (Brazil): generate a code, pay it in any bank app, and the page notices by itself.
 * Payment is confirmed only by the server asking AbacatePay; this page just polls our API.
 * The expiry is the charge's real one, shown as a time, never as a countdown.
 * On a phone the copy button comes first (you can't scan your own screen); on a computer, the QR.
 */
export function PixPayment({
  offer,
  session,
  busy,
  onGenerate,
  onPaid,
  onError,
}: {
  offer: CheckoutOffer;
  session: PixSession | undefined;
  busy: boolean;
  onGenerate: () => void;
  onPaid: () => void;
  onError: (message: string) => void;
}) {
  const price = formatPrice(offer.price.amountMinor, offer.price.currency);
  const checkout = session?.checkout;
  const phone = usePhone();
  // Keyed by code, so a new code starts fresh without resetting state in an effect.
  const [expiredCode, setExpiredCode] = useState<string>();
  const [copiedCode, setCopiedCode] = useState<string>();
  const [simulating, setSimulating] = useState(false);
  const codeRef = useRef<HTMLParagraphElement>(null);
  const expired = Boolean(checkout && expiredCode === checkout.brCode);
  const copied = Boolean(checkout && copiedCode === checkout.brCode);
  const paidFromPoll = useEffectEvent(() => onPaid());

  // Flip to expired at the charge's real expiry.
  useEffect(() => {
    if (!checkout) return;
    const remaining = Math.max(0, Date.parse(checkout.expiresAt) - Date.now());
    const timer = window.setTimeout(() => setExpiredCode(checkout.brCode), Math.min(remaining, 2 ** 31 - 1));
    return () => window.clearTimeout(timer);
  }, [checkout]);

  // Live status: poll while the code is open and the page is visible; check at once on return
  // from the bank app.
  useEffect(() => {
    if (!checkout || expired) return;
    let stopped = false;
    let inFlight = false;
    async function poll() {
      if (stopped || inFlight || document.visibilityState !== "visible") return;
      inFlight = true;
      try {
        const { order } = await api.currentOrder();
        if (stopped) return;
        if (order.paid) {
          stopped = true;
          paidFromPoll();
        } else if (order.status === "expired") setExpiredCode(checkout?.brCode);
      } catch {
        // Offline for a moment: the next tick tries again. Nothing is lost; payment is server-side.
      } finally {
        inFlight = false;
      }
    }
    const interval = window.setInterval(() => void poll(), POLL_MS);
    const onVisible = () => void poll();
    document.addEventListener("visibilitychange", onVisible);
    void poll();
    return () => {
      stopped = true;
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [checkout, expired]);

  async function copy() {
    if (!checkout) return;
    try {
      await navigator.clipboard.writeText(checkout.brCode);
      setCopiedCode(checkout.brCode);
      window.setTimeout(() => setCopiedCode((current) => (current === checkout.brCode ? undefined : current)), 4000);
    } catch {
      // Clipboard blocked: select the code so it can be copied by hand.
      const node = codeRef.current;
      const selection = window.getSelection();
      if (node && selection) {
        const range = document.createRange();
        range.selectNodeContents(node);
        selection.removeAllRanges();
        selection.addRange(range);
      }
    }
  }

  async function simulate() {
    if (!checkout) return;
    setSimulating(true);
    try {
      const { order } = checkout.simulated ? await api.mockPay("succeeded") : await api.pixSimulate();
      if (order.paid) onPaid();
    } catch (caught) {
      onError(caught instanceof ApiClientError ? caught.message : "The sandbox couldn't simulate this payment.");
    } finally {
      setSimulating(false);
    }
  }

  if (!checkout) {
    return (
      <div className="grid gap-3">
        <button type="button" className="btn" disabled={busy} aria-busy={busy} onClick={onGenerate}>
          {busy ? <span className="btn-spinner" aria-hidden="true" /> : <Lock size={15} />}
          {busy ? "Creating your Pix code…" : `Pay ${price} with Pix`}
        </button>
        <p className="text-center text-[15px] leading-[1.4] text-ink-2">You get a code to paste in your bank app. Approved in seconds.</p>
      </div>
    );
  }

  if (expired) {
    return (
      <div className="grid gap-4">
        <p role="alert" className="text-[15px] leading-[1.4]">
          <span className="block font-semibold">This Pix code expired.</span>
          <span className="text-ink-2">Nothing was charged. Generate a new code to pay.</span>
        </p>
        <button type="button" className="btn" disabled={busy} aria-busy={busy} onClick={onGenerate}>
          {busy ? "Generating…" : "Generate a new code"}
        </button>
      </div>
    );
  }

  const copyButton = (
    <button type="button" className={phone ? "btn" : "btn btn-secondary"} onClick={() => void copy()}>
      {copied ? <Tick size={17} /> : <Copy size={17} />}
      {copied ? "Copied" : "Copy Pix code"}
    </button>
  );
  const code = (
    // Hairlines, not a box: it already sits inside the payment panel.
    <div className="border-y border-rule py-2.5">
      <p className="mono text-ink-2" id="pix-code-label">
        Pix Copia e Cola
      </p>
      <p ref={codeRef} aria-labelledby="pix-code-label" className="mt-1 line-clamp-2 select-all break-all font-mono text-[12px] leading-[1.45] text-ink">
        {checkout.brCode}
      </p>
    </div>
  );
  const steps = phone
    ? ["Copy the code.", "In your bank app, open Pix and choose Pix Copia e Cola.", `Paste and confirm ${price}.`]
    : ["Open your bank app and choose Pix.", "Scan the QR code, or paste the code.", `Confirm ${price}.`];

  return (
    <div className="grid gap-3.5">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-[17px] font-semibold tracking-[-0.01em]">Your Pix code is ready</p>
        <span className="mono flex-none text-ink-2">Valid until {validUntil(checkout.expiresAt)}</span>
      </div>

      {phone ? (
        <>
          {copyButton}
          <p aria-live="polite" className={`-mt-1 text-center text-[13px] leading-[1.4] ${copied ? "text-positive" : "text-ink-2"}`}>
            {copied ? "Now paste it in your bank app, in Pix Copia e Cola." : "Then paste it in your bank app."}
          </p>
          {code}
        </>
      ) : (
        <>
          <PixQrCode code={checkout.brCode} simulated={checkout.simulated} />
          {code}
          {copyButton}
          <p aria-live="polite" className="sr-only">
            {copied ? "Copied. Paste it in your bank app, in Pix Copia e Cola." : ""}
          </p>
        </>
      )}

      <ol className="grid gap-1.5 text-[14px] leading-[1.4]">
        {steps.map((line, index) => (
          <li key={line} className="flex gap-3">
            <span className="mono w-4 flex-none pt-0.5 text-ink-2">{index + 1}</span>
            {line}
          </li>
        ))}
      </ol>

      <p role="status" aria-live="polite" className="flex items-center gap-2.5 rounded-[12px] bg-chip-fill px-3.5 py-3 text-[14px] leading-[1.35]">
        <span aria-hidden="true" className="pix-wait inline-block h-2 w-2 flex-none rounded-full bg-accent" />
        Waiting for your payment. This page moves on by itself.
      </p>

      {phone ? (
        <details className="group rounded-[12px] shadow-[inset_0_0_0_1px_var(--color-rule)]">
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-3.5 text-[14px] font-medium [&::-webkit-details-marker]:hidden">
            Show the QR code instead
            <ChevronDown size={18} className="flex-none text-ink-2 transition-transform group-open:rotate-180" />
          </summary>
          <div className="px-3.5 pb-4 pt-1">
            <PixQrCode code={checkout.brCode} simulated={checkout.simulated} />
          </div>
        </details>
      ) : null}

      {checkout.canSimulate ? (
        <div className="grid gap-3 rounded-[14px] bg-ground p-3.5 shadow-[inset_0_0_0_1px_var(--color-rule)]">
          <p className="text-[13px] leading-[1.4] text-ink-2">
            <span className="mono block text-ink">{checkout.simulated ? "Development preview" : "Sandbox"}</span>
            No real money. Pay this code as the bank would report it.
          </p>
          <button type="button" className="btn btn-secondary" disabled={simulating} onClick={() => void simulate()}>
            {simulating ? "Simulating…" : "Simulate Pix payment"}
          </button>
        </div>
      ) : null}
    </div>
  );
}
