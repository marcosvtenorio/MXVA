import { create } from "zustand";
import type { FlowSnapshot } from "./navigation";
import {
  clearPersistedAnswers,
  readAgeRefusal,
  writeAgeRefusal,
  loadPersistedAnswers,
  savePersistedAnswers,
  type PersistedAnswers,
} from "./persistence";
import type {
  AvoidOption,
  Budget,
  DailyMinutes,
  FocusArea,
  Goal,
  Preferences,
  StepId,
  Timeline,
} from "./schema";

type PreferenceKey = Exclude<keyof Preferences, "facialHairRelevant">;

export type OnboardingState = {
  /** True once sessionStorage recovery ran (guards wait for it). */
  hydrated: boolean;
  adultConfirmed: boolean;
  /** Visitor declared they are under 18. Memory only; blocks the whole flow. */
  ageRefused: boolean;
  goals: Goal[];
  focusAreas: FocusArea[];
  timeline?: Timeline;
  budget?: Budget;
  preferences: Preferences;
  constraints: { dailyMinutes?: DailyMinutes; avoid: AvoidOption[]; note?: string };
  skipped: StepId[];
  photoGuideAcknowledged: boolean;
  // ── Memory only: never written to any browser storage ──
  email: string;
  faceProcessingConsent: boolean;
  termsAccepted: boolean;
  marketingOptIn: boolean;
};

type OnboardingActions = {
  hydrate: () => void;
  set: (patch: Partial<Omit<OnboardingState, "hydrated" | "preferences" | "constraints">>) => void;
  setPreference: <K extends PreferenceKey>(key: K, values: Preferences[K]) => void;
  setFacialHairRelevant: (value: Preferences["facialHairRelevant"]) => void;
  setConstraints: (patch: Partial<OnboardingState["constraints"]>) => void;
  /** Marks a preference step as skipped and clears its answers. */
  skip: (id: StepId) => void;
  /** Visitor said they are under 18: wipe answers and block the flow for this tab. */
  refuseAge: () => void;
  /** Clears everything: memory, and the sessionStorage recovery copy. */
  reset: () => void;
};

export const EMPTY_PREFERENCES: Preferences = {
  skin: [],
  brows: [],
  eyes: [],
  hair: [],
  facialHairRelevant: undefined,
  facialHair: [],
  smile: [],
  jaw: [],
};

const initialState = (): OnboardingState => ({
  hydrated: false,
  adultConfirmed: false,
  ageRefused: false,
  goals: [],
  focusAreas: [],
  timeline: undefined,
  budget: undefined,
  preferences: { ...EMPTY_PREFERENCES },
  constraints: { avoid: [] },
  skipped: [],
  photoGuideAcknowledged: false,
  email: "",
  faceProcessingConsent: false,
  termsAccepted: false,
  marketingOptIn: false,
});

/** The allowlisted, non-sensitive slice that may survive a refresh. */
export function toPersisted(state: OnboardingState): PersistedAnswers {
  return {
    adultConfirmed: state.adultConfirmed,
    goals: state.goals,
    focusAreas: state.focusAreas,
    timeline: state.timeline,
    budget: state.budget,
    preferences: state.preferences,
    constraints: { dailyMinutes: state.constraints.dailyMinutes, avoid: state.constraints.avoid },
    skipped: state.skipped,
    photoGuideAcknowledged: state.photoGuideAcknowledged,
  };
}

const PREFERENCE_STEP: Partial<Record<StepId, PreferenceKey[]>> = {
  skin: ["skin"],
  brows: ["brows"],
  eyes: ["eyes"],
  hair: ["hair", "facialHair"],
  smile: ["smile"],
  jaw: ["jaw"],
};

export const useOnboardingStore = create<OnboardingState & OnboardingActions>()((set, get) => ({
  ...initialState(),

  hydrate: () => {
    if (get().hydrated) return;
    if (readAgeRefusal()) {
      clearPersistedAnswers();
      set({ ageRefused: true, hydrated: true });
      return;
    }
    const saved = loadPersistedAnswers();
    set(saved ? { ...saved, constraints: { ...saved.constraints }, hydrated: true } : { hydrated: true });
  },

  set: (patch) => set(patch),

  setPreference: (key, values) =>
    set((state) => ({
      preferences: { ...state.preferences, [key]: values },
      skipped: state.skipped.filter((id) => !PREFERENCE_STEP[id]?.includes(key)),
    })),

  setFacialHairRelevant: (value) =>
    set((state) => ({
      preferences: {
        ...state.preferences,
        facialHairRelevant: value,
        // Facial-hair preferences only exist when facial hair is relevant.
        facialHair: value === "yes" ? state.preferences.facialHair : [],
      },
      skipped: state.skipped.filter((id) => id !== "hair"),
    })),

  setConstraints: (patch) => set((state) => ({ constraints: { ...state.constraints, ...patch } })),

  skip: (id) =>
    set((state) => {
      const keys = PREFERENCE_STEP[id];
      if (!keys) return state;
      const preferences = { ...state.preferences };
      for (const key of keys) preferences[key] = [];
      if (id === "hair") preferences.facialHairRelevant = undefined;
      return { preferences, skipped: state.skipped.includes(id) ? state.skipped : [...state.skipped, id] };
    }),

  refuseAge: () => {
    clearPersistedAnswers();
    writeAgeRefusal();
    set({ ...initialState(), ageRefused: true, hydrated: true });
  },

  reset: () => {
    clearPersistedAnswers();
    set({ ...initialState(), hydrated: true });
  },
}));

// Persist the allowlisted slice after hydration. Memory-only fields never reach storage.
useOnboardingStore.subscribe((state) => {
  if (state.hydrated && !state.ageRefused) savePersistedAnswers(toPersisted(state));
});

/** Builds the navigation snapshot from both stores. */
export function flowSnapshot(
  state: OnboardingState,
  photos: { frontPhotoReady: boolean; ownershipConfirmed: boolean },
): FlowSnapshot {
  return {
    adultConfirmed: state.adultConfirmed && !state.ageRefused,
    goals: state.goals,
    focusAreas: state.focusAreas,
    timeline: state.timeline,
    budget: state.budget,
    preferences: state.preferences,
    constraints: state.constraints,
    photoGuideAcknowledged: state.photoGuideAcknowledged,
    frontPhotoReady: photos.frontPhotoReady,
    photoOwnershipConfirmed: photos.ownershipConfirmed,
    email: state.email,
    faceProcessingConsent: state.faceProcessingConsent,
    termsAccepted: state.termsAccepted,
    marketingOptIn: state.marketingOptIn,
    skipped: state.skipped,
  };
}
