"use client";

import { useEffect } from "react";
import { Back } from "@/components/common/icons";
import { CropMarks, PlasterHead } from "@/components/common/StudioArt";
import { track } from "@/features/analytics/client";
import { getStep, progressFor } from "@/features/onboarding/navigation";
import type { StepId } from "@/features/onboarding/schema";
import { useStepGuard } from "@/features/onboarding/use-flow";
import { usePhotoStore } from "@/features/photos/memory-store";

/**
 * Universal mobile scaffold for steps (spec §3): progress header at the top, scrollable
 * content, the primary action reachable at the bottom without covering inputs.
 * From 768px the content starts under the meter and the action follows it; from 1100px
 * the form sits beside a studio stage (`stage`) carrying that step's readouts.
 */
export function OnboardingFrame({
  step,
  onBack,
  action,
  stage,
  children,
}: {
  step: StepId;
  onBack: () => void;
  action: React.ReactNode;
  stage?: React.ReactNode;
  children: React.ReactNode;
}) {
  const { ready } = useStepGuard(step);
  const definition = getStep(step);
  const progress = progressFor(step);

  useEffect(() => {
    if (ready) track("onboarding_step_viewed", { step });
  }, [ready, step]);

  return (
    <div className="washed flex min-h-dvh flex-col">
      <header className="mx-auto w-full max-w-[480px] px-5 pt-[max(12px,env(safe-area-inset-top))] min-[1100px]:max-w-[1080px]">
        <div className="flex items-center justify-between">
          <button type="button" onClick={onBack} className="icon-btn" aria-label="Back to the previous step">
            <Back size={20} />
          </button>
          <span className="mono text-ink-2" aria-hidden="true">
            {String(progress.current).padStart(2, "0")} / {progress.total} · {definition.short}
          </span>
          <span className="w-11" aria-hidden="true" />
        </div>
        <div
          className="meter mt-3.5"
          role="progressbar"
          aria-label="Onboarding progress"
          aria-valuemin={1}
          aria-valuemax={progress.total}
          aria-valuenow={progress.current}
          aria-valuetext={`Step ${progress.current} of ${progress.total}: ${definition.short}`}
        >
          {Array.from({ length: progress.total }, (_, i) => (
            <i key={i} data-on={i < progress.current} />
          ))}
        </div>
      </header>
      <div className="mx-auto flex w-full max-w-[480px] flex-1 flex-col min-[768px]:flex-none min-[1100px]:grid min-[1100px]:max-w-[1080px] min-[1100px]:grid-cols-[480px_520px] min-[1100px]:items-start min-[1100px]:justify-between min-[1100px]:pb-16">
        <div className="flex flex-1 flex-col">
          <main id="main" className="flex flex-1 flex-col" aria-busy={!ready}>
            {ready ? children : null}
          </main>
          {/* Sticky: right under a short form, pinned to the bottom of a long one. */}
          {ready ? <div className="action-bar w-full">{action}</div> : null}
        </div>
        {ready && stage ? <div className="sticky top-8 mt-12 hidden min-[1100px]:block">{stage}</div> : null}
      </div>
    </div>
  );
}

/**
 * The studio beside the form (1100px and up): the buyer's own front photo under the key
 * light, or `src` (an example), with the step's readouts. Decorative: the form says it all.
 */
export function StepStage({ readouts, caption, src }: { readouts: readonly string[]; caption?: string; src?: string }) {
  const front = usePhotoStore((state) => state.photos.front?.previewUrl);
  const image = src ?? front;
  return (
    <div className="stage h-[min(640px,calc(100dvh-140px))] min-h-[460px]" aria-hidden="true">
      {image ? (
        // In-memory object URL of the buyer's photo (never stored), or a first-party example.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={image} alt="" className="absolute inset-0 h-full w-full object-cover" />
      ) : (
        <PlasterHead className="absolute inset-x-0 bottom-0 h-[86%] w-full" />
      )}
      <CropMarks />
      <div className="readouts mono frost right-10 top-10 rounded-[14px] px-3 py-2.5">
        {readouts.map((line) => (
          <span key={line}>{line}</span>
        ))}
      </div>
      {caption ? <span className="capsule frost mono absolute bottom-10 left-10">{caption}</span> : null}
    </div>
  );
}
