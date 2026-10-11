import type {
  AvoidOption,
  Budget,
  DailyMinutes,
  FocusArea,
  Goal,
  StepId,
  Timeline,
} from "./schema";
import {
  BROW_PREFERENCES,
  EYE_PREFERENCES,
  FACIAL_HAIR_PREFERENCES,
  HAIR_PREFERENCES,
  JAW_PREFERENCES,
  SKIN_PREFERENCES,
  SMILE_PREFERENCES,
} from "./schema";

export type OptionCopy<T extends string> = { id: T; label: string; hint?: string };

export type StepDefinition = {
  id: StepId;
  /** 1-based position in the 16-step intake. */
  number: number;
  /** Canonical route (spec §3). */
  path: string;
  heading: string;
  description: string;
  /** Steps 06–11 are preferences the buyer may skip. */
  skippable: boolean;
};

export const TOTAL_STEPS = 16;

export const STEPS: readonly StepDefinition[] = [
  {
    id: "start",
    number: 1,
    path: "/start",
    heading: "Your face. A realistic next-step plan.",
    description:
      "Explore a personalized looksmaxxing roadmap and an AI concept portrait based on your own photos.",
    skippable: false,
  },
  {
    id: "goals",
    number: 2,
    path: "/onboarding/goals",
    heading: "What would you most like to work on?",
    description: "Pick one to start. You'll choose specific areas next.",
    skippable: false,
  },
  {
    id: "focus",
    number: 3,
    path: "/onboarding/focus",
    heading: "Which areas should your plan cover?",
    description: "Choose 1 to 4. Your plan puts these first.",
    skippable: false,
  },
  {
    id: "timeline",
    number: 4,
    path: "/onboarding/timeline",
    heading: "When do you want to see progress?",
    description: "This sets the pace of your plan. Some changes simply take longer.",
    skippable: false,
  },
  {
    id: "budget",
    number: 5,
    path: "/onboarding/budget",
    heading: "What are you happy to spend?",
    description: "Free options come first either way. Any currency.",
    skippable: false,
  },
  {
    id: "skin",
    number: 6,
    path: "/onboarding/skin",
    heading: "What do you want from your skin?",
    description: "About how skin looks day to day and in photos. We don't diagnose skin conditions.",
    skippable: true,
  },
  {
    id: "brows",
    number: 7,
    path: "/onboarding/brows",
    heading: "How about your brows?",
    description: "Pure preference. There's no right brow.",
    skippable: true,
  },
  {
    id: "eyes",
    number: 8,
    path: "/onboarding/eyes",
    heading: "Anything for the eye area?",
    description: "Your plan covers sleep, light and grooming. It won't promise a different eye shape.",
    skippable: true,
  },
  {
    id: "hair",
    number: 9,
    path: "/onboarding/hair",
    heading: "What about your hair?",
    description: "Cut, framing and routine. Facial hair only if it's relevant to you.",
    skippable: true,
  },
  {
    id: "smile",
    number: 10,
    path: "/onboarding/smile",
    heading: "And your smile?",
    description: "Everyday care and good questions for a dentist. We don't assess dental health.",
    skippable: true,
  },
  {
    id: "jaw",
    number: 11,
    path: "/onboarding/jaw",
    heading: "How do you want to present your jawline?",
    description:
      "Exercises don't reshape bone, so your plan sticks to what's realistic: grooming, framing and how you're photographed.",
    skippable: true,
  },
  {
    id: "constraints",
    number: 12,
    path: "/onboarding/constraints",
    heading: "What should your plan work around?",
    description: "Your time, and anything you'd rather avoid. No health questions.",
    skippable: false,
  },
  {
    id: "photo-guide",
    number: 13,
    path: "/onboarding/photo-guide",
    heading: "How to take your photos",
    description: "One front photo is required. Left and right profiles are optional.",
    skippable: false,
  },
  {
    id: "photos",
    number: 14,
    path: "/onboarding/photos",
    heading: "Add your photos",
    description:
      "Photos are used temporarily to create your report. They aren't saved in our photo database. External AI/email services handle data as explained in our Privacy Policy.",
    skippable: false,
  },
  {
    id: "delivery",
    number: 15,
    path: "/onboarding/delivery",
    heading: "Where should we send your report?",
    description: "Your PDF report arrives by email after payment. That email is your permanent copy.",
    skippable: false,
  },
  {
    id: "review",
    number: 16,
    path: "/onboarding/review",
    heading: "Check everything before checkout",
    description: "Nothing has been analysed yet. Your report is created only after payment.",
    skippable: false,
  },
] as const;

// ─── Option copy ───

export const GOAL_OPTIONS: readonly OptionCopy<Goal>[] = [
  { id: "clear_skin", label: "Clearer-looking skin" },
  { id: "brow_definition", label: "Defined brows" },
  { id: "smile", label: "A smile I'm happy with" },
  { id: "hair", label: "Hair that suits my face" },
  { id: "grooming", label: "Sharper grooming" },
  { id: "overall", label: "My overall look" },
];

export const FOCUS_OPTIONS: readonly OptionCopy<FocusArea>[] = [
  { id: "skin", label: "Skin" },
  { id: "brows", label: "Brows" },
  { id: "eye_area", label: "Eye area" },
  { id: "hair", label: "Hair" },
  { id: "facial_hair", label: "Facial hair" },
  { id: "smile", label: "Smile" },
  { id: "jaw_presentation", label: "Jawline presentation" },
];

/** The focus chip suggested by each primary goal (pre-selected, still editable). */
export const GOAL_TO_FOCUS: Record<Goal, readonly FocusArea[]> = {
  clear_skin: ["skin"],
  brow_definition: ["brows"],
  smile: ["smile"],
  hair: ["hair"],
  grooming: ["facial_hair", "brows"],
  overall: [],
};

export const TIMELINE_OPTIONS: readonly OptionCopy<Timeline>[] = [
  { id: "week", label: "This week", hint: "Quick wins only" },
  { id: "30d", label: "Within 30 days" },
  { id: "90d", label: "Within 90 days", hint: "Enough time for routines to show" },
  { id: "flexible", label: "I'm flexible" },
];

export const BUDGET_OPTIONS: readonly OptionCopy<Budget>[] = [
  { id: "none", label: "Nothing", hint: "Habits and technique only" },
  { id: "low", label: "A little", hint: "A few basics" },
  { id: "moderate", label: "Some", hint: "Products or a haircut" },
  { id: "flexible", label: "Flexible", hint: "Open to professional options" },
];

type PreferenceCopy = {
  skin: readonly OptionCopy<(typeof SKIN_PREFERENCES)[number]>[];
  brows: readonly OptionCopy<(typeof BROW_PREFERENCES)[number]>[];
  eyes: readonly OptionCopy<(typeof EYE_PREFERENCES)[number]>[];
  hair: readonly OptionCopy<(typeof HAIR_PREFERENCES)[number]>[];
  facialHair: readonly OptionCopy<(typeof FACIAL_HAIR_PREFERENCES)[number]>[];
  smile: readonly OptionCopy<(typeof SMILE_PREFERENCES)[number]>[];
  jaw: readonly OptionCopy<(typeof JAW_PREFERENCES)[number]>[];
};

export const PREFERENCE_OPTIONS: PreferenceCopy = {
  skin: [
    { id: "routine", label: "A simple routine I'll keep" },
    { id: "clarity", label: "A clearer look" },
    { id: "uneven_tone", label: "More even-looking tone" },
    { id: "under_eye", label: "Less tired-looking under-eyes" },
    { id: "none", label: "Nothing specific" },
  ],
  brows: [
    { id: "shape", label: "A cleaner shape" },
    { id: "grooming", label: "Neater, groomed look" },
    { id: "fuller", label: "A fuller look" },
    { id: "none", label: "Nothing specific" },
  ],
  eyes: [
    { id: "rested", label: "A more rested look" },
    { id: "grooming", label: "Tidier brows and lashes" },
    { id: "none", label: "Nothing specific" },
  ],
  hair: [
    { id: "cut", label: "A cut that suits my face" },
    { id: "volume", label: "More volume or texture" },
    { id: "hairline_framing", label: "Framing around the hairline" },
    { id: "routine", label: "An easy styling routine" },
    { id: "none", label: "Nothing specific" },
  ],
  facialHair: [
    { id: "shape", label: "A cleaner beard shape" },
    { id: "fuller", label: "A fuller-looking beard" },
    { id: "stubble", label: "Well-kept stubble" },
    { id: "clean_shaven", label: "A clean-shaven look" },
  ],
  smile: [
    { id: "hygiene", label: "Better daily care" },
    { id: "whitening_info", label: "Facts about whitening" },
    { id: "alignment_consult", label: "Whether to ask about alignment" },
    { id: "none", label: "Nothing specific" },
  ],
  jaw: [
    { id: "grooming", label: "Grooming that defines it" },
    { id: "framing", label: "Hair and framing choices" },
    { id: "photo_presentation", label: "Posture and photo angles" },
    { id: "none", label: "Nothing specific" },
  ],
};

export const SMILE_PROFESSIONAL_NOTE =
  "Your plan will include questions to bring to a dentist. We don't assess dental health or recommend treatments.";

export const DAILY_MINUTES_OPTIONS: readonly OptionCopy<DailyMinutes>[] = [
  { id: "5", label: "About 5 minutes a day" },
  { id: "15", label: "About 15 minutes a day" },
  { id: "30", label: "30 minutes or more" },
];

export const AVOID_OPTIONS_COPY: readonly OptionCopy<AvoidOption>[] = [
  { id: "fragrance", label: "Fragranced products" },
  { id: "strong_actives", label: "Strong actives, like acids" },
  { id: "animal_derived", label: "Animal-derived ingredients" },
  { id: "new_products", label: "Buying new products" },
  { id: "none", label: "None of these" },
];

export const CONSTRAINT_NOTE_HINT = "Optional. Please don't include health or medical details.";

export const PHOTO_REQUIREMENTS = [
  { title: "Face the camera at eye level", detail: "Hold the phone straight, about an arm's length away." },
  { title: "Soft, even light", detail: "Face a window. Avoid overhead light and strong shadows." },
  { title: "Just you, as you are", detail: "No filters or edits. Glasses off if you can, hair off your face." },
  { title: "A neutral expression", detail: "Relaxed face, mouth closed or a natural smile." },
] as const;

export const REFRESH_LOSS_NOTICE =
  "Your photos only live in this tab. Reloading or closing it clears them — your other answers stay.";
