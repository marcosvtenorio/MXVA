"use client";

import { Lock } from "@/components/common/icons";
import { usePhotoStore } from "@/features/photos/memory-store";
import { EXAMPLE_BEFORE } from "@/lib/examples";

/**
 * The buyer's own photo, ready for analysis, next to their locked concept. Everything here
 * happens in the browser: the photo is an in-memory object URL and the "scan" is CSS.
 * Nothing has been analysed yet, and the copy says so. Kept short, so the payment panel
 * starts on the first screen.
 */
export function GlowUpTeaser() {
  const photo = usePhotoStore((s) => s.photos.front?.previewUrl);
  const src = photo ?? EXAMPLE_BEFORE;

  return (
    <section aria-label="Your glow-up" className="mt-4">
      <div className="grid grid-cols-2 gap-2.5">
        <figure className="relative aspect-square overflow-hidden rounded-[22px] bg-ink">
          {/* eslint-disable-next-line @next/next/no-img-element -- in-memory object URL, never uploaded */}
          <img src={src} alt={photo ? "Your photo" : "Example photo"} className="absolute inset-0 h-full w-full object-cover" />
          <span aria-hidden="true" className="scan-line" />
          <span className="crop crop-tl" aria-hidden="true" />
          <span className="crop crop-br" aria-hidden="true" />
          <figcaption className="capsule frost mono absolute bottom-3 left-3">Today</figcaption>
        </figure>
        <figure className="relative aspect-square overflow-hidden rounded-[22px] bg-ink">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt="" aria-hidden="true" className="absolute inset-0 h-full w-full scale-110 object-cover blur-[14px] saturate-[1.15]" />
          <div className="absolute inset-0 grid place-items-center bg-[rgba(17,20,23,.28)] px-3 text-center text-white">
            <div className="grid justify-items-center gap-2">
              <span className="grid h-11 w-11 place-items-center rounded-full bg-white/90 text-[#111417]">
                <Lock size={18} />
              </span>
              <span className="text-[15px] font-semibold leading-tight">Your glow-up concept</span>
              <span className="mono text-white/85">By email after payment</span>
            </div>
          </div>
        </figure>
      </div>
      <p className="mono mt-2.5 text-ink-2">{photo ? "Your photo is ready · 7 areas queued" : "7 areas analysed from your photo"}</p>
    </section>
  );
}
