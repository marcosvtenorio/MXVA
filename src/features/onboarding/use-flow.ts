"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { track } from "@/features/analytics/client";
import { frontPhotoReady, usePhotoStore } from "@/features/photos/memory-store";
import { getStep, nextStep, previousStep, resolveAccessibleStep, validateStep, type FlowSnapshot } from "./navigation";
import type { StepId } from "./schema";
import { flowSnapshot, useOnboardingStore } from "./store";

/** The current answers from both stores, as navigation sees them. */
export function useFlowSnapshot(): FlowSnapshot {
  const onboarding = useOnboardingStore(useShallow((state) => state));
  const photos = usePhotoStore(useShallow((state) => ({ ready: frontPhotoReady(state), ownership: state.ownershipConfirmed })));
  return useMemo(
    () => flowSnapshot(onboarding, { frontPhotoReady: photos.ready, ownershipConfirmed: photos.ownership }),
    [onboarding, photos.ready, photos.ownership],
  );
}

/**
 * Keeps visitors on a safe step: deep links and reloads jump back to the first
 * incomplete step (e.g. the photo step after a reload cleared the photos).
 */
export function useStepGuard(step: StepId): { ready: boolean } {
  const router = useRouter();
  const hydrated = useOnboardingStore((state) => state.hydrated);
  const ageRefused = useOnboardingStore((state) => state.ageRefused);
  const flow = useFlowSnapshot();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!hydrated) return;
    if (ageRefused && step !== "start") {
      router.replace("/start");
      return;
    }
    const target = resolveAccessibleStep(step, flow);
    if (target.id !== step) {
      if (target.id === "photos" && flow.photoGuideAcknowledged) track("photos_cleared_by_reload", {});
      router.replace(`${target.path}${target.id === "photos" ? "?cleared=1" : ""}`);
      return;
    }
    setReady(true);
    // Only re-check when the step or hydration changes, not on every answer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, step, ageRefused]);

  return { ready: hydrated && ready };
}

/** Continue / back with validation and analytics. */
export function useStepNav(step: StepId) {
  const router = useRouter();
  const flow = useFlowSnapshot();
  const [error, setError] = useState<string | undefined>();

  const goNext = useCallback(
    (options: { skipped?: boolean; validate?: boolean } = {}) => {
      if (options.validate !== false && !options.skipped) {
        const result = validateStep(step, flow);
        if (!result.success) {
          setError(result.error.issues[0]?.message ?? "Check this step and try again.");
          return false;
        }
      }
      setError(undefined);
      track("onboarding_step_completed", options.skipped ? { step, skipped: true } : { step });
      const next = nextStep(step);
      router.push(next ? next.path : "/checkout");
      return true;
    },
    [flow, router, step],
  );

  const goBack = useCallback(() => {
    track("onboarding_step_back", { step });
    const previous = previousStep(step);
    router.push(previous ? previous.path : "/");
  }, [router, step]);

  return { goNext, goBack, error, setError, definition: getStep(step) };
}
