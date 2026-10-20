"use client";

import { useRef, useState } from "react";
import { Compare } from "@/components/common/icons";
import { EXAMPLE_AFTER, EXAMPLE_BEFORE } from "@/lib/examples";

/**
 * The drag-to-compare frame: a real concept made by MXVA, shown on a fictional AI-generated
 * person (no real customer). Drag or use the arrow keys. `className` sizes and rounds it;
 * `labels` puts the Before/After capsules at the top or the bottom of the frame.
 */
export function CompareFrame({
  className = "",
  eager = false,
  labels = "bottom",
  imageClassName = "",
}: {
  className?: string;
  eager?: boolean;
  labels?: "top" | "bottom";
  imageClassName?: string;
}) {
  const [split, setSplit] = useState(50);
  const frame = useRef<HTMLDivElement>(null);

  function fromPointer(clientX: number) {
    const rect = frame.current?.getBoundingClientRect();
    if (!rect) return;
    setSplit(Math.min(100, Math.max(0, ((clientX - rect.left) / rect.width) * 100)));
  }

  const loading = eager ? "eager" : "lazy";
  // At the top they clear the crop marks of a stage; at the bottom they sit on the shirt.
  const [beforeAt, afterAt] = labels === "top" ? ["left-10 top-10", "right-10 top-10"] : ["bottom-3 left-3", "bottom-3 right-3"];
  return (
    <div
      ref={frame}
      className={`relative select-none overflow-hidden ${className}`}
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId);
        fromPointer(event.clientX);
      }}
      onPointerMove={(event) => {
        if (event.buttons > 0) fromPointer(event.clientX);
      }}
      style={{ touchAction: "pan-y" }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={EXAMPLE_AFTER} alt="Example concept after the glow-up" className={`absolute inset-0 h-full w-full object-cover ${imageClassName}`} draggable={false} loading={loading} />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={EXAMPLE_BEFORE}
        alt="Example photo before"
        className={`absolute inset-0 h-full w-full object-cover ${imageClassName}`}
        style={{ clipPath: `inset(0 ${100 - split}% 0 0)` }}
        draggable={false}
        loading={loading}
      />
      <div className="pointer-events-none absolute inset-y-0 w-px bg-white/90" style={{ left: `${split}%` }} />
      <div
        role="slider"
        tabIndex={0}
        aria-label="Compare the example before and after"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(split)}
        aria-valuetext={`${Math.round(split)}% before`}
        onKeyDown={(event) => {
          if (event.key === "ArrowLeft") setSplit((value) => Math.max(0, value - 5));
          if (event.key === "ArrowRight") setSplit((value) => Math.min(100, value + 5));
        }}
        className="frost absolute top-1/2 grid h-11 w-11 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full"
        style={{ left: `${split}%` }}
      >
        <Compare size={20} />
      </div>
      <span className={`capsule frost mono absolute ${beforeAt}`}>Before</span>
      <span className={`capsule frost mono absolute ${afterAt}`}>After</span>
    </div>
  );
}

/** The example on its own, with its caption (checkout). */
export function ExampleCompare() {
  return (
    <figure className="mt-3">
      <CompareFrame className="aspect-[3/4] rounded-[22px] bg-ink" />
      <figcaption className="mt-2 text-[13px] leading-[1.4] text-ink-2">
        A real MXVA concept, shown on a fictional AI-generated person. Same face, upgraded: cut, skin, brows, beard, leaner jawline.
      </figcaption>
    </figure>
  );
}
