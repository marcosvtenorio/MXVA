"use client";

import Link from "next/link";
import { useState } from "react";
import { InlineError } from "@/components/common/InlineError";
import { PhotoCapture } from "@/components/photos/PhotoCapture";
import { REFRESH_LOSS_NOTICE } from "@/features/onboarding/steps";
import { useStepNav } from "@/features/onboarding/use-flow";
import { OnboardingFrame } from "../OnboardingFrame";
import { StepHeading } from "../StepHeading";
import { StepActions } from "./StepBody";

export function PhotosStep() {
  const nav = useStepNav("photos");
  // The notice renders only on the client (children wait for the step guard), so no hydration mismatch.
  const [cleared] = useState(() => typeof window !== "undefined" && new URLSearchParams(window.location.search).has("cleared"));
  return (
    <OnboardingFrame step="photos" onBack={nav.goBack} action={<StepActions continueLabel="Use these photos" onContinue={() => nav.goNext()} />}>
      <div className="px-5 pb-2 pt-6">
        <StepHeading size="title">{nav.definition.heading}</StepHeading>
        <p className="mt-2 text-[15px] leading-[1.4] text-ink-2">Used temporarily to create your report.</p>
        {cleared ? (
          <p role="status" className="mt-4 rounded-[14px] bg-raised p-3.5 text-[15px] leading-[1.4] shadow-[inset_0_0_0_1px_var(--color-rule)]">
            Your photos were cleared when the page reloaded. Add them again. Your other answers are still here.
          </p>
        ) : null}
        <div className="mt-5">
          <PhotoCapture />
        </div>
        <InlineError id="photos-error">{nav.error}</InlineError>
        <p className="mt-4 text-[13px] leading-[1.4] text-ink-2">
          {nav.definition.description.replace(" Privacy Policy.", "")}{" "}
          <Link href="/privacy" target="_blank" className="underline underline-offset-2">
            Privacy Policy
          </Link>
          . {REFRESH_LOSS_NOTICE}
        </p>
      </div>
    </OnboardingFrame>
  );
}
