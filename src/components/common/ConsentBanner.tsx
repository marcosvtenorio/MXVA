"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { track } from "@/features/analytics/client";
import { useConsentStore } from "@/features/analytics/consent";

/**
 * Cookie choice, shown on marketing pages only (never over a funnel action). Without a
 * choice, MXVA counts visits anonymously and sets no tracking cookies.
 * A slim bottom bar with two equal outline buttons, so the page's Start stays the only
 * filled action. While it shows, the page reserves its height at the bottom and in
 * scroll-padding, so it never covers the end of the page or a focused control.
 */
export function ConsentBanner() {
  const { loaded, decided, load, choose } = useConsentStore();
  const bar = useRef<HTMLElement>(null);
  const open = loaded && !decided;

  // Reading the cookie flips `loaded`, so the banner only appears after hydration.
  useEffect(() => load(), [load]);

  useEffect(() => {
    const element = bar.current;
    if (!open || !element) return;
    const root = document.documentElement;
    const reserve = () => {
      const space = `${Math.ceil(window.innerHeight - element.getBoundingClientRect().top) + 8}px`;
      root.style.scrollPaddingBottom = space;
      document.body.style.paddingBottom = space;
    };
    reserve();
    const observer = new ResizeObserver(reserve);
    observer.observe(element);
    window.addEventListener("resize", reserve);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", reserve);
      root.style.scrollPaddingBottom = "";
      document.body.style.paddingBottom = "";
    };
  }, [open]);

  if (!open) return null;

  const pick = (analytics: boolean, marketing: boolean) => {
    choose({ analytics, marketing });
    track("consent_updated", { analytics, marketing });
  };

  return (
    <section
      ref={bar}
      aria-label="Cookie choices"
      className="fixed inset-x-2 bottom-[max(8px,env(safe-area-inset-bottom))] z-40 mx-auto max-w-[560px] rounded-[20px] bg-raised px-3.5 py-3 text-ink shadow-[inset_0_0_0_1px_var(--color-rule),0_12px_40px_rgba(17,20,23,.18)]"
    >
      <p className="text-[15px] leading-[1.3]">
        Anonymous visit counts. Meta ad cookies if you accept. Photos and answers never shared.{" "}
        <Link href="/privacy" className="underline underline-offset-2">
          Privacy
        </Link>
      </p>
      <div className="mt-2.5 grid grid-cols-2 gap-2">
        <button type="button" className="btn btn-secondary min-h-11 text-[15px]" onClick={() => pick(false, false)}>
          Only necessary
        </button>
        <button type="button" className="btn btn-secondary min-h-11 text-[15px]" onClick={() => pick(true, true)}>
          Accept
        </button>
      </div>
    </section>
  );
}
