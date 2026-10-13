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

describe("report PDF", () => {
  it("embeds the before and after, links every source and passes the audit", async () => {
    const report = planReport(
      input,
      {
        imageQuality: { usable: true, faceCount: 1, lightingLimitations: "" },
        possibleMinor: false,
        glowUp: {
          haircut: "side_part",
          facialHair: "stay_clean_shaven",
          skin: { blemishes: false, redness: false, unevenTone: false, shine: false },
          browsNeedGrooming: false,
          eyesLookTired: false,
          teethVisible: false,
          jawSoftTissue: "defined",
        },
        observations: [],
        cannotAssess: [],
      },
      { simulated: true, now: new Date("2026-10-11T12:00:00Z") },
    );
    const concept = await sharp(readFileSync(new URL("../../../../e2e/fixtures/synthetic-front.jpg", import.meta.url)))
      .resize(1200)
      .jpeg()
      .toBuffer();
    const original = await sharp(readFileSync(new URL("../../../../e2e/fixtures/synthetic-front.jpg", import.meta.url)))
      .resize(900)
      .jpeg()
      .toBuffer();
    const pdf = await composeReportPdf({ report, conceptJpeg: concept, originalJpeg: original, brandName: "MXVA", supportEmail: "support@example.com" });
    const audit = await auditReportPdf(pdf, report);
    expect(audit.problems).toEqual([]);
    expect(audit.ok).toBe(true);
    // Before and after: the buyer's photo and the concept, side by side.
    expect(audit.images).toBeGreaterThanOrEqual(2);
    expect(audit.pages).toBeGreaterThanOrEqual(5);
    expect(new Set(audit.links)).toEqual(new Set(report.usedSources.map((source) => source.url)));
    expect(pdf.byteLength).toBeLessThan(5 * 1024 * 1024);
  });
});
