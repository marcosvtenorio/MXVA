"use client";

import { InlineError } from "@/components/common/InlineError";
import type { StepDefinition } from "@/features/onboarding/steps";
import { StepDescription, StepHeading } from "../StepHeading";

/** Question and answers as one group anchored above the action (thumb zone). */
export function StepBody({
  definition,
  error,
  children,
  heading,
}: {
  definition: StepDefinition;
  error?: string;
  children: React.ReactNode;
  heading?: React.ReactNode;
}) {
  const errorId = `${definition.id}-error`;
  return (
    <div className="flex flex-1 flex-col justify-end px-5 pb-2 pt-8">
      {heading ?? <StepHeading tail={definition.tail}>{definition.heading}</StepHeading>}
      {definition.description ? <StepDescription>{definition.description}</StepDescription> : null}
      <div className="mt-6" aria-describedby={error ? errorId : undefined}>
        {children}
      </div>
      <InlineError id={errorId}>{error}</InlineError>
    </div>
  );
}

export function StepActions({
  onContinue,
  onSkip,
  continueLabel = "Continue",
  busy = false,
}: {
  onContinue: () => void;
  onSkip?: () => void;
  continueLabel?: string;
  /** The next screen is loading: the tap registered, further taps are ignored. */
  busy?: boolean;
}) {
  return (
    <div className={onSkip ? "grid grid-cols-[auto_1fr] gap-3" : undefined}>
      {onSkip ? (
        <button type="button" className="btn btn-secondary w-auto px-6" onClick={onSkip}>
          Skip
        </button>
      ) : null}
      <button type="button" className="btn" onClick={busy ? undefined : onContinue} aria-busy={busy || undefined}>
        {busy ? <span className="btn-spinner" aria-hidden="true" /> : null}
        {continueLabel}
      </button>
    </div>
  );
}
