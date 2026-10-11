// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { installAnalytics, pendingEventsForTests, resetAnalyticsForTests, track } from "@/features/analytics/client";
import { useConsentStore } from "@/features/analytics/consent";

describe("client tracker", () => {
  beforeEach(() => {
    resetAnalyticsForTests();
    useConsentStore.setState({ analytics: false, marketing: false, decided: false, loaded: true });
    document.cookie.split(";").forEach((c) => {
      document.cookie = `${c.split("=")[0]!.trim()}=; Max-Age=0; Path=/`;
    });
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 204 })));
  });

  afterEach(() => vi.unstubAllGlobals());

  it("queues allowlisted events and drops invalid ones", () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    track("onboarding_step_viewed", { step: "goals" });
    // @ts-expect-error — not an allowed prop
    track("onboarding_step_viewed", { step: "goals", goal: "clear_skin" });
    expect(pendingEventsForTests().map((event) => event.name)).toEqual(["onboarding_step_viewed"]);
  });

  it("keeps the session id in memory only without analytics consent", () => {
    installAnalytics();
    track("landing_view", {});
    expect(sessionStorage.getItem("mxva.sid")).toBeNull();
    expect(localStorage.length).toBe(0);
  });

  it("sets Meta browser ids only after marketing consent", () => {
    window.history.replaceState({}, "", "/?fbclid=IwAR_test_click_123");
    installAnalytics();
    expect(document.cookie).not.toContain("_fbc");
    useConsentStore.getState().choose({ analytics: true, marketing: true });
    expect(document.cookie).toContain("_fbc=fb.1.");
    expect(document.cookie).toContain("_fbp=fb.1.");
    useConsentStore.getState().choose({ analytics: true, marketing: false });
    expect(document.cookie).not.toContain("_fbc");
  });
});
