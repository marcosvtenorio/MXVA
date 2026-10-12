"use client";

import { CropMarks, PlasterHead } from "@/components/common/StudioArt";
import { PHOTO_REQUIREMENTS } from "@/features/onboarding/steps";
import { useOnboardingStore } from "@/features/onboarding/store";
import { useStepNav } from "@/features/onboarding/use-flow";
import { OnboardingFrame } from "../OnboardingFrame";
import { StepActions, StepBody } from "./StepBody";

export function PhotoGuideStep() {
  const nav = useStepNav("photo-guide");
  const set = useOnboardingStore((state) => state.set);
  return (
    <OnboardingFrame
      step="photo-guide"
      onBack={nav.goBack}
      action={
        <StepActions
          continueLabel="Got it"
          busy={nav.pending}
          onContinue={() => {
            set({ photoGuideAcknowledged: true });
            nav.goNext({ validate: false });
          }}
        />
      }
    >
      <StepBody definition={nav.definition} error={nav.error}>
        <div className="stage h-52" aria-hidden="true">
          <PlasterHead className="absolute inset-x-0 bottom-0 h-[86%] w-full" />
          <CropMarks />
          <div className="readouts mono">
            <span>Eye level</span>
            <span>Arm&apos;s length</span>
            <span>Soft light · from a window</span>
          </div>
        </div>
        <ol className="mt-5 grid gap-4">
          {PHOTO_REQUIREMENTS.map((requirement, index) => (
            <li key={requirement.title} className="grid grid-cols-[32px_1fr] gap-x-1">
              <span className="mono pt-1 text-ink-2">{String(index + 1).padStart(2, "0")}</span>
              <span className="text-[17px] font-semibold leading-snug">{requirement.title}</span>
              <span className="col-start-2 text-[15px] leading-[1.4] text-ink-2">{requirement.detail}</span>
            </li>
          ))}
        </ol>
      </StepBody>
    </OnboardingFrame>
  );
}
