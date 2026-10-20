import { stepSchemas, type StepId } from "./schema";
import { STEPS, TOTAL_STEPS, type StepDefinition } from "./steps";

export const STEP_ORDER: readonly StepId[] = STEPS.map((step) => step.id);

const byId = new Map(STEPS.map((step) => [step.id, step]));
const byPath = new Map(STEPS.map((step) => [step.path, step]));

export function getStep(id: StepId): StepDefinition {
  const step = byId.get(id);
  if (!step) throw new Error(`Unknown onboarding step: ${id}`);
  return step;
}

export function stepFromPath(pathname: string): StepDefinition | undefined {
  return byPath.get(pathname.replace(/\/+$/, "") || "/");
}

/** `/onboarding/[step]` slug → step id. */
export function stepFromSlug(slug: string): StepDefinition | undefined {
  return stepFromPath(`/onboarding/${slug}`);
}

export const ONBOARDING_SLUGS = STEPS.filter((step) => step.path.startsWith("/onboarding/")).map((step) =>
  step.path.replace("/onboarding/", ""),
);

export function nextStep(id: StepId): StepDefinition | undefined {
  return STEPS[getStep(id).number];
}

export function previousStep(id: StepId): StepDefinition | undefined {
  const number = getStep(id).number;
  return number > 1 ? STEPS[number - 2] : undefined;
}

export function progressFor(id: StepId): { current: number; total: number; ratio: number } {
  const current = getStep(id).number;
  return { current, total: TOTAL_STEPS, ratio: current / TOTAL_STEPS };
}

/** Everything a step's form validates against, gathered from stores. */
export type FlowSnapshot = {
  adultConfirmed: boolean;
  goals: string[];
  focusAreas: string[];
  timeline?: string;
  budget?: string;
  preferences: Record<string, unknown>;
  constraints?: { dailyMinutes?: string; avoid?: string[]; note?: string };
  photoGuideAcknowledged: boolean;
  frontPhotoReady: boolean;
  photoOwnershipConfirmed: boolean;
  email?: string;
  faceProcessingConsent: boolean;
  termsAccepted: boolean;
  marketingOptIn: boolean;
  /** Steps the buyer explicitly skipped (06–11 only). */
  skipped: readonly StepId[];
};

function stepInput(id: StepId, flow: FlowSnapshot): unknown {
  const prefs = flow.preferences;
  switch (id) {
    case "start":
      return { adultConfirmed: flow.adultConfirmed };
    case "goals":
      return { goals: flow.goals };
    case "focus":
      return { focusAreas: flow.focusAreas };
    case "timeline":
      return { timeline: flow.timeline };
    case "budget":
      return { budget: flow.budget };
    case "skin":
    case "brows":
    case "eyes":
    case "smile":
    case "jaw":
      return { [id]: prefs[id] ?? [] };
    case "hair":
      return {
        hair: prefs.hair ?? [],
        facialHairRelevant: prefs.facialHairRelevant,
        facialHair: prefs.facialHair ?? [],
      };
    case "constraints":
      return flow.constraints ?? {};
    case "photo-guide":
      return { photoGuideAcknowledged: flow.photoGuideAcknowledged };
    case "photos":
      return { frontPhotoReady: flow.frontPhotoReady, photoOwnershipConfirmed: flow.photoOwnershipConfirmed };
    case "delivery":
      return {
        email: flow.email,
        faceProcessingConsent: flow.faceProcessingConsent,
        termsAccepted: flow.termsAccepted,
        marketingOptIn: flow.marketingOptIn,
      };
    case "review":
      return {};
  }
}

/**
 * A preference step (06–11) counts as complete once answered or explicitly skipped.
 * Other steps must pass their schema.
 */
export function isStepComplete(id: StepId, flow: FlowSnapshot): boolean {
  if (getStep(id).skippable && flow.skipped.includes(id)) return true;
  const result = stepSchemas[id].safeParse(stepInput(id, flow));
  if (!result.success) return false;
  if (getStep(id).skippable) {
    const value = stepInput(id, flow) as Record<string, unknown>;
    // An untouched preference step (empty list, never skipped) is not complete.
    return Object.values(value).some((entry) => (Array.isArray(entry) ? entry.length > 0 : entry !== undefined));
  }
  return true;
}

/**
 * The furthest step a visitor may open: the first incomplete step before `target`,
 * or `target` itself. Keeps deep links and browser history on safe, valid steps.
 */
export function resolveAccessibleStep(target: StepId, flow: FlowSnapshot): StepDefinition {
  for (const id of STEP_ORDER) {
    if (id === target) return getStep(target);
    if (!isStepComplete(id, flow)) return getStep(id);
  }
  return getStep(target);
}

export function validateStep(id: StepId, flow: FlowSnapshot) {
  return stepSchemas[id].safeParse(stepInput(id, flow));
}
