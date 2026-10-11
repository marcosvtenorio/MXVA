"use client";

import Link from "next/link";
import { CropMarks, PlasterHead } from "@/components/common/StudioArt";
import { track } from "@/features/analytics/client";
import { useOnboardingStore } from "@/features/onboarding/store";
import { useStepNav } from "@/features/onboarding/use-flow";
import { OnboardingFrame } from "../OnboardingFrame";
import { ChoiceCards } from "../controls";
import { StepActions, StepBody } from "./StepBody";
import { StepHeading } from "../StepHeading";

const AGE_OPTIONS = [
  { id: "adult", label: "I'm 18 or older" },
  { id: "minor", label: "I'm under 18" },
] as const;

export function StartStep() {
  const nav = useStepNav("start");
  const adultConfirmed = useOnboardingStore((state) => state.adultConfirmed);
  const ageRefused = useOnboardingStore((state) => state.ageRefused);
  const set = useOnboardingStore((state) => state.set);
  const refuseAge = useOnboardingStore((state) => state.refuseAge);

  if (ageRefused) {
    return (
      <OnboardingFrame step="start" onBack={nav.goBack} action={<Link href="/" className="btn btn-secondary">Back to home</Link>}>
        <div className="flex flex-1 flex-col justify-end px-5 pb-2 pt-8">
          <StepHeading tail="We can't create a report for anyone under 18.">MXVA is for adults only.</StepHeading>
          <p className="mt-4 text-[15px] leading-[1.4] text-ink-2">
            Nothing you entered was sent or kept. If you selected this by mistake, close this tab and open MXVA again.
          </p>
        </div>
      </OnboardingFrame>
    );
  }

  return (
    <OnboardingFrame
      step="start"
      onBack={nav.goBack}
      action={
        <StepActions
          continueLabel="Start"
          onContinue={() => {
            if (nav.goNext()) track("onboarding_start", {});
          }}
        />
      }
    >
      <StepBody definition={{ ...nav.definition, description: "" }} error={nav.error}>
        <div className="stage mb-6 h-44" aria-hidden="true">
          <PlasterHead className="absolute inset-x-0 bottom-0 h-[88%] w-full" />
          <CropMarks />
        </div>
        <p className="-mt-2 mb-6 text-[17px] leading-[1.38] text-ink-2">{nav.definition.description}</p>
        <ChoiceCards
          name="age"
          legend="Confirm your age"
          options={AGE_OPTIONS}
          value={adultConfirmed ? "adult" : undefined}
          onChange={(value) => {
            if (value === "minor") {
              track("age_gate_refused", {});
              refuseAge();
              return;
            }
            set({ adultConfirmed: true });
            nav.setError(undefined);
          }}
        />
        <p className="mt-4 text-[13px] leading-[1.4] text-ink-2">
          By starting you agree to our{" "}
          <Link href="/terms" className="underline underline-offset-2">Terms</Link> and{" "}
          <Link href="/privacy" className="underline underline-offset-2">Privacy Policy</Link>. No account needed.
        </p>
      </StepBody>
    </OnboardingFrame>
  );
}
