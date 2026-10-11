"use client";

import type { StepId } from "@/features/onboarding/schema";
import { BudgetStep, FocusStep, GoalsStep, HairStep, PreferenceStep, TimelineStep } from "./steps/ChoiceSteps";
import { ConstraintsStep } from "./steps/ConstraintsStep";
import { DeliveryStep } from "./steps/DeliveryStep";
import { PhotoGuideStep } from "./steps/PhotoGuideStep";
import { PhotosStep } from "./steps/PhotosStep";
import { ReviewStep } from "./steps/ReviewStep";

export function StepRouter({ step }: { step: Exclude<StepId, "start"> }) {
  switch (step) {
    case "goals":
      return <GoalsStep />;
    case "focus":
      return <FocusStep />;
    case "timeline":
      return <TimelineStep />;
    case "budget":
      return <BudgetStep />;
    case "skin":
    case "brows":
    case "eyes":
    case "smile":
    case "jaw":
      return <PreferenceStep key={step} step={step} />;
    case "hair":
      return <HairStep />;
    case "constraints":
      return <ConstraintsStep />;
    case "photo-guide":
      return <PhotoGuideStep />;
    case "photos":
      return <PhotosStep />;
    case "delivery":
      return <DeliveryStep />;
    case "review":
      return <ReviewStep />;
  }
}
