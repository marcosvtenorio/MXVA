import "server-only";
import { buildImageEditInstructions } from "@/features/report/planner";
import type { ReportInput } from "@/features/onboarding/schema";

/** Spec §7 base instruction, kept verbatim in spirit; requested changes are appended. */
const IMAGE_EDIT_BASE = `Edit this portrait as a realistic, optional facial presentation concept for the same adult person. Preserve their identity, age appearance, skin tone, unique features, facial bone structure, nose, eye shape, jaw geometry, face proportions and expression. Apply only requested low-risk, visually plausible changes: tasteful eyebrow grooming/fill if selected, natural hairstyle or facial-hair grooming if selected, realistic skin presentation improvements, natural smile presentation and clean consistent lighting. No dramatic reshaping, artificial symmetry, beauty filters, extra facial features, unrealistic skin, altered ethnicity or implied medical outcomes. Retain recognizable likeness and original camera framing. This is a concept visualization, not a prediction.`;

const STRICT_ADDENDUM = `STRICT MODE: the previous attempt drifted from the person's likeness. Make smaller changes. The result must be immediately recognisable as the same individual: identical face shape, eyes, nose, mouth, jaw, skin tone, age and expression. Only grooming, hair neatness and lighting may differ, subtly.`;

export function buildImageEditPrompt(input: ReportInput, options: { strict: boolean }): string {
  const lines = buildImageEditInstructions(input);
  const requested =
    lines.length > 0
      ? `Requested changes:\n${lines.map((line) => `- ${line}`).join("\n")}`
      : "Requested changes:\n- Only clean, even, flattering lighting. No other changes.";
  const always = `Always:\n- Keep the background, clothing, pose and framing.\n- Keep one person only; do not add accessories, makeup, jewellery or tattoos.\n- Photorealistic, no text or watermarks.`;
  return [IMAGE_EDIT_BASE, requested, always, options.strict ? STRICT_ADDENDUM : ""].filter(Boolean).join("\n\n");
}

export const VISION_INSTRUCTIONS = `You describe visible presentation cues in an adult's self-portrait for a grooming and self-care roadmap.
Rules:
- Describe only what is clearly visible: grooming, hair neatness and framing, visible skin texture or redness, how rested the eye area looks, brow neatness, facial-hair edges, lighting.
- Never diagnose (no acne grades, skin, dental, hair-loss or eye conditions), never estimate attractiveness, never score or rank, never infer ethnicity, health, personality or social value.
- Use neutral, kind, specific language. No defect labels.
- Give each observation a confidence: high only when lighting and resolution make it obvious.
- If something can't be judged from the photo, add a short line to cannotAssess instead of guessing.
- imageQuality.faceCount is the number of human faces visible.
- possibleMinor is true only if the person plausibly looks under 18; when unsure, prefer true.
- Only use areas from this list: skin, brows, eye_area, hair, facial_hair, smile, jaw_presentation.
Return JSON matching the schema exactly.`;

export const IDENTITY_QC_INSTRUCTIONS = `You compare an ORIGINAL portrait (first image) with an EDITED concept (second image) of the same adult.
Answer strictly:
- sameAdultPersonLikely: would a friend recognise the same person immediately?
- addedPeopleOrFeatures: are there extra people, faces, limbs, accessories, tattoos or text?
- brokenEyesOrTeeth: are eyes, teeth, ears or hands malformed, duplicated or distorted?
- excludedChanges: was bone structure, jaw or eye shape reshaped, skin tone or apparent ethnicity changed, age changed, or a heavy beauty filter applied?
- notes: one short sentence.
Return JSON matching the schema exactly.`;
