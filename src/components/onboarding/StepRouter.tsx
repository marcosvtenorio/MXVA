"use client";

import type { StepId } from "@/features/onboarding/schema";
import { ConstraintsStep } from "./steps/ConstraintsStep";
import { DeliveryStep } from "./steps/DeliveryStep";
import { PhotosStep } from "./steps/PhotosStep";
import { ReviewStep } from "./steps/ReviewStep";

export function StepRouter({ step }: { step: Exclude<StepId, "start"> }) {
  switch (step) {
    case "constraints":
      return <ConstraintsStep />;
    case "photos":
      return <PhotosStep />;
    case "delivery":
      return <DeliveryStep />;
    case "review":
      return <ReviewStep />;
    default:
      // Former preference steps and the photo guide: the plan is decided from the photo now.
      return null;
  }
}
