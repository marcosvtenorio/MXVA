"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowRight } from "@/components/common/icons";
import { track } from "@/features/analytics/client";

/**
 * Mobile-first: price and one button always in reach until the payment form is on screen.
 * Not drawn from 1100px, where the payment panel is on the first screen. While it shows, the
 * page's scroll-padding reserves its height, so a focused row never ends up under it.
 */
export function StickyPayBar({ price, targetId }: { price: string; targetId: string }) {
  const [paymentVisible, setPaymentVisible] = useState(false);
  const bar = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const target = document.getElementById(targetId);
    if (!target || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(([entry]) => setPaymentVisible(Boolean(entry?.isIntersecting)), { rootMargin: "0px 0px -20% 0px" });
    observer.observe(target);
    return () => observer.disconnect();
  }, [targetId]);

  useEffect(() => {
    const element = bar.current;
    if (paymentVisible || !element) return;
    const root = document.documentElement;
    root.style.scrollPaddingBottom = `${element.offsetHeight + 8}px`;
    return () => {
      root.style.scrollPaddingBottom = "";
    };
  }, [paymentVisible]);

  if (paymentVisible) return null;
  return (
    <div ref={bar} className="action-bar fixed inset-x-0 bottom-0 z-20 px-5 pb-[max(14px,env(safe-area-inset-bottom))] pt-3 min-[1100px]:hidden">
      <div className="mx-auto flex w-full max-w-[480px] items-center gap-3">
        <span className="flex-none text-[20px] font-semibold tabular-nums">{price}</span>
        <button
          type="button"
          className="btn btn-arrow"
          onClick={() => {
            track("cta_clicked", { cta: "pay" });
            const target = document.getElementById(targetId);
            target?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
          }}
        >
          Get my glow-up
          <span className="btn-arrow-dot" aria-hidden="true">
            <ArrowRight size={18} />
          </span>
        </button>
      </div>
    </div>
  );
}
