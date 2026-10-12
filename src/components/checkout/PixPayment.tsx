"use client";

import { useEffect, useEffectEvent, useRef, useState } from "react";
import { Lock, Tick } from "@/components/common/icons";
import type { PixSession } from "@/features/checkout/store";
import { ApiClientError, api, type CheckoutOffer } from "@/lib/api-client";
import { formatPrice, isProductionBuild } from "@/lib/config";
import { PixQrCode } from "./PixQrCode";

const POLL_MS = 3000;

function validUntil(iso: string): string {
  return new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
}

/**
 * PIX (Brazil): generate a code, pay it in any bank app, and the page notices by itself.
 * Payment is confirmed only by the server asking AbacatePay; this page just polls our API.
 * The expiry is the charge's real one, shown as a time, never as a countdown.
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
      window.setTimeout(() => setCopiedCode(undefined), 2500);
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
      <div className="grid gap-4">
        <div className="flex items-baseline justify-between border-b border-rule pb-3">
          <h2 className="text-[20px] font-semibold tracking-[-0.01em]">Pay with Pix</h2>
          <span className="text-[20px] tabular-nums">{price}</span>
        </div>
        <ol className="grid gap-2.5 text-[15px] leading-[1.4]">
          {["Generate your Pix code here.", "Pay it in your bank app: scan the QR code or use Pix Copia e Cola.", "We confirm it automatically, usually within seconds."].map(
            (line, index) => (
              <li key={line} className="flex gap-3">
                <span className="mono w-4 flex-none pt-0.5 text-ink-2">{index + 1}</span>
                {line}
              </li>
            ),
          )}
        </ol>
        <button type="button" className="btn" disabled={busy} onClick={onGenerate}>
          <Lock size={15} />
          {busy ? "Generating…" : "Generate Pix code"}
        </button>
        <p className="text-[13px] leading-[1.4] text-ink-2">Pix works with any Brazilian bank account. Nothing is charged until you pay in your bank app.</p>
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
        <button type="button" className="btn" disabled={busy} onClick={onGenerate}>
          {busy ? "Generating…" : "Generate a new code"}
        </button>
      </div>
    );
  }

  return (
    <div className="grid gap-4">
      <div className="flex items-baseline justify-between">
        <h2 className="text-[20px] font-semibold tracking-[-0.01em]">Pix · {price}</h2>
        <span className="mono text-ink-2">Valid until {validUntil(checkout.expiresAt)}</span>
      </div>
      <PixQrCode code={checkout.brCode} simulated={checkout.simulated} />
      <div className="grid gap-2">
        <p className="mono text-ink-2" id="pix-code-label">
          Pix Copia e Cola
        </p>
        <p
          ref={codeRef}
          aria-labelledby="pix-code-label"
          className="max-h-[4.2em] select-all overflow-hidden break-all rounded-[12px] bg-raised px-3.5 py-2.5 font-mono text-[12px] leading-[1.4] text-ink-2 shadow-[inset_0_0_0_1px_var(--color-rule)]"
        >
          {checkout.brCode}
        </p>
        <button type="button" className="btn" onClick={() => void copy()}>
          {copied ? (
            <>
              <Tick size={16} /> Copied
            </>
          ) : (
            "Copy Pix code"
          )}
        </button>
      </div>
      <p role="status" aria-live="polite" className="flex items-center gap-2.5 text-[15px]">
        <span aria-hidden="true" className="pix-wait inline-block h-2 w-2 flex-none rounded-full bg-accent" />
        Waiting for your payment. This page updates by itself.
      </p>
      {checkout.sandbox && !isProductionBuild ? (
        <div className="grid gap-3 rounded-[14px] bg-raised p-3.5 shadow-[inset_0_0_0_1px_var(--color-rule)]">
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
