import {
  PDFDict,
  PDFDocument,
  PDFName,
  PDFString,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFImage,
  type PDFPage,
} from "pdf-lib";
import { CONCEPT_LABEL, type PaidReport } from "./schema";

/**
 * PDFComposer (spec §8): one A4 PDF holding the concept image and the full sourced
 * report, built entirely in memory. Typography follows the design tokens once the
 * brand fonts are embedded (Step 9); standard fonts keep it dependency-free for now.
 */

const PAGE = { width: 595.28, height: 841.89 }; // A4 in points
const MARGIN = 56;
const CONTENT_WIDTH = PAGE.width - MARGIN * 2;
const INK = rgb(0.07, 0.07, 0.08);
const MUTED = rgb(0.38, 0.38, 0.42);
const RULE = rgb(0.85, 0.85, 0.87);
const ACCENT = rgb(0.13, 0.32, 0.86);

const AREA_LABELS: Record<string, string> = {
  skin: "Skin",
  brows: "Brows",
  eye_area: "Eye area",
  hair: "Hair",
  facial_hair: "Facial hair",
  smile: "Smile",
  jaw_presentation: "Jawline presentation",
};

const EVIDENCE_LABELS = { established: "Established guidance", limited: "Limited evidence", styling_opinion: "Styling opinion" };
const COST_LABELS = { free: "Free", low: "Low cost", medium: "Medium cost", professional: "Professional" };
const HORIZON_LABELS = { now: "Start now", "30d": "Within 30 days", "90d": "Within 90 days", professional: "Optional consult" };

// Characters outside WinAnsi (the standard fonts' encoding) are mapped or dropped.
const REPLACEMENTS: Record<string, string> = { "≥": ">=", "≤": "<=", "→": "->", "✓": "-", " ": " ", " ": " ", " ": " " };

export type ComposeInput = {
  report: PaidReport;
  conceptJpeg: Uint8Array;
  brandName: string;
  supportEmail: string;
  /** The buyer's IANA time zone; the date is theirs, not the server's (UTC). */
  timeZone?: string;
};

class Writer {
  page!: PDFPage;
  y = 0;
  pages: PDFPage[] = [];

  constructor(
    readonly doc: PDFDocument,
    readonly regular: PDFFont,
    readonly bold: PDFFont,
  ) {
    this.newPage();
  }

  newPage(): void {
    this.page = this.doc.addPage([PAGE.width, PAGE.height]);
    this.pages.push(this.page);
    this.y = PAGE.height - MARGIN;
  }

  ensure(height: number): void {
    if (this.y - height < MARGIN + 28) this.newPage();
  }

  clean(text: string, font: PDFFont): string {
    let out = "";
    for (const char of text) {
      const mapped = REPLACEMENTS[char] ?? char;
      try {
        font.encodeText(mapped);
        out += mapped;
      } catch {
        // unencodable glyph: drop it
      }
    }
    return out;
  }

  wrap(text: string, font: PDFFont, size: number, width: number): string[] {
    const lines: string[] = [];
    for (const paragraph of this.clean(text, font).split("\n")) {
      let line = "";
      for (const word of paragraph.split(/\s+/).filter(Boolean)) {
        const candidate = line ? `${line} ${word}` : word;
        if (font.widthOfTextAtSize(candidate, size) <= width) {
          line = candidate;
          continue;
        }
        if (line) lines.push(line);
        // Break words longer than the line (e.g. URLs) by characters.
        let rest = word;
        while (font.widthOfTextAtSize(rest, size) > width) {
          let cut = rest.length - 1;
          while (cut > 1 && font.widthOfTextAtSize(rest.slice(0, cut), size) > width) cut--;
          lines.push(rest.slice(0, cut));
          rest = rest.slice(cut);
        }
        line = rest;
      }
      lines.push(line);
    }
    return lines;
  }

  text(
    text: string,
    options: { size?: number; font?: PDFFont; color?: ReturnType<typeof rgb>; gap?: number; indent?: number; leading?: number } = {},
  ): { firstLineY: number; lines: string[] } {
    const size = options.size ?? 10.5;
    const font = options.font ?? this.regular;
    const leading = options.leading ?? size * 1.42;
    const indent = options.indent ?? 0;
    const lines = this.wrap(text, font, size, CONTENT_WIDTH - indent);
    let firstLineY = this.y;
    lines.forEach((line, index) => {
      this.ensure(leading);
      if (index === 0) firstLineY = this.y;
      this.page.drawText(line, { x: MARGIN + indent, y: this.y - size, size, font, color: options.color ?? INK });
      this.y -= leading;
    });
    this.y -= options.gap ?? 0;
    return { firstLineY, lines };
  }

  heading(text: string, size = 17): void {
    this.ensure(size * 3);
    this.y -= 6;
    this.text(text, { size, font: this.bold, gap: 6, leading: size * 1.25 });
  }

  label(text: string): void {
    this.text(text.toUpperCase(), { size: 8, font: this.bold, color: MUTED, gap: 2 });
  }

  rule(gap = 12): void {
    this.ensure(gap * 2);
    this.page.drawLine({
      start: { x: MARGIN, y: this.y - gap / 2 },
      end: { x: PAGE.width - MARGIN, y: this.y - gap / 2 },
      thickness: 0.6,
      color: RULE,
    });
    this.y -= gap;
  }

  bullets(items: readonly string[], size = 10.5): void {
    for (const item of items) {
      this.ensure(size * 2);
      this.page.drawText("•", { x: MARGIN, y: this.y - size, size, font: this.regular, color: MUTED });
      this.text(item, { size, indent: 14, gap: 3 });
    }
  }

  link(url: string, x: number, yTop: number, width: number, height: number): void {
    const annotation = this.doc.context.obj({
      Type: "Annot",
      Subtype: "Link",
      Rect: [x, yTop - height, x + width, yTop],
      Border: [0, 0, 0],
      A: { Type: "Action", S: "URI", URI: PDFString.of(url) },
    });
    this.page.node.addAnnot(this.doc.context.register(annotation));
  }
}

function drawImagePage(writer: Writer, image: PDFImage, report: PaidReport): void {
  writer.newPage();
  writer.label("Your AI concept image");
  writer.heading("Your glow-up, on your own face", 18);
  writer.text(CONCEPT_LABEL, { size: 9.5, font: writer.bold, color: ACCENT, gap: report.simulated ? 2 : 10 });
  if (report.simulated) {
    writer.text("Development preview: produced by simulated providers, not a real AI edit.", {
      size: 9,
      color: MUTED,
      gap: 10,
    });
  }

  const maxHeight = PAGE.height * 0.46;
  const scale = Math.min(CONTENT_WIDTH / image.width, maxHeight / image.height, 1);
  const width = image.width * scale;
  const height = image.height * scale;
  writer.ensure(height + 20);
  writer.page.drawImage(image, { x: MARGIN + (CONTENT_WIDTH - width) / 2, y: writer.y - height, width, height });
  writer.y -= height + 16;

  writer.label("What was changed");
  writer.bullets(report.imageEditSummary, 10);
  writer.y -= 6;
  writer.text(report.disclaimer, { size: 9, color: MUTED });
}

export async function composeReportPdf(input: ComposeInput): Promise<Uint8Array> {
  const { report } = input;
  const doc = await PDFDocument.create();
  doc.setTitle(`${input.brandName} — ${report.title}`);
  doc.setAuthor(input.brandName);
  doc.setSubject("Personal appearance roadmap with an AI concept image");
  doc.setCreator(input.brandName);
  doc.setProducer(input.brandName);
  doc.setCreationDate(new Date(report.createdAt));

  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const image = await doc.embedJpg(input.conceptJpeg);
  const writer = new Writer(doc, regular, bold);

  // ── Cover ──
  writer.text(input.brandName.toUpperCase(), { size: 11, font: bold, gap: 40 });
  writer.text(report.title, { size: 30, font: bold, leading: 36, gap: 8 });
  writer.text(
    new Date(report.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: input.timeZone ?? "UTC" }),
    { size: 11, color: MUTED, gap: 28 },
  );
  writer.label("Your plan covers");
  writer.bullets(report.goalsSummary, 11);
  writer.y -= 14;
  writer.label("Inside");
  writer.bullets([
    "Your AI concept image and what was changed",
    `${report.recommendations.length} prioritised suggestions, ranked by fit, evidence, effort and cost`,
    "A 7-day start, a 30-day plan and a 90-day plan",
    "Notes on your photo, questions for professionals, and every source",
  ]);
  writer.y -= 14;
  writer.rule();
  writer.text(report.disclaimer, { size: 9.5, color: MUTED, gap: 4 });
  writer.text(
    "Not medical advice. Nothing in this report is a diagnosis. We don't keep your photos or this report: this PDF is your copy.",
    { size: 9.5, color: MUTED },
  );

  // ── Concept image ──
  drawImagePage(writer, image, report);

  // ── Observations ──
  writer.newPage();
  writer.label("What we could see");
  writer.heading("Visible observations");
  if (report.observations.length === 0) {
    writer.text("Nothing specific could be assessed reliably from your photo for the areas you chose.", { color: MUTED });
  }
  for (const entry of report.observations) {
    writer.text(`${AREA_LABELS[entry.area] ?? entry.area} · confidence ${entry.confidence}`, { size: 9, font: bold, color: MUTED });
    writer.text(entry.observation, { gap: 8 });
  }
  writer.rule();
  writer.label("Notes on your photo");
  writer.bullets(report.cannotAssess, 10);

  // ── Recommendations ──
  writer.newPage();
  writer.label("Your priorities");
  writer.heading("What to do, in order");
  const sourceNumber = new Map(report.usedSources.map((source, index) => [source.id, index + 1]));
  report.recommendations.forEach((rec, index) => {
    writer.ensure(120);
    writer.text(`${index + 1}. ${rec.title}`, { size: 13, font: bold, leading: 17, gap: 2 });
    writer.text(
      [AREA_LABELS[rec.area], EVIDENCE_LABELS[rec.evidenceLevel], `${rec.effort} effort`, COST_LABELS[rec.costBand], HORIZON_LABELS[rec.horizon]]
        .filter(Boolean)
        .join("  ·  "),
      { size: 8.5, color: MUTED, gap: 4 },
    );
    writer.text(`Seen: ${rec.observation}`, { size: 10, color: MUTED, gap: 2 });
    writer.text(rec.suggestion, { gap: 2 });
    const cites = rec.sourceIds.map((id) => `[${sourceNumber.get(id)}]`).join(" ");
    writer.text(`Why: ${rec.reason}${cites ? ` ${cites}` : ""}`, { size: 10, gap: 2 });
    writer.text(`Uncertainty: ${rec.uncertainty}`, { size: 9.5, color: MUTED, gap: 4 });
    writer.rule(10);
  });

  // ── Schedule ──
  writer.newPage();
  writer.label("Your schedule");
  writer.heading("7 days");
  writer.bullets(report.sevenDayPlan);
  writer.heading("30 days");
  writer.bullets(report.thirtyDayPlan);
  writer.heading("90 days");
  writer.bullets(report.ninetyDayPlan);
  writer.y -= 8;
  writer.text(report.budgetNote, { size: 9, color: MUTED });

  if (report.professionalQuestions?.length) {
    writer.rule();
    writer.label("If you see a professional");
    writer.text("Questions you could bring. Consider consulting a qualified professional; MXVA does not diagnose or prescribe.", {
      size: 10,
      color: MUTED,
      gap: 4,
    });
    writer.bullets(report.professionalQuestions);
  }

  // ── References ──
  writer.newPage();
  writer.label("Sources");
  writer.heading("References");
  writer.text("Suggestions marked “styling opinion” are not backed by research. Links were checked on the access date shown.", {
    size: 9.5,
    color: MUTED,
    gap: 8,
  });
  report.usedSources.forEach((source, index) => {
    writer.ensure(80);
    writer.text(`[${index + 1}] ${source.title}`, { size: 10, font: bold, gap: 1 });
    writer.text(`${source.publisher}. ${source.dateLabel}. Accessed ${source.accessedAt}.`, { size: 9, color: MUTED, gap: 1 });
    const { firstLineY, lines } = writer.text(source.url, { size: 9, color: ACCENT, gap: 1 });
    const linkHeight = lines.length * 9 * 1.42;
    writer.link(source.url, MARGIN, firstLineY, CONTENT_WIDTH, linkHeight);
    writer.text(`Limitations: ${source.limitations}`, { size: 9, color: MUTED, gap: 8 });
  });

  // ── Limitations & privacy ──
  writer.ensure(160);
  writer.rule();
  writer.label("Limitations and privacy");
  writer.bullets(
    [
      report.disclaimer,
      "This report describes visible presentation only. It is not medical, dermatological or dental advice and not a diagnosis.",
      "Your photos were processed temporarily to create this report and are not kept in our photo database. AI and email providers process data under their own terms, as described in our Privacy Policy.",
      "This email and PDF stay in your mailbox until you delete them.",
      `Questions, corrections or a refund request: ${input.supportEmail}`,
    ],
    9.5,
  );

  // ── Footer on every page ──
  const total = writer.pages.length;
  writer.pages.forEach((page, index) => {
    const footer = `${input.brandName} · ${report.title} · ${index + 1} of ${total}`;
    page.drawText(writer.clean(footer, regular), { x: MARGIN, y: MARGIN / 2, size: 8, font: regular, color: MUTED });
    if (index === 1) {
      const label = writer.clean(CONCEPT_LABEL, bold);
      const width = bold.widthOfTextAtSize(label, 8);
      page.drawText(label, { x: PAGE.width - MARGIN - width, y: MARGIN / 2, size: 8, font: bold, color: ACCENT });
    }
  });

  return doc.save({ useObjectStreams: true });
}

export type PdfAudit = { ok: boolean; pages: number; images: number; links: string[]; problems: string[] };

/** Final check before anything is emailed (spec §8). */
export async function auditReportPdf(bytes: Uint8Array, report: PaidReport): Promise<PdfAudit> {
  const problems: string[] = [];
  const doc = await PDFDocument.load(bytes);
  const pages = doc.getPages();
  let images = 0;
  const links: string[] = [];

  for (const page of pages) {
    const xObjects = page.node.Resources()?.lookup(PDFName.of("XObject"), PDFDict);
    for (const key of xObjects?.keys() ?? []) {
      const object = xObjects?.lookup(key);
      if (object && "dict" in object && (object as { dict: PDFDict }).dict.get(PDFName.of("Subtype"))?.toString() === "/Image") {
        images++;
      }
    }
    const annots = page.node.Annots();
    for (let i = 0; i < (annots?.size() ?? 0); i++) {
      const annot = annots?.lookup(i, PDFDict);
      const action = annot?.lookupMaybe(PDFName.of("A"), PDFDict);
      const uri = action?.lookupMaybe(PDFName.of("URI"), PDFString);
      if (uri) links.push(uri.decodeText());
    }
  }

  if (pages.length < 5) problems.push("too_few_pages");
  if (images < 1) problems.push("concept_image_missing");
  for (const source of report.usedSources) if (!links.includes(source.url)) problems.push(`link_missing:${source.id}`);
  // Template leaks only show up in text we compose; model-written observations may
  // legitimately contain words like "undefined" ("edges look undefined").
  const composed = JSON.stringify({
    ...report,
    observations: [],
    cannotAssess: [],
    recommendations: report.recommendations.map((rec) => ({ ...rec, observation: "" })),
  });
  if (/lorem ipsum|\bTODO\b|\{\{|\[object Object\]/i.test(JSON.stringify(report))) problems.push("placeholder_text");
  if (/\bundefined\b|\bNaN\b|\bnull\b(?=")/.test(composed)) problems.push("placeholder_text");
  return { ok: problems.length === 0, pages: pages.length, images, links, problems };
}
