// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import {
  PERSISTENCE_KEY,
  PERSISTENCE_TTL_MS,
  loadPersistedAnswers,
  savePersistedAnswers,
  type PersistedAnswers,
} from "@/features/onboarding/persistence";
import { EMPTY_PREFERENCES } from "@/features/onboarding/store";

const answers: PersistedAnswers = {
  adultConfirmed: true,
  goals: ["smile"],
  focusAreas: ["smile"],
  timeline: "week",
  budget: "none",
  preferences: { ...EMPTY_PREFERENCES, smile: ["hygiene"] },
  constraints: { dailyMinutes: "5", avoid: [] },
  skipped: ["skin"],
  photoGuideAcknowledged: true,
};

describe("sessionStorage recovery", () => {
  it("round-trips allowlisted answers within the TTL", () => {
    const now = 1_000_000;
    savePersistedAnswers(answers, now);
    expect(loadPersistedAnswers(now + 1000)).toEqual(answers);
  });

  it("expires after the TTL and removes the copy", () => {
    const now = 1_000_000;
    savePersistedAnswers(answers, now);
    expect(loadPersistedAnswers(now + PERSISTENCE_TTL_MS + 1)).toBeUndefined();
    expect(sessionStorage.getItem(PERSISTENCE_KEY)).toBeNull();
  });

  it("refuses to save fields outside the allowlist", () => {
    const withEmail = { ...answers, email: "a@b.co" } as unknown as PersistedAnswers;
    expect(() => savePersistedAnswers(withEmail)).toThrow();
    expect(sessionStorage.getItem(PERSISTENCE_KEY)).toBeNull();
  });

  it("discards tampered or unexpected data", () => {
    sessionStorage.setItem(
      PERSISTENCE_KEY,
      JSON.stringify({ v: 1, savedAt: Date.now(), data: { ...answers, photo: "data:image/jpeg;base64,AAAA" } }),
    );
    expect(loadPersistedAnswers()).toBeUndefined();
    expect(sessionStorage.getItem(PERSISTENCE_KEY)).toBeNull();

    sessionStorage.setItem(PERSISTENCE_KEY, "{not json");
    expect(loadPersistedAnswers()).toBeUndefined();
  });

  it("never touches localStorage", () => {
    savePersistedAnswers(answers);
    expect(localStorage.length).toBe(0);
  });
});
