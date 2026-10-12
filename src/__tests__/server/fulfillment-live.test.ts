import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { ReportInput } from "@/features/onboarding/schema";
import type { Order } from "@/features/orders/states";

/**
 * LIVE providers (OpenAI vision + image edit + identity QC, Resend), opt-in and paid per run.
 * Use only with a photo of a consenting adult or a fictional generated face:
 *   LIVE_AI_PHOTO=/path/photo.jpg LIVE_AI_OUT=/tmp/out [LIVE_EMAIL_TO=delivered@resend.dev] npx vitest run fulfillment-live
 * Keys come from the environment (VISION_API_KEY, VISION_MODEL, IMAGE_API_KEY, IMAGE_EDIT_MODEL,
 * RESEND_API_KEY, EMAIL_FROM). Outputs (observations, concept, PDF) are written to LIVE_AI_OUT.
 */
const photoPath = process.env.LIVE_AI_PHOTO;
const outDir = process.env.LIVE_AI_OUT ?? path.join(process.cwd(), "test-results", "live-ai");

const input: ReportInput = {
  goals: ["grooming"],
  focusAreas: ["brows", "facial_hair", "hair"],
  timeline: "30d",
  budget: "low",
  preferences: { skin: [], brows: ["shape"], eyes: [], hair: ["routine"], facialHairRelevant: "yes", facialHair: ["shape"], smile: [], jaw: [] },
  constraints: { dailyMinutes: "15", avoid: [] },
};

const saved: Record<string, string | undefined> = {};

describe.skipIf(!photoPath)("live fulfilment (real OpenAI + Resend)", () => {
  beforeAll(() => {
    for (const [key, value] of Object.entries({ NEXT_PUBLIC_ENABLE_REAL_AI: "true", NEXT_PUBLIC_SHOW_DEV_PREVIEW: "false" })) {
      saved[key] = process.env[key];
      process.env[key] = value;
    }
    vi.resetModules();
    mkdirSync(outDir, { recursive: true });
  });

  afterAll(() => {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    vi.resetModules();
  });

  it("analyses the photo, makes a recognisable concept that passes QC, builds and emails the PDF", async () => {
    const { validateUploadedPhoto } = await import("@/server/photos/validate");
    const { runPipeline } = await import("@/server/fulfillment/pipeline");
    const { fulfillmentMode } = await import("@/server/config");
    expect(fulfillmentMode()).toBe("real");

    const bytes = readFileSync(photoPath!);
    const front = await validateUploadedPhoto(new File([bytes], "front.jpg", { type: "image/jpeg" }), 15 * 1024 * 1024);
    const order = {
      id: "00000000-0000-4000-8000-000000000001",
      email: process.env.LIVE_EMAIL_TO ?? "delivered@resend.dev",
      fulfillmentAttempts: 1,
    } as Order;

    const phases: { phase: string; at: number }[] = [];
    const started = Date.now();
    const output = await runPipeline({ order, front, profiles: [], input, onPhase: (phase) => phases.push({ phase, at: Date.now() - started }) });

    writeFileSync(path.join(outDir, "concept.jpg"), output.conceptJpeg);
    writeFileSync(path.join(outDir, "report.pdf"), output.pdf);
    writeFileSync(path.join(outDir, "report.json"), JSON.stringify({ phases, totalMs: Date.now() - started, report: output.report, emailDelivered: output.emailDelivered }, null, 2));

    expect(output.report.simulated).toBe(false);
    expect(output.conceptJpeg.subarray(0, 2).toString("hex")).toBe("ffd8");
    expect(Buffer.from(output.pdf.subarray(0, 5)).toString()).toBe("%PDF-");
    expect(output.emailDelivered).toBe(true);
  }, 600_000);
});
