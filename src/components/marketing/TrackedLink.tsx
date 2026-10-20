"use client";

import Link from "next/link";
import { track } from "@/features/analytics/client";
import type { CTA_IDS } from "@/features/analytics/events";

/** A link that records which call to action was used (id only). `starts`: it opens the intake. */
export function TrackedLink({
  cta,
  href,
  className,
  starts = false,
  children,
}: {
  cta: (typeof CTA_IDS)[number];
  href: string;
  className?: string;
  starts?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={className}
      onClick={() => {
        track("cta_clicked", { cta });
        if (starts) track("onboarding_start", {});
      }}
    >
      {children}
    </Link>
  );
}
