"use client";

import { useEffect, useRef } from "react";

/**
 * The step question. Focus moves here on every step change so screen-reader and
 * keyboard users start at the question, not at the top of the page.
 */
export function StepHeading({
  children,
  tail,
  size = "display",
  className = "",
}: {
  children: React.ReactNode;
  tail?: string;
  size?: "display" | "title";
  className?: string;
}) {
  const ref = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    ref.current?.focus({ preventScroll: true });
  }, []);
  return (
    <h1 ref={ref} tabIndex={-1} className={`${size === "display" ? "display" : "title-28"} two-tone outline-none ${className}`}>
      {children}
      {tail ? <span> {tail}</span> : null}
    </h1>
  );
}

export function StepDescription({ children, id }: { children: React.ReactNode; id?: string }) {
  return (
    <p id={id} className="mt-3 text-[15px] leading-[1.4] text-ink-2">
      {children}
    </p>
  );
}
