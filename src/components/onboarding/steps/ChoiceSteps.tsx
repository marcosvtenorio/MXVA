"use client";

import type { Preferences, StepId } from "@/features/onboarding/schema";
import {
  BUDGET_OPTIONS,
  FOCUS_OPTIONS,
  GOAL_OPTIONS,
  GOAL_TO_FOCUS,
  PREFERENCE_OPTIONS,
  SMILE_PROFESSIONAL_NOTE,
  TIMELINE_OPTIONS,
  type OptionCopy,
} from "@/features/onboarding/steps";
import { MAX_FOCUS_AREAS } from "@/features/onboarding/schema";
import { useOnboardingStore } from "@/features/onboarding/store";
import { useStepNav } from "@/features/onboarding/use-flow";
import { Info } from "@/components/common/icons";
import { OnboardingFrame } from "../OnboardingFrame";
import { ChoiceCards, ChoiceChips } from "../controls";
import { StepActions, StepBody } from "./StepBody";

export function GoalsStep() {
  const nav = useStepNav("goals");
  const goals = useOnboardingStore((state) => state.goals);
  const focusAreas = useOnboardingStore((state) => state.focusAreas);
  const set = useOnboardingStore((state) => state.set);
  return (
    <OnboardingFrame step="goals" onBack={nav.goBack} action={<StepActions onContinue={() => nav.goNext()} />}>
      <StepBody definition={nav.definition} error={nav.error}>
        <ChoiceCards
          name="goal"
          legend={nav.definition.heading}
          options={GOAL_OPTIONS}
          value={goals[0]}
          onChange={(goal) => {
            // Suggest matching focus areas the first time; the buyer can change them next.
            set(focusAreas.length === 0 ? { goals: [goal], focusAreas: [...GOAL_TO_FOCUS[goal]] } : { goals: [goal] });
            nav.setError(undefined);
          }}
        />
      </StepBody>
    </OnboardingFrame>
  );
}

export function FocusStep() {
  const nav = useStepNav("focus");
  const focusAreas = useOnboardingStore((state) => state.focusAreas);
  const set = useOnboardingStore((state) => state.set);
  return (
    <OnboardingFrame step="focus" onBack={nav.goBack} action={<StepActions onContinue={() => nav.goNext()} />}>
      <StepBody definition={nav.definition} error={nav.error}>
        <ChoiceChips
          legend={nav.definition.heading}
          options={FOCUS_OPTIONS}
          values={focusAreas}
          max={MAX_FOCUS_AREAS}
          onChange={(values) => {
            set({ focusAreas: values });
            nav.setError(undefined);
          }}
        />
        <p className="mono mt-4 text-ink-2" aria-live="polite">
          {focusAreas.length} of {MAX_FOCUS_AREAS} chosen
        </p>
      </StepBody>
    </OnboardingFrame>
  );
}

export function TimelineStep() {
  const nav = useStepNav("timeline");
  const timeline = useOnboardingStore((state) => state.timeline);
  const set = useOnboardingStore((state) => state.set);
  return (
    <OnboardingFrame step="timeline" onBack={nav.goBack} action={<StepActions onContinue={() => nav.goNext()} />}>
      <StepBody definition={nav.definition} error={nav.error}>
        <ChoiceCards name="timeline" legend={nav.definition.heading} options={TIMELINE_OPTIONS} value={timeline} onChange={(value) => set({ timeline: value })} />
      </StepBody>
    </OnboardingFrame>
  );
}

export function BudgetStep() {
  const nav = useStepNav("budget");
  const budget = useOnboardingStore((state) => state.budget);
  const set = useOnboardingStore((state) => state.set);
  return (
    <OnboardingFrame step="budget" onBack={nav.goBack} action={<StepActions onContinue={() => nav.goNext()} />}>
      <StepBody definition={nav.definition} error={nav.error}>
        <ChoiceCards name="budget" legend={nav.definition.heading} options={BUDGET_OPTIONS} value={budget} onChange={(value) => set({ budget: value })} />
      </StepBody>
    </OnboardingFrame>
  );
}

type SimplePreference = "skin" | "brows" | "eyes" | "smile" | "jaw";

/** Steps 06–11: optional preferences with "Nothing specific" and Skip. */
export function PreferenceStep({ step }: { step: SimplePreference & StepId }) {
  const nav = useStepNav(step);
  const values = useOnboardingStore((state) => state.preferences[step]) as string[];
  const setPreference = useOnboardingStore((state) => state.setPreference);
  const skip = useOnboardingStore((state) => state.skip);
  const options = PREFERENCE_OPTIONS[step] as readonly OptionCopy<string>[];
  const showDentalNote = step === "smile" && values.some((value) => value === "whitening_info" || value === "alignment_consult");
  return (
    <OnboardingFrame
      step={step}
      onBack={nav.goBack}
      action={
        <StepActions
          onContinue={() => nav.goNext()}
          onSkip={() => {
            skip(step);
            nav.goNext({ skipped: true });
          }}
        />
      }
    >
      <StepBody definition={nav.definition} error={nav.error}>
        <ChoiceChips
          legend={nav.definition.heading}
          options={options}
          values={values}
          onChange={(next) => {
            setPreference(step, next as Preferences[typeof step]);
            nav.setError(undefined);
          }}
        />
        {showDentalNote ? (
          <p className="mt-4 flex items-start gap-2 text-[15px] leading-[1.4] text-ink-2">
            <Info size={18} className="mt-px flex-none" />
            {SMILE_PROFESSIONAL_NOTE}
          </p>
        ) : null}
      </StepBody>
    </OnboardingFrame>
  );
}

const FACIAL_HAIR_RELEVANCE: readonly OptionCopy<"yes" | "no">[] = [
  { id: "yes", label: "I have or want facial hair" },
  { id: "no", label: "Not relevant to me" },
];

export function HairStep() {
  const nav = useStepNav("hair");
  const hair = useOnboardingStore((state) => state.preferences.hair);
  const relevant = useOnboardingStore((state) => state.preferences.facialHairRelevant);
  const facialHair = useOnboardingStore((state) => state.preferences.facialHair);
  const setPreference = useOnboardingStore((state) => state.setPreference);
  const setFacialHairRelevant = useOnboardingStore((state) => state.setFacialHairRelevant);
  const skip = useOnboardingStore((state) => state.skip);
  return (
    <OnboardingFrame
      step="hair"
      onBack={nav.goBack}
      action={
        <StepActions
          onContinue={() => nav.goNext()}
          onSkip={() => {
            skip("hair");
            nav.goNext({ skipped: true });
          }}
        />
      }
    >
      <StepBody definition={nav.definition} error={nav.error}>
        <ChoiceChips legend="Hair" options={PREFERENCE_OPTIONS.hair} values={hair} onChange={(next) => setPreference("hair", next)} />
        <h2 className="mt-8 text-[17px] font-semibold">Facial hair</h2>
        <div className="mt-3">
          <ChoiceCards name="facial-hair-relevant" legend="Is facial hair relevant to you?" options={FACIAL_HAIR_RELEVANCE} value={relevant} onChange={setFacialHairRelevant} />
        </div>
        {relevant === "yes" ? (
          <div className="mt-4">
            <ChoiceChips legend="Facial hair preferences" options={PREFERENCE_OPTIONS.facialHair} values={facialHair} onChange={(next) => setPreference("facialHair", next)} />
          </div>
        ) : null}
      </StepBody>
    </OnboardingFrame>
  );
}
