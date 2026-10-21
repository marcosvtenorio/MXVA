import { Fragment } from "react";
import { CompareFrame } from "@/components/checkout/ExampleCompare";
import { CropMarks } from "@/components/common/StudioArt";
import { EXAMPLE_AFTER, EXAMPLE_BEFORE } from "@/lib/examples";

/** The concept's changes, numbered as in the concept list: the studio's readout for the after side. */
const CHANGES = ["Cut", "Skin", "Brows", "Beard"] as const;

/** Where the concept changed the example: numbered markers that match the list beside it. */
const MARKERS = [
  { n: 1, x: 54, y: 14 },
  { n: 2, x: 37, y: 48 },
  { n: 3, x: 64, y: 33 },
  { n: 4, x: 52, y: 68 },
] as const;

function Marker({ n, x, y }: { n: number; x: number; y: number }) {
  return (
    <span
      aria-hidden="true"
      className="mono absolute grid h-8 w-8 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-ground text-ink shadow-[inset_0_0_0_1px_var(--color-rule)]"
      style={{ left: `${x}%`, top: `${y}%` }}
    >
      {n}
    </span>
  );
}

/** The photo-check glass, read out for the after side: "After" and the four numbered changes. */
function AfterReadout({ className = "" }: { className?: string }) {
  return (
    <div className={`readouts mono frost top-auto rounded-[14px] px-3 py-2.5 text-left ${className}`}>
      <span>After</span>
      {CHANGES.map((change, index) => (
        <span key={change}>
          [{index + 1}] {change}
        </span>
      ))}
    </div>
  );
}

/**
 * The landing's first frame: a real MXVA concept on a fictional AI-generated person, on the
 * lit stage, with the after side read out like a photo check. Phones and tablets show before
 * and after side by side, each whole (a 3:2 crop of one portrait would cut the hair, the
 * biggest change); from 1100px, the slider. From 768px the readout glass sits on the after
 * side; on phones it would hide the face, so the same readout runs under the photos.
 */
export function HeroProof() {
  return (
    <figure>
      <div className="stage aspect-[3/2] min-[768px]:aspect-auto min-[768px]:h-[440px] min-[1100px]:h-[680px]">
        {/* One definite row, so each photo is exactly the stage's height (no hidden overflow). */}
        <div className="absolute inset-0 grid grid-cols-2 grid-rows-1 min-[1100px]:hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={EXAMPLE_BEFORE} alt="Example photo before" className="h-full w-full object-cover object-top" fetchPriority="high" />
          <div className="relative">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={EXAMPLE_AFTER} alt="Example concept after the glow-up" className="h-full w-full object-cover object-top" fetchPriority="high" />
            {/* Over the shirt, under the chin: the face stays clear. */}
            <AfterReadout className="bottom-4 right-10 hidden min-[768px]:grid" />
          </div>
          {/* On the crop marks' baseline, just inside them. */}
          <span className="capsule frost mono absolute bottom-4 left-10">Before</span>
          <span className="capsule frost mono absolute bottom-4 right-10 min-[768px]:hidden">After</span>
        </div>
        <div className="absolute inset-0 hidden min-[1100px]:block">
          <CompareFrame eager labels="top" after={<AfterReadout className="right-10 top-10!" />} className="h-full w-full" imageClassName="object-[50%_18%]" />
          <span className="capsule frost mono absolute bottom-10 left-10">Same face, pose and light · fictional AI-generated person</span>
        </div>
        <CropMarks />
      </div>
      {/* From 1100px the disclosure is inside the stage, clear of the cookie bar. */}
      <figcaption className="mono mt-2 px-1 text-ink-2 min-[1100px]:sr-only">
        <span className="text-ink min-[768px]:hidden">
          After:{" "}
          {/* Each item holds together; the line can break between items. */}
          {CHANGES.map((change, index) => (
            <Fragment key={change}>
              <span className="whitespace-nowrap">
                [{index + 1}] {change} ·
              </span>{" "}
            </Fragment>
          ))}
        </span>
        Fictional AI-generated person
      </figcaption>
    </figure>
  );
}

export function AnnotatedConcept() {
  return (
    <figure>
      <div className="relative aspect-[3/4] overflow-hidden rounded-[22px] bg-ink">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={EXAMPLE_AFTER} alt="The example concept, with its changes numbered" className="absolute inset-0 h-full w-full object-cover" loading="lazy" />
        {MARKERS.map((marker) => (
          <Marker key={marker.n} {...marker} />
        ))}
      </div>
      <figcaption className="mt-2 text-[15px] leading-[1.4] text-ink-2">
        The example after its concept. Numbers match the list: cut, skin, brows, beard.
      </figcaption>
    </figure>
  );
}
