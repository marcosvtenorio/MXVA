// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { AGE_REFUSAL_KEY, PERSISTENCE_KEY } from "@/features/onboarding/persistence";
import { useOnboardingStore } from "@/features/onboarding/store";

const store = () => useOnboardingStore.getState();

function storedText(): string {
  const parts: string[] = [];
  for (let i = 0; i < sessionStorage.length; i++) {
    const key = sessionStorage.key(i)!;
    parts.push(key, sessionStorage.getItem(key) ?? "");
  }
  for (let i = 0; i < localStorage.length; i++) parts.push(localStorage.key(i)!);
  return parts.join("\n");
}

describe("onboarding store", () => {
  beforeEach(() => {
    store().reset();
  });

  it("keeps email, consents, marketing choice and the free-text note out of browser storage", () => {
    store().set({ adultConfirmed: true, goals: ["grooming"], email: "secret.person@example.com" });
    store().set({ faceProcessingConsent: true, termsAccepted: true, marketingOptIn: true });
    store().setConstraints({ dailyMinutes: "15", note: "private note text" });

    const text = storedText();
    expect(text).toContain(PERSISTENCE_KEY);
    expect(text).toContain("grooming");
    expect(text).not.toContain("secret.person");
    expect(text).not.toContain("private note text");
    expect(text).not.toMatch(/faceProcessingConsent|termsAccepted|marketingOptIn/);
  });

  it("recovers non-image answers after a simulated reload", () => {
    store().set({ adultConfirmed: true, goals: ["hair"], focusAreas: ["hair"], email: "a@b.co" });
    useOnboardingStore.setState({ hydrated: false, goals: [], focusAreas: [], adultConfirmed: false, email: "" });
    store().hydrate();
    expect(store().goals).toEqual(["hair"]);
    expect(store().adultConfirmed).toBe(true);
    expect(store().email).toBe("");
  });

  it("clears a preference step's answers when skipped and un-skips on answer", () => {
    store().setPreference("brows", ["shape"]);
    store().skip("brows");
    expect(store().preferences.brows).toEqual([]);
    expect(store().skipped).toContain("brows");
    store().setPreference("brows", ["fuller"]);
    expect(store().skipped).not.toContain("brows");
  });

  it("drops facial-hair preferences when facial hair is not relevant", () => {
    store().setFacialHairRelevant("yes");
    store().setPreference("facialHair", ["stubble"]);
    store().setFacialHairRelevant("no");
    expect(store().preferences.facialHair).toEqual([]);
  });

  it("wipes answers and blocks the tab on an under-18 declaration", () => {
    store().set({ adultConfirmed: true, goals: ["smile"] });
    store().refuseAge();
    expect(store().ageRefused).toBe(true);
    expect(store().goals).toEqual([]);
    expect(sessionStorage.getItem(PERSISTENCE_KEY)).toBeNull();
    expect(sessionStorage.getItem(AGE_REFUSAL_KEY)).toBe("refused");

    useOnboardingStore.setState({ hydrated: false, ageRefused: false });
    store().hydrate();
    expect(store().ageRefused).toBe(true);
  });
});
