"use client";

import { useEffect } from "react";
import { Back } from "@/components/common/icons";
import { track } from "@/features/analytics/client";
import { getStep, progressFor } from "@/features/onboarding/navigation";
import type { StepId } from "@/features/onboarding/schema";
import { useStepGuard } from "@/features/onboarding/use-flow";

/**
 * Universal mobile scaffold for steps (spec §3): progress header at the top, scrollable
 * content, the primary action reachable at the bottom without covering inputs.
 */
export function OnboardingFrame({
  step,
  onBack,
  action,
  children,
}: {
  step: StepId;
  onBack: () => void;
  action: React.ReactNode;
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
      <header className="mx-auto w-full max-w-[480px] px-5 pt-[max(12px,env(safe-area-inset-top))]">
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
      <main id="main" className="mx-auto flex w-full max-w-[480px] flex-1 flex-col" aria-busy={!ready}>
        {ready ? children : null}
      </main>
      {ready ? <div className="action-bar mx-auto w-full max-w-[480px]">{action}</div> : null}
    </div>
  );
}
