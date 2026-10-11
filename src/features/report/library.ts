import type { AvoidOption, Budget, FocusArea, Preferences } from "@/features/onboarding/schema";
import type { PriorityRecommendation } from "./schema";

/**
 * Curated recommendation templates. The planner only chooses, ranks and schedules
 * these; it never invents new advice or sources. Every sourceId must exist in
 * src/data/evidence-sources.json (enforced by tests).
 *
 * House rules: no medications or supplements, no diets or extreme exercise, no
 * procedures, no claims of bone or eye-shape change, no attractiveness language.
 */

type PreferenceKey = Exclude<keyof Preferences, "facialHairRelevant">;

export type RecommendationTemplate = Omit<PriorityRecommendation, "observation" | "id"> & {
  id: string;
  /** Preference answers that make this template especially relevant. */
  matches?: { key: PreferenceKey; values: readonly string[] }[];
  /** "Avoid" answers that rule this template out. */
  excludedBy?: readonly AvoidOption[];
  /** Below this budget the template is skipped. */
  minBudget?: Budget;
  /** Lines for the 7/30/90-day schedule. */
  plan: { day7?: string; day30?: string; day90?: string };
  /** A question to take to a professional, when this template is chosen. */
  question?: string;
  /** Expected impact for the stated goal, 1 (small) to 3 (large). Breaks ties sensibly. */
  impact: 1 | 2 | 3;
  /** Never shown together with this template (it's the same advice in another form). */
  alternativeTo?: string;
};

export const BUDGET_ORDER: Record<Budget, number> = { none: 0, low: 1, moderate: 2, flexible: 3 };

export const LIBRARY: readonly RecommendationTemplate[] = [
  // ─── Skin ───
  {
    id: "skin-daily-spf",
    impact: 3,
    area: "skin",
    title: "Daily broad-spectrum SPF 30+",
    suggestion:
      "Apply a broad-spectrum SPF 30+ to your face every morning, and reapply every two hours when you're outside or after sweating. A hat and shade count too.",
    reason:
      "In a 4.5-year randomised trial, adults who used sunscreen daily showed 24% less skin ageing than those who used it when they chose to. Dermatologists recommend SPF 30 or higher.",
    evidenceLevel: "established",
    effort: "low",
    costBand: "low",
    horizon: "now",
    uncertainty: "Visible change is slow: this protects how your skin looks over years more than weeks.",
    sourceIds: ["hughes-2013-sunscreen-aging", "aad-sunscreen-application"],
    matches: [{ key: "skin", values: ["routine", "clarity", "uneven_tone"] }],
    excludedBy: ["new_products"],
    plan: {
      day7: "Start daily SPF 30+ each morning (face, ears, neck).",
      day30: "Keep SPF daily; reapply when outdoors for more than two hours.",
      day90: "SPF is now automatic — keep a spare in your bag.",
    },
  },
  {
    id: "skin-shade-habits",
    impact: 2,
    alternativeTo: "skin-daily-spf",
    area: "skin",
    title: "Sun-smart habits without new products",
    suggestion:
      "Use shade, a brimmed hat and covering clothing when the sun is strong. If you later add one product, make it a broad-spectrum SPF 30+.",
    reason: "Dermatologists pair sunscreen with shade and clothing as everyday sun protection.",
    evidenceLevel: "established",
    effort: "low",
    costBand: "free",
    horizon: "now",
    uncertainty: "Protective rather than corrective; benefits build over time.",
    sourceIds: ["aad-sunscreen-application"],
    matches: [{ key: "skin", values: ["routine", "clarity", "uneven_tone"] }],
    plan: { day7: "Wear a hat or keep to shade at midday outdoors." },
  },
  {
    id: "skin-gentle-cleanse",
    impact: 2,
    area: "skin",
    title: "Gentle cleansing, twice a day",
    suggestion:
      "Wash with lukewarm water and a gentle cleanser, morning and night and after heavy sweating. Use your fingertips; skip scrubs and harsh toners.",
    reason:
      "Dermatology guidance: wash up to twice a day and after sweating, gently, because scrubbing and harsh products irritate skin.",
    evidenceLevel: "established",
    effort: "low",
    costBand: "low",
    horizon: "now",
    uncertainty: "If your skin feels tight or irritated, wash less often and simplify further.",
    sourceIds: ["aad-face-washing", "aad-acne-tips"],
    matches: [{ key: "skin", values: ["routine", "clarity"] }],
    plan: {
      day7: "Switch to gentle twice-daily cleansing with lukewarm water.",
      day30: "Note how your skin feels after a month; simplify if anything stings.",
    },
  },
  {
    id: "skin-fragrance-free-moisturiser",
    impact: 2,
    area: "skin",
    title: "Fragrance-free moisturiser after washing",
    suggestion:
      "Apply a fragrance-free moisturiser while skin is still slightly damp, after washing and after shaving.",
    reason: "Dermatologists recommend fragrance-free moisturiser on damp skin to reduce dryness and irritation.",
    evidenceLevel: "established",
    effort: "low",
    costBand: "low",
    horizon: "now",
    uncertainty: "Helps comfort and a smoother look; it won't change skin type or tone.",
    sourceIds: ["aad-dry-skin"],
    matches: [{ key: "skin", values: ["routine", "clarity", "uneven_tone"] }],
    excludedBy: ["new_products"],
    plan: { day7: "Add a fragrance-free moisturiser after washing.", day30: "Moisturise after every shave too." },
  },
  {
    id: "skin-hands-off",
    impact: 1,
    area: "skin",
    title: "Hands off spots",
    suggestion: "Don't pick, squeeze or pop spots. Keep hair and hands off your face where you can.",
    reason: "Picking slows healing and raises the risk of marks, according to dermatology guidance.",
    evidenceLevel: "established",
    effort: "low",
    costBand: "free",
    horizon: "now",
    uncertainty: "A habit change; its effect depends on how often spots appear for you.",
    sourceIds: ["aad-acne-tips"],
    matches: [{ key: "skin", values: ["clarity"] }],
    plan: { day7: "Notice when you touch your face; keep hands off spots." },
  },
  {
    id: "skin-dermatologist",
    impact: 1,
    area: "skin",
    title: "Optional: a dermatologist's view",
    suggestion:
      "If breakouts, redness or uneven tone keep bothering you, consider consulting a board-certified dermatologist.",
    reason: "Only an in-person assessment can tell what's behind a skin concern; photos can't.",
    evidenceLevel: "established",
    effort: "medium",
    costBand: "professional",
    horizon: "professional",
    uncertainty: "MXVA can't tell from a photo whether this is needed — it's your call.",
    sourceIds: ["aad-acne-tips"],
    matches: [{ key: "skin", values: ["clarity", "uneven_tone"] }],
    minBudget: "moderate",
    plan: { day90: "If skin concerns persist after 90 days of basics, book a dermatologist." },
    question: "What do you think is behind the breakouts or uneven tone I notice, and what would you suggest first?",
  },

  // ─── Eye area ───
  {
    id: "eyes-regular-sleep",
    impact: 3,
    area: "eye_area",
    title: "A regular sleep window",
    suggestion:
      "Go to bed and get up at similar times every day, including days off. Screens off an hour before bed; keep the room dark, quiet and cool.",
    reason:
      "In lab studies, people photographed after sleep loss were rated as looking more tired. NHS sleep guidance favours a regular routine and a calm, dark bedroom.",
    evidenceLevel: "limited",
    effort: "medium",
    costBand: "free",
    horizon: "30d",
    uncertainty: "The studies were small and short-term; under-eye appearance also depends on genetics and anatomy.",
    sourceIds: ["axelsson-2010-sleep", "sundelin-2017-sleep", "nhs-sleep-tips"],
    matches: [
      { key: "eyes", values: ["rested"] },
      { key: "skin", values: ["under_eye"] },
    ],
    plan: {
      day7: "Pick a fixed wake-up time and keep it for 7 days.",
      day30: "Hold the same sleep window, including weekends.",
      day90: "Review: do you feel and look more rested in morning photos?",
    },
  },
  {
    id: "eyes-brow-lash-tidy",
    impact: 1,
    area: "eye_area",
    title: "Tidy brows and lashes",
    suggestion: "Brush brows into place each morning and remove only obvious strays below the brow line.",
    reason: "A neat brow frames the eyes. This is a styling choice, not a scientific finding.",
    evidenceLevel: "styling_opinion",
    effort: "low",
    costBand: "free",
    horizon: "now",
    uncertainty: "Purely aesthetic preference.",
    sourceIds: [],
    matches: [{ key: "eyes", values: ["grooming"] }],
    plan: { day7: "Brush brows into place each morning (30 seconds)." },
  },

  // ─── Brows ───
  {
    id: "brows-clean-strays",
    impact: 3,
    area: "brows",
    title: "Clean up strays, keep your natural shape",
    suggestion:
      "Tweeze only the clear strays between and under the brows, in good daylight, a few at a time. Don't thin the top line or change the arch.",
    reason: "Keeping the natural shape avoids over-plucking, which can take months to grow back. Styling guidance.",
    evidenceLevel: "styling_opinion",
    effort: "low",
    costBand: "free",
    horizon: "now",
    uncertainty: "Results depend on your natural brow density.",
    sourceIds: [],
    matches: [{ key: "brows", values: ["shape", "grooming"] }],
    plan: { day7: "One careful stray clean-up in daylight.", day30: "Repeat lightly every 2–3 weeks." },
  },
  {
    id: "brows-brush-and-set",
    impact: 2,
    area: "brows",
    title: "Brush up and set",
    suggestion: "Brush brows upward and outward, then set them with a small amount of clear brow gel.",
    reason: "Setting brows makes them look fuller and more defined without changing them. Styling guidance.",
    evidenceLevel: "styling_opinion",
    effort: "low",
    costBand: "low",
    horizon: "now",
    uncertainty: "A grooming effect that lasts the day.",
    sourceIds: [],
    matches: [{ key: "brows", values: ["fuller", "grooming"] }],
    excludedBy: ["new_products"],
    plan: { day7: "Try clear brow gel for a week of mornings." },
  },
  {
    id: "brows-professional-shape",
    impact: 2,
    area: "brows",
    title: "One professional shaping",
    suggestion: "Book one shaping (threading or waxing) with a brow specialist, then maintain the line yourself.",
    reason: "A professional sets a clean baseline that's easy to keep. Styling guidance.",
    evidenceLevel: "styling_opinion",
    effort: "low",
    costBand: "medium",
    horizon: "30d",
    uncertainty: "Ask for a natural result; you can always take more off later, not put it back.",
    sourceIds: [],
    matches: [{ key: "brows", values: ["shape"] }],
    minBudget: "moderate",
    plan: { day30: "Book one natural brow shaping, then maintain at home." },
    question: "Can you keep my natural shape and just clean the line?",
  },

  // ─── Hair ───
  {
    id: "hair-cut-for-your-face",
    impact: 3,
    area: "hair",
    title: "A cut chosen for your face and hair type",
    suggestion:
      "Bring 2–3 reference photos of people with similar hair texture to a barber or stylist, and ask what will suit your face shape and how long it takes to style.",
    reason: "A cut matched to your hair type is easier to keep looking good. Styling guidance.",
    evidenceLevel: "styling_opinion",
    effort: "medium",
    costBand: "medium",
    horizon: "30d",
    uncertainty: "Taste and hair texture vary; expect one or two visits to get it right.",
    sourceIds: [],
    matches: [{ key: "hair", values: ["cut", "hairline_framing"] }],
    minBudget: "low",
    plan: { day30: "Get one cut with reference photos; ask for a 2-minute styling method." },
    question: "Given my hair texture and how much time I'll spend, what cut and length would you suggest?",
  },
  {
    id: "hair-care-basics",
    impact: 2,
    area: "hair",
    title: "Hair-care basics for your hair type",
    suggestion:
      "Shampoo the scalp as often as your hair needs, condition after each wash, towel-dry by patting, and use low or medium heat with a heat protectant.",
    reason: "Dermatologists recommend products for your hair type, conditioning, gentle drying and limiting heat.",
    evidenceLevel: "established",
    effort: "low",
    costBand: "low",
    horizon: "now",
    uncertainty: "Improves condition and manageability; it doesn't change density.",
    sourceIds: ["aad-healthy-hair"],
    matches: [{ key: "hair", values: ["volume", "routine"] }],
    plan: { day7: "Condition after every wash; pat dry instead of rubbing." },
  },
  {
    id: "hair-two-minute-style",
    impact: 2,
    area: "hair",
    title: "A two-minute styling routine",
    suggestion:
      "Towel-dry, add a pea-sized amount of a light product, and blow-dry on medium heat in the direction you want the hair to sit.",
    reason: "A short, repeatable routine keeps hair consistent day to day. Styling guidance, with heat limits from dermatology advice.",
    evidenceLevel: "styling_opinion",
    effort: "low",
    costBand: "low",
    horizon: "now",
    uncertainty: "Product choice depends on texture; expect some trial and error.",
    sourceIds: ["aad-healthy-hair"],
    matches: [{ key: "hair", values: ["routine", "volume"] }],
    excludedBy: ["new_products"],
    plan: { day7: "Practise one 2-minute styling routine daily." },
  },
  {
    id: "hair-hairline-dermatologist",
    impact: 1,
    area: "hair",
    title: "Optional: ask a dermatologist about your hairline",
    suggestion:
      "If you've noticed hair thinning or a changing hairline, consider consulting a board-certified dermatologist before buying any product.",
    reason: "Dermatologists stress that effective hair-loss care starts with finding the cause.",
    evidenceLevel: "established",
    effort: "medium",
    costBand: "professional",
    horizon: "professional",
    uncertainty: "MXVA can't judge hair loss from photos.",
    sourceIds: ["aad-hair-loss-diagnosis"],
    matches: [{ key: "hair", values: ["hairline_framing"] }],
    plan: { day90: "If your hairline worries you, book a dermatologist appointment." },
    question: "Is what I'm noticing in my hairline normal for my age, and what are my options if not?",
  },

  // ─── Facial hair ───
  {
    id: "beard-clean-lines",
    impact: 3,
    area: "facial_hair",
    title: "Clean neckline and cheek line",
    suggestion:
      "Set your neckline about two fingers above the Adam's apple and keep the cheek line natural, just tidied. Trim every few days.",
    reason: "Clear edges make any beard length look intentional. Barbering guidance.",
    evidenceLevel: "styling_opinion",
    effort: "low",
    costBand: "low",
    horizon: "now",
    uncertainty: "Line height is a preference; adjust to your face and beard growth.",
    sourceIds: [],
    matches: [{ key: "facialHair", values: ["shape", "fuller", "stubble"] }],
    plan: { day7: "Define your neckline and cheek line once, then keep them every 3–4 days." },
  },
  {
    id: "shave-technique",
    impact: 2,
    area: "facial_hair",
    title: "A gentler shave",
    suggestion:
      "Shave after a warm shower, use shaving cream or gel, shave in the direction of growth, rinse the blade after each stroke, and replace it every 5–7 shaves.",
    reason: "This is the dermatology-recommended technique to reduce razor bumps and irritation.",
    evidenceLevel: "established",
    effort: "low",
    costBand: "low",
    horizon: "now",
    uncertainty: "Persistent bumps may need a dermatologist's advice.",
    sourceIds: ["aad-how-to-shave"],
    matches: [{ key: "facialHair", values: ["clean_shaven", "stubble"] }],
    plan: { day7: "Switch to shaving with the grain, after a shower, with a fresh blade." },
  },
  {
    id: "beard-grow-out",
    impact: 2,
    area: "facial_hair",
    title: "Give a fuller beard time",
    suggestion:
      "Let it grow for 4–6 weeks before judging, trimming only the lines. Then even out the length with a guard.",
    reason: "Growth is uneven early on, and many beards fill in with length. Barbering guidance.",
    evidenceLevel: "styling_opinion",
    effort: "low",
    costBand: "free",
    horizon: "90d",
    uncertainty: "Beard density is largely genetic; length and shape can only change how it reads.",
    sourceIds: [],
    matches: [{ key: "facialHair", values: ["fuller"] }],
    plan: { day30: "Keep growing; trim lines only.", day90: "Even out the length with a guard and reassess." },
  },

  // ─── Smile ───
  {
    id: "smile-daily-care",
    impact: 3,
    area: "smile",
    title: "Brush twice, clean between once",
    suggestion:
      "Brush twice a day with a soft brush and fluoride toothpaste, clean between your teeth once a day, and replace your brush every 3–4 months.",
    reason: "This is the American Dental Association's daily-care guidance.",
    evidenceLevel: "established",
    effort: "low",
    costBand: "low",
    horizon: "now",
    uncertainty: "Supports oral health; regular dental check-ups are still needed.",
    sourceIds: ["ada-brushing", "ada-flossing"],
    matches: [{ key: "smile", values: ["hygiene", "whitening_info"] }],
    plan: { day7: "Brush twice daily and floss once daily — every day this week.", day30: "Keep it up; replace your brush if bristles fray." },
  },
  {
    id: "smile-whitening-facts",
    impact: 2,
    area: "smile",
    title: "Whitening: ask a dentist first",
    suggestion:
      "Talk to a dentist before whitening. Whitening only lightens natural teeth (not crowns or fillings), sensitivity is common, and strong products should come from dental professionals.",
    reason: "ADA and NHS guidance: whitening doesn't suit every kind of discolouration, and unregulated kits can harm teeth and gums.",
    evidenceLevel: "established",
    effort: "medium",
    costBand: "professional",
    horizon: "professional",
    uncertainty: "MXVA can't see why teeth look the colour they do; a dentist can.",
    sourceIds: ["ada-whitening", "nhs-teeth-whitening"],
    matches: [{ key: "smile", values: ["whitening_info"] }],
    plan: { day30: "Ask your dentist whether whitening suits your teeth and which method." },
    question: "Would whitening work for the kind of discolouration I have, and which method would you recommend?",
  },
  {
    id: "smile-alignment-consult",
    impact: 1,
    area: "smile",
    title: "Optional: an alignment conversation",
    suggestion:
      "If alignment bothers you, consider asking a dentist or orthodontist for an assessment. Bring your questions; there's no obligation to start treatment.",
    reason: "Only a dental professional can assess bite and alignment.",
    evidenceLevel: "styling_opinion",
    effort: "medium",
    costBand: "professional",
    horizon: "professional",
    uncertainty: "MXVA doesn't assess teeth or recommend treatment.",
    sourceIds: [],
    matches: [{ key: "smile", values: ["alignment_consult"] }],
    plan: { day90: "If you want to, book an alignment assessment." },
    question: "Is my alignment worth treating, what would the options involve, and what would it cost?",
  },

  // ─── Jaw / lower face presentation ───
  {
    id: "jaw-beard-definition",
    impact: 2,
    area: "jaw_presentation",
    title: "Use grooming lines to frame the jaw",
    suggestion:
      "If you have facial hair, a clean neckline and slightly fuller length along the jaw sharpen how the lower face reads. Clean-shaven: keep the neckline tidy.",
    reason: "Grooming changes edges and contrast, not bone. Barbering guidance.",
    evidenceLevel: "styling_opinion",
    effort: "low",
    costBand: "low",
    horizon: "now",
    uncertainty: "A presentation effect only.",
    sourceIds: [],
    matches: [{ key: "jaw", values: ["grooming"] }],
    plan: { day7: "Try a defined neckline for a week and compare photos." },
  },
  {
    id: "jaw-camera-distance",
    impact: 3,
    area: "jaw_presentation",
    title: "Take photos from further away",
    suggestion:
      "For photos, stand about 1.5 m from the camera, use 2× zoom instead of the wide lens, and keep the camera at eye level or slightly above.",
    reason: "Close-range selfies exaggerate central features like the nose; distance reduces this perspective distortion.",
    evidenceLevel: "limited",
    effort: "low",
    costBand: "free",
    horizon: "now",
    uncertainty: "Based on a camera-geometry model, not on how people judge faces.",
    sourceIds: ["ward-2018-selfie-distortion"],
    matches: [{ key: "jaw", values: ["photo_presentation", "framing"] }],
    plan: { day7: "Retake your profile photo from 1.5 m with 2× zoom, in window light." },
  },
  {
    id: "jaw-no-bone-hacks",
    impact: 1,
    area: "jaw_presentation",
    title: "Skip jaw 'reshaping' exercises",
    suggestion:
      "Spend the time on grooming, posture and photo angles instead of exercises sold as changing your jawline.",
    reason:
      "We found no good evidence that exercises reshape facial bone. The facial-exercise research we found is a small pilot about cheek fullness in middle-aged women.",
    evidenceLevel: "limited",
    effort: "low",
    costBand: "free",
    horizon: "now",
    uncertainty: "Absence of good evidence; no study we know of shows bone change from exercise in adults.",
    sourceIds: ["alam-2018-facial-exercise"],
    matches: [{ key: "jaw", values: ["grooming", "framing", "photo_presentation"] }],
    plan: {},
  },
];

/** The edits each preference may request in the concept image (never bone, eye shape or skin tone). */
export const IMAGE_EDIT_LINES: { when: (prefs: Preferences, focus: readonly FocusArea[]) => boolean; line: string; summary: string }[] = [
  {
    when: (p, f) => f.includes("brows") || p.brows.some((v) => v !== "none"),
    line: "Tidy the eyebrows: remove obvious strays and lightly define the existing natural shape. Do not change brow position or arch height noticeably.",
    summary: "Brows tidied and lightly defined, natural shape kept",
  },
  {
    when: (p, f) => f.includes("hair") || p.hair.some((v) => v !== "none"),
    line: "Neaten the hairstyle into a clean, current cut that suits the existing hair texture and hairline. Keep the hair colour and hairline position.",
    summary: "Hair neatened into a clean cut, same colour and hairline",
  },
  {
    when: (p, f) => f.includes("facial_hair") || p.facialHair.length > 0,
    line: "Groom existing facial hair: clean neckline and cheek lines, even length. Do not add facial hair that isn't there; do not remove it unless the person wants a clean-shaven look.",
    summary: "Facial hair edges cleaned and evened",
  },
  {
    when: (p, f) => f.includes("skin") || p.skin.some((v) => v !== "none"),
    line: "Present the skin as healthy and even in tone with natural texture, pores and features kept. No smoothing filter, no change of skin tone.",
    summary: "Even, natural-looking skin with texture kept and the same skin tone",
  },
  {
    when: (p, f) => f.includes("eye_area") || p.eyes.includes("rested") || p.skin.includes("under_eye"),
    line: "Make the eye area look rested (as after a good night's sleep). Do not change eye shape, size, colour or eyelids.",
    summary: "A more rested-looking eye area, eye shape unchanged",
  },
  {
    when: (p, f) => f.includes("smile") || p.smile.some((v) => v !== "none"),
    line: "If the person is smiling, keep the same teeth and smile; at most a very slight, natural brightening. Do not straighten or replace teeth.",
    summary: "Smile kept as is, at most a natural slight brightening",
  },
];
