import { z } from "zod";
import {
  AVOID_OPTIONS,
  BUDGETS,
  DAILY_MINUTES,
  FOCUS_AREAS,
  GOALS,
  TIMELINES,
  preferencesSchema,
  stepSchemas,
} from "./schema";

/**
 * Refresh recovery for short, non-sensitive survey choices only (spec §4).
 * Allowed: enumerated choices and progress flags, in sessionStorage, for 2 hours.
 * Never stored: photos, email, consents, marketing choice, the free-text note.
 */
export const PERSISTENCE_KEY = "mxva.onboarding.v1";
export const PERSISTENCE_TTL_MS = 2 * 60 * 60 * 1000;

export const persistedAnswersSchema = z
  .object({
    adultConfirmed: z.boolean(),
    goals: z.array(z.enum(GOALS)).max(1),
    focusAreas: z.array(z.enum(FOCUS_AREAS)).max(FOCUS_AREAS.length),
    timeline: z.enum(TIMELINES).optional(),
    budget: z.enum(BUDGETS).optional(),
    preferences: preferencesSchema,
    constraints: z
      .object({
        dailyMinutes: z.enum(DAILY_MINUTES).optional(),
        avoid: z.array(z.enum(AVOID_OPTIONS)).max(AVOID_OPTIONS.length),
      })
      .strict(),
    skipped: z.array(z.enum(Object.keys(stepSchemas) as [keyof typeof stepSchemas])).max(16),
    photoGuideAcknowledged: z.boolean(),
  })
  .strict();

export type PersistedAnswers = z.infer<typeof persistedAnswersSchema>;

const envelopeSchema = z.object({
  v: z.literal(1),
  savedAt: z.number().int().nonnegative(),
  data: z.unknown(),
});

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function sessionStore(): StorageLike | undefined {
  try {
    return typeof window === "undefined" ? undefined : window.sessionStorage;
  } catch {
    // Storage can be blocked (privacy modes, embedded browsers). Recovery is a convenience.
    return undefined;
  }
}

export function savePersistedAnswers(
  answers: PersistedAnswers,
  now: number = Date.now(),
  storage: StorageLike | undefined = sessionStore(),
): void {
  if (!storage) return;
  const data = persistedAnswersSchema.parse(answers);
  try {
    storage.setItem(PERSISTENCE_KEY, JSON.stringify({ v: 1, savedAt: now, data }));
  } catch {
    // Quota or access errors: the flow still works, just without refresh recovery.
  }
}

export function loadPersistedAnswers(
  now: number = Date.now(),
  storage: StorageLike | undefined = sessionStore(),
): PersistedAnswers | undefined {
  if (!storage) return undefined;
  let raw: string | null = null;
  try {
    raw = storage.getItem(PERSISTENCE_KEY);
  } catch {
    return undefined;
  }
  if (!raw) return undefined;

  try {
    const envelope = envelopeSchema.parse(JSON.parse(raw));
    if (now - envelope.savedAt > PERSISTENCE_TTL_MS || envelope.savedAt > now + 60_000) {
      clearPersistedAnswers(storage);
      return undefined;
    }
    return persistedAnswersSchema.parse(envelope.data);
  } catch {
    // Anything unexpected (tampering, old shape) is discarded, never trusted.
    clearPersistedAnswers(storage);
    return undefined;
  }
}

export function clearPersistedAnswers(storage: StorageLike | undefined = sessionStore()): void {
  try {
    storage?.removeItem(PERSISTENCE_KEY);
  } catch {
    // ignore
  }
}

/** A tab-scoped "under 18" declaration. A deterrent against instant retries, not a security control. */
export const AGE_REFUSAL_KEY = "mxva.agegate";

export function readAgeRefusal(storage: StorageLike | undefined = sessionStore()): boolean {
  try {
    return storage?.getItem(AGE_REFUSAL_KEY) === "refused";
  } catch {
    return false;
  }
}

export function writeAgeRefusal(storage: StorageLike | undefined = sessionStore()): void {
  try {
    storage?.setItem(AGE_REFUSAL_KEY, "refused");
  } catch {
    // ignore
  }
}
