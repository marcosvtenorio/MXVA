import "server-only";
import { buildImageEditInstructions } from "@/features/report/planner";
import type { ReportInput } from "@/features/onboarding/schema";

/** Spec §7 base instruction, kept verbatim in spirit; requested changes are appended. */
const IMAGE_EDIT_BASE = `Edit this portrait into a realistic glow-up concept of the SAME adult: how they could look after about three months of committed, non-surgical self-improvement (haircut and grooming, skincare, sleep and, when listed below, fitness). Make it a clearly noticeable upgrade, the kind friends comment on, not a subtle retouch: apply each requested change confidently.
Identity is non-negotiable. Keep their facial bone structure, face width at the bones, jaw angle, chin, nose, eye shape and colour, ears, mouth shape, skin tone, apparent age and ethnicity, moles, scars, freckles and expression. No surgery-like reshaping, artificial symmetry, plastic or airbrushed skin, makeup or implied medical treatment. Keep the original camera framing. This is a concept visualisation, not a prediction.`;

const STRICT_ADDENDUM = `STRICT MODE: the previous attempt drifted from the person's likeness. Keep every requested change, but apply it to their exact face: identical bone structure, eyes, nose, mouth, ears, skin tone, age and expression. Where a change would alter who they are, make it smaller.`;

export function buildImageEditPrompt(input: ReportInput, options: { strict: boolean }): string {
  const lines = buildImageEditInstructions(input);
  const requested =
    lines.length > 0
      ? `Requested changes:\n${lines.map((line) => `- ${line}`).join("\n")}`
      : "Requested changes:\n- Neater grooming overall and a healthy, well-rested look.";
  const always = `Always:\n- Even, flattering soft light on the face with natural colour.\n- Keep the background, clothing (neat, same garment), pose and framing. Do not zoom, crop or move the camera: the head stays the same size and in the same place.\n- Keep one person only; do not add accessories, makeup, jewellery or tattoos.\n- Photorealistic, no text or watermarks.`;
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

export const IDENTITY_QC_INSTRUCTIONS = `You compare an ORIGINAL portrait (first image) with an EDITED glow-up concept (second image) of the same adult.
The concept is SUPPOSED to show a new haircut, groomed brows and facial hair, clearer skin, rested eyes, cleaner teeth, better lighting and possibly less facial fat (a leaner face). Those changes are allowed and must not count against it.
Answer strictly:
- sameAdultPersonLikely: would a friend recognise the same person immediately, despite the glow-up?
- addedPeopleOrFeatures: are there extra people, faces, limbs, accessories, jewellery, makeup, tattoos or text?
- brokenEyesOrTeeth: are eyes, teeth, ears or hands malformed, duplicated or distorted?
- excludedChanges: did bone-level structure change (face width at the cheekbones or jaw bones, chin projection, jaw angle), or the nose, eye shape, size or colour, ears or mouth shape; did skin tone or apparent ethnicity change; did apparent age change by more than a few years; is the skin plastic or airbrushed? Less fat under the chin or along the jaw is NOT an excluded change.
- notes: one short sentence.
Return JSON matching the schema exactly.`;
