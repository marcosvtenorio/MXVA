"use client";

import Link from "next/link";
import { useEffect } from "react";
import { track } from "@/features/analytics/client";
import { useConsentStore } from "@/features/analytics/consent";

/**
 * Cookie choice, shown on marketing pages only (never over a funnel action). Without a
 * choice, MXVA counts visits anonymously and sets no tracking cookies.
 */
export function ConsentBanner() {
  const { loaded, decided, load, choose } = useConsentStore();

  // Reading the cookie flips `loaded`, so the banner only appears after hydration.
  useEffect(() => load(), [load]);

  if (!loaded || decided) return null;

  const pick = (analytics: boolean, marketing: boolean) => {
    choose({ analytics, marketing });
    track("consent_updated", { analytics, marketing });
  };

  return (
    <section
      aria-label="Cookie choices"
      className="fixed inset-x-3 bottom-[max(12px,env(safe-area-inset-bottom))] z-40 mx-auto max-w-[460px] rounded-[24px] bg-raised p-4 text-ink shadow-[inset_0_0_0_1px_var(--color-rule),0_12px_40px_rgba(17,20,23,.18)]"
    >
      <p className="text-[15px] leading-[1.4]">
        We count visits anonymously to improve MXVA. With your OK, we also use cookies to measure our ads on Meta. Photos and answers are
        never shared. <Link href="/privacy" className="underline underline-offset-2">Privacy</Link>
      </p>
      <div className="mt-3 grid grid-cols-2 gap-2.5">
        <button type="button" className="btn btn-secondary min-h-11 text-[15px]" onClick={() => pick(false, false)}>
          Only necessary
        </button>
        <button type="button" className="btn min-h-11 text-[15px]" onClick={() => pick(true, true)}>
          Accept
        </button>
      </div>
    </section>
  );
}
