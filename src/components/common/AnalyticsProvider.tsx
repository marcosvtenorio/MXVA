"use client";

import { usePathname } from "next/navigation";
import { useReportWebVitals } from "next/web-vitals";
import { useEffect } from "react";
import { installAnalytics, track } from "@/features/analytics/client";
import type { PAGE_IDS } from "@/features/analytics/events";

type PageId = (typeof PAGE_IDS)[number];

function pageFor(pathname: string): PageId {
  if (pathname === "/") return "landing";
  if (pathname.startsWith("/onboarding/")) return "onboarding";
  const map: Record<string, PageId> = {
    "/start": "start",
    "/checkout": "checkout",
    "/processing": "processing",
    "/result": "result",
    "/help": "help",
    "/privacy": "privacy",
    "/terms": "terms",
    "/refunds": "refunds",
    "/sample-report": "sample",
    "/recover": "recover",
  };
  return map[pathname] ?? "other";
}

const WEB_VITALS = new Set(["LCP", "INP", "CLS", "FCP", "TTFB"]);

// Stable reference: Next calls it once per metric.
function reportWebVital(metric: { name: string; value: number; rating?: string }) {
  if (!WEB_VITALS.has(metric.name) || !metric.rating) return;
  track("web_vital", {
    metric: metric.name as "LCP" | "INP" | "CLS" | "FCP" | "TTFB",
    value: Math.round(metric.name === "CLS" ? metric.value * 1000 : metric.value),
    rating: metric.rating as "good" | "needs-improvement" | "poor",
  });
}

/** Installs first-party analytics and records page views and Core Web Vitals. */
export function AnalyticsProvider() {
  const pathname = usePathname();

  useEffect(() => {
    installAnalytics();
  }, []);

  useEffect(() => {
    if (!pathname) return;
    const page = pageFor(pathname);
    track("page_view", { page });
    if (page === "landing") track("landing_view", {});
  }, [pathname]);

  useReportWebVitals(reportWebVital);
  return null;
}
