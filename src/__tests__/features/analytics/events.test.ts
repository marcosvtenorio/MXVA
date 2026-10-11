import { describe, expect, it } from "vitest";
import { attributionFromUrl, regionHint } from "@/features/analytics/attribution";
import { parseConsentCookie, serializeConsent } from "@/features/analytics/consent";
import { cohortFor, parseEventBatch } from "@/features/analytics/events";

const context = {
  sid: "a".repeat(32),
  path: "/onboarding/photos",
  attribution: { utmSource: "instagram", utmCampaign: "launch_br" },
  regionHint: "BR",
  consent: { analytics: false, marketing: false },
};

describe("analytics allowlist", () => {
  it("accepts declared events with declared props", () => {
    const batch = parseEventBatch({
      context,
      events: [
        { name: "onboarding_step_completed", props: { step: "photos" }, ts: 1 },
        { name: "photo_ready", props: { ready: true, profiles: 2 }, ts: 2 },
        { name: "web_vital", props: { metric: "LCP", value: 1800, rating: "good" }, ts: 3 },
      ],
    });
    expect(batch?.events).toHaveLength(3);
  });

  it("rejects survey answers, free text and photo data smuggled into props", () => {
    for (const props of [
      { step: "goals", goals: ["clear_skin"] },
      { step: "photos", fileName: "IMG_0001.jpg" },
      { step: "delivery", email: "a@b.co" },
    ]) {
      expect(parseEventBatch({ context, events: [{ name: "onboarding_step_completed", props, ts: 1 }] })).toBeUndefined();
    }
    expect(parseEventBatch({ context, events: [{ name: "photo_uploaded", props: { base64: "AAAA" }, ts: 1 }] })).toBeUndefined();
  });

  it("rejects unknown context fields, emails in UTM values and oversized batches", () => {
    expect(parseEventBatch({ context: { ...context, email: "a@b.co" }, events: [{ name: "landing_view", props: {}, ts: 1 }] })).toBeUndefined();
    expect(
      parseEventBatch({
        context: { ...context, attribution: { utmSource: "someone@example.com" } },
        events: [{ name: "landing_view", props: {}, ts: 1 }],
      }),
    ).toBeUndefined();
    const many = Array.from({ length: 26 }, (_, i) => ({ name: "landing_view", props: {}, ts: i + 1 }));
    expect(parseEventBatch({ context, events: many })).toBeUndefined();
  });

  it("maps countries to market cohorts", () => {
    expect(cohortFor("BR")).toBe("BR");
    expect(cohortFor("PT")).toBe("OTHER");
    expect(cohortFor(undefined)).toBe("OTHER");
  });
});

describe("attribution", () => {
  it("reads UTM values, ad-click presence and the referring domain only", () => {
    const result = attributionFromUrl(
      "?utm_source=instagram&utm_medium=paid_social&utm_campaign=br_launch&fbclid=IwAR123abc",
      "https://l.instagram.com/?u=https%3A%2F%2Fmxva.app",
      "mxva.app",
    );
    expect(result).toEqual({
      utmSource: "instagram",
      utmMedium: "paid_social",
      utmCampaign: "br_launch",
      adClick: "meta",
      referrerDomain: "l.instagram.com",
    });
    expect(JSON.stringify(result)).not.toContain("IwAR123abc");
  });

  it("drops suspicious UTM values", () => {
    expect(attributionFromUrl("?utm_source=a@b.co&utm_campaign=<script>", "", "x")).toEqual({});
  });

  it("derives a coarse region from the time zone, then the locale", () => {
    expect(regionHint("America/Sao_Paulo", ["en-US"])).toBe("BR");
    expect(regionHint("America/Indiana/Indianapolis", [])).toBe("US");
    expect(regionHint("Europe/London", [])).toBe("GB");
    expect(regionHint("Asia/Tokyo", ["pt-BR"])).toBe("BR");
    expect(regionHint(undefined, ["en"])).toBeUndefined();
  });
});

describe("consent cookie", () => {
  it("round-trips and treats anything unknown as undecided", () => {
    expect(parseConsentCookie(serializeConsent({ analytics: true, marketing: false }))).toEqual({
      analytics: true,
      marketing: false,
      decided: true,
    });
    expect(parseConsentCookie("v0.a1.m1").decided).toBe(false);
    expect(parseConsentCookie(undefined)).toEqual({ analytics: false, marketing: false, decided: false });
  });
});
