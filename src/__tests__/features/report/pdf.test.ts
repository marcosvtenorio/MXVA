import { readFileSync } from "node:fs";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { auditReportPdf, composeReportPdf } from "@/features/report/pdf";
import { planReport } from "@/features/report/planner";
import type { ReportInput } from "@/features/onboarding/schema";

const input: ReportInput = {
  goals: ["overall"],
  focusAreas: ["skin", "hair", "smile", "jaw_presentation"],
  timeline: "90d",
  budget: "moderate",
  preferences: {
    skin: ["routine", "clarity"],
    brows: [],
    eyes: ["rested"],
    hair: ["cut", "hairline_framing"],
    facialHairRelevant: "no",
    facialHair: [],
    smile: ["whitening_info"],
    jaw: ["photo_presentation"],
  },
  constraints: { dailyMinutes: "15", avoid: ["fragrance"] },
};

const observations = {
  imageQuality: { usable: true, faceCount: 1, lightingLimitations: "" },
  possibleMinor: false,
  glowUp: {
    facialHair: "stay_clean_shaven" as const,
    skin: { blemishes: false, redness: false, unevenTone: false, shine: false },
    browsNeedGrooming: false,
    eyesLookTired: false,
    teethVisible: false,
    jawSoftTissue: "defined" as const,
  },
  observations: [],
  cannotAssess: [],
};

const consultation =
  "Here’s the glow-up I’d recommend.\n\n### Highest-impact recommendations\n\n**1. Hair: a textured cut**\n- Keep the waves; taper the sides.\n- Color: a soft espresso gloss.\n\n---\n\n**Overall read:** strong brows — keep them.";

async function compose(conceptLayout: "comparison" | "portrait") {
  const report = planReport(input, observations, { simulated: true, now: new Date("2026-10-11T12:00:00Z"), consultation, conceptLayout });
  const photo = readFileSync(new URL("../../../../e2e/fixtures/synthetic-front.jpg", import.meta.url));
  const concept = await sharp(photo).resize(1200).jpeg().toBuffer();
  const original = await sharp(photo).resize(900).jpeg().toBuffer();
  const pdf = await composeReportPdf({ report, conceptJpeg: concept, originalJpeg: original, brandName: "MXVA", supportEmail: "support@example.com" });
  return { report, pdf, audit: await auditReportPdf(pdf, report) };
}

describe("report PDF", () => {
  it("shows the consultant's annotated before and after, links every source and passes the audit", async () => {
    const { report, pdf, audit } = await compose("comparison");
    expect(audit.problems).toEqual([]);
    expect(audit.ok).toBe(true);
    // The comparison already holds the before: one image, no unused copy of the buyer's photo.
    expect(audit.images).toBe(1);
    expect(audit.pages).toBeGreaterThanOrEqual(5);
    expect(new Set(audit.links)).toEqual(new Set(report.usedSources.map((source) => source.url)));
    expect(pdf.byteLength).toBeLessThan(5 * 1024 * 1024);
  });

  it("puts a single after photo next to the buyer's own: before and after", async () => {
    const { audit } = await compose("portrait");
    expect(audit.ok).toBe(true);
    expect(audit.images).toBe(2);
  });
});
