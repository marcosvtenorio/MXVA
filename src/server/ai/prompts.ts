import "server-only";

/**
 * The owner's glow-up prompt, sent exactly as written with the buyer's front photo. Do not edit it:
 * the model reads the photo, writes its consultation and draws the annotated before and after.
 */
export const OWNER_PROMPT = `Analyze my appearance from the attached photo like an aesthetic/beauty consultant. Identify the highest-impact changes that could make me look more polished and harmonious, including hair cut/style/color, brows, eye makeup, skin/makeup placement, lips, and overall facial balance. Be specific to my actual features rather than giving generic advice.

Then generate a realistic “after” version of this exact photo showing your recommended glow-up. Keep me recognizably the same person and preserve my facial anatomy unless you specifically recommend a subtle structural change. Keep the same pose, camera angle, expression, lighting, clothing, and background as much as possible.

Make the changes refined and realistic, not an exaggerated beauty filter. Prioritize high-impact, low-risk styling changes. Do not automatically make my face thinner, nose smaller, lips bigger, eyes larger, or skin unrealistically perfect.

For the hair, choose the cut, color, part, volume, and face-framing that best complement my individual proportions. For makeup, optimize brow shape, eyeliner/lashes, blush/contour placement, lip definition, and complexion while keeping it natural.

Generate a before/after comparison with photo annotations explaining every change, similar to a professional beauty consultation.`;

export const VISION_INSTRUCTIONS = `You describe visible presentation cues in an adult's self-portrait for a grooming and self-care roadmap.
Rules:
- Describe only what is clearly visible: grooming, hair neatness and framing, visible skin texture or redness, how rested the eye area looks, brow neatness, facial-hair edges, lighting.
- Never diagnose (no acne grades, skin, dental, hair-loss or eye conditions), never estimate attractiveness, never score or rank, never infer ethnicity, health, personality or social value.
- Use neutral, kind, specific language. No defect labels.
- Give each observation a confidence: high only when lighting and resolution make it obvious.
- Keep each observation to one or two short, complete sentences (under 200 characters). Never stop mid-sentence.
- If something can't be judged from the photo, add a short line to cannotAssess instead of guessing.
- imageQuality.faceCount is the number of human faces visible.
- possibleMinor is true only if the person clearly looks like a child or a young teenager. A young-looking adult (someone who could be 18 to 25) is NOT a minor: the buyer has confirmed they are 18 or older. Do not guess from youthful skin, a slim face or a lack of facial hair alone.
- Only use areas from this list: skin, brows, eye_area, hair, facial_hair, smile, jaw_presentation.
- Cover every area you can see, not only the focus list.
glowUp: decide, objectively and from the photo alone, what would most upgrade this person's look (they want the full glow-up):
- facialHair: sharpen_lines (beard or stubble that grows evenly: crisp lines), even_stubble (patchy growth: keep it short and even), clean_shave (it looks better without), stay_clean_shaven (no facial hair now and it suits them).
- skin: blemishes, redness, unevenTone, shine: true only when clearly visible.
- browsNeedGrooming: strays, a unibrow area or an untidy shape are visible.
- eyesLookTired: dark circles or puffiness are visible.
- teethVisible: teeth show in the photo.
- jawSoftTissue: how much soft-tissue fullness shows under the chin and along the jaw: defined, some_fullness, notable_fullness. Describe soft tissue only; never comment on weight or health.
Return JSON matching the schema exactly.`;

export const IDENTITY_QC_INSTRUCTIONS = `You compare an ORIGINAL portrait (first image) with a GLOW-UP concept made from it (second image).
The concept may be a single "after" photo, or a before/after comparison with annotations, labels, arrows or close-up crops, like a professional beauty consultation. In a comparison, judge the AFTER version and check that its BEFORE version still shows the same person; the layout, annotation text and crops are expected.
The glow-up is SUPPOSED to change styling: haircut, style and hair colour, brows, facial hair, skin and complexion, the eye area and natural makeup. Those changes are allowed and must not count against it. Makeup such as liner, lashes or brow fill does not change eye shape or size; lip colour or liner does not change lip shape.
Answer strictly:
- comparison: is the second image a before/after comparison (two or more versions of the person) rather than a single photo?
- sameAdultPersonLikely: would a friend recognise the same person immediately in the after version, despite the glow-up?
- addedPeopleOrFeatures: are there other people or faces (beyond the versions of this person), extra limbs, accessories, jewellery, piercings or tattoos?
- brokenEyesOrTeeth: are eyes, teeth, ears or hands malformed, duplicated within one face, or distorted?
- excludedChanges: in the after version, is the face clearly thinner or narrower, or did bone-level structure change (face width at the cheekbones or jaw, chin projection, jaw angle); is the nose smaller, are the eyes larger or a different shape or colour, are the lips bigger, did the ears change; did skin tone or apparent ethnicity change; did apparent age change by more than a few years; is the skin plastic or airbrushed?
- notes: one short sentence.
Return JSON matching the schema exactly.`;
