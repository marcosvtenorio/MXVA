"use client";

import { useEffect } from "react";
import { useOnboardingStore } from "@/features/onboarding/store";
import { installPhotoLifecycleGuards } from "@/features/photos/memory-store";
import { installResultLifecycleGuards } from "@/features/results/memory-store";

/** Client-only setup: answer recovery and the RAM-only lifecycle guards for photos and results. */
export function ClientBootstrap() {
  useEffect(() => {
    useOnboardingStore.getState().hydrate();
    installPhotoLifecycleGuards();
    installResultLifecycleGuards();
  }, []);
  return null;
}
