import type { FocusArea, ReportInput } from "@/features/onboarding/schema";
import { FOCUS_OPTIONS } from "@/features/onboarding/steps";
import { BUDGET_ORDER, LIBRARY, type RecommendationTemplate } from "./library";
import { getSource, onlyRegisteredIds } from "./references";
import {
  SIMULATION_DISCLAIMER,
  paidReportSchema,
  type PaidReport,
  type PriorityRecommendation,
  type VisualObservations,
} from "./schema";

/**
 * RecommendationPlanner (spec §7). Deterministic ranking of curated templates using
 * documented factors — relevance to the buyer's goals, evidence, effort against their
 * time budget, cost against their budget — then scheduling into 7/30/90-day plans.
 */

export const MIN_RECOMMENDATIONS = 5;
export const MAX_RECOMMENDATIONS = 10;
const MAX_PER_AREA = 3;
const MAX_PROFESSIONAL = 2;

const GOAL_AREAS: Record<string, FocusArea[]> = {
  clear_skin: ["skin"],
  brow_definition: ["brows"],
  smile: ["smile"],
  hair: ["hair"],
  grooming: ["facial_hair", "brows", "hair"],
  overall: ["skin", "hair", "eye_area"],
};

const EVIDENCE_SCORE = { established: 2, limited: 1, styling_opinion: 0 } as const;

export type ScoredTemplate = { template: RecommendationTemplate; score: number };

function matchesPreference(template: RecommendationTemplate, input: ReportInput): boolean {
  return (template.matches ?? []).some(({ key, values }) =>
    (input.preferences[key] as readonly string[]).some((value) => values.includes(value)),
  );
}

export function scoreTemplate(template: RecommendationTemplate, input: ReportInput): number | undefined {
  const avoid = input.constraints.avoid;
  if (template.excludedBy?.some((option) => avoid.includes(option))) return undefined;
  if (template.minBudget && BUDGET_ORDER[input.budget] < BUDGET_ORDER[template.minBudget]) return undefined;
  if (template.area === "facial_hair" && input.preferences.facialHairRelevant === "no") return undefined;

  const goalAreas = input.goals.flatMap((goal) => GOAL_AREAS[goal] ?? []);
  const inFocus = input.focusAreas.includes(template.area);
  const preferred = matchesPreference(template, input);
  if (template.onlyIfAsked && !preferred) return undefined;
  if (!inFocus && !preferred && !goalAreas.includes(template.area)) return undefined;

  let score = 0;
  if (inFocus) score += 3;
  if (preferred) score += 2;
  if (goalAreas.includes(template.area)) score += 2;
  score += EVIDENCE_SCORE[template.evidenceLevel];
  score += template.impact;
  // The concept's most visible change leads the plan, so the buyer sees how to get there.
  if (template.id === "hair-cut-for-your-face" && input.hairChange) score += 6;

  // Effort against the buyer's daily time.
  if (template.effort === "low") score += 1.5;
  else if (template.effort === "medium") score += input.constraints.dailyMinutes === "5" ? -1 : 0.5;
  else score += input.constraints.dailyMinutes === "30" ? 0 : -1.5;

  // Cost against the buyer's budget (free first, always).
  const budget = BUDGET_ORDER[input.budget];
  const costPenalty = { free: 1, low: budget >= 1 ? 0.5 : -1.5, medium: budget >= 2 ? 0 : -2, professional: budget >= 2 ? -0.5 : -1.5 };
  score += costPenalty[template.costBand];

  // Timeline: quick wins for "this week", longer plays for 90 days.
  if (input.timeline === "week" && template.horizon === "now") score += 1;
  if (input.timeline === "90d" && (template.horizon === "90d" || template.horizon === "30d")) score += 0.5;

  return score;
}

export function selectTemplates(input: ReportInput): RecommendationTemplate[] {
  const scored = LIBRARY.map((template) => ({ template, score: scoreTemplate(template, input) }))
    .filter((entry): entry is ScoredTemplate => entry.score !== undefined)
    .sort((a, b) => b.score - a.score || a.template.id.localeCompare(b.template.id));

  const chosen: RecommendationTemplate[] = [];
  const perArea = new Map<FocusArea, number>();
  let professional = 0;

  const take = (template: RecommendationTemplate) => {
    const count = perArea.get(template.area) ?? 0;
    const isPro = template.horizon === "professional";
    const duplicate = chosen.some(
      (other) => other.id === template.alternativeTo || other.alternativeTo === template.id,
    );
    if (chosen.includes(template) || duplicate || count >= MAX_PER_AREA || (isPro && professional >= MAX_PROFESSIONAL)) {
      return false;
    }
    chosen.push(template);
    perArea.set(template.area, count + 1);
    if (isPro) professional++;
    return true;
  };

  // First, the best template for each chosen focus area, so every priority is covered.
  for (const area of input.focusAreas) {
    const best = scored.find((entry) => entry.template.area === area && entry.template.horizon !== "professional");
    if (best) take(best.template);
  }
  for (const entry of scored) {
    if (chosen.length >= MAX_RECOMMENDATIONS) break;
    take(entry.template);
  }
  // Top up with universally relevant basics if the buyer's answers were narrow.
  const basics = ["skin-daily-spf", "skin-shade-habits", "eyes-regular-sleep", "skin-gentle-cleanse", "jaw-camera-distance", "skin-hands-off"];
  for (const id of basics) {
    if (chosen.length >= MIN_RECOMMENDATIONS) break;
    const template = LIBRARY.find((entry) => entry.id === id);
    if (template && !template.excludedBy?.some((option) => input.constraints.avoid.includes(option))) take(template);
  }
  // The report lists priorities in rank order, whichever pass picked them.
  const scoreOf = new Map(scored.map((entry) => [entry.template.id, entry.score]));
  return chosen.slice(0, MAX_RECOMMENDATIONS).sort((a, b) => (scoreOf.get(b.id) ?? 0) - (scoreOf.get(a.id) ?? 0));
}

function observationFor(area: FocusArea, observations: VisualObservations): string {
  const match = observations.observations
    .filter((entry) => entry.area === area)
    .sort((a, b) => ["high", "medium", "low"].indexOf(a.confidence) - ["high", "medium", "low"].indexOf(b.confidence))[0];
  return match
    ? `${match.observation} (confidence: ${match.confidence})`
    : "Not assessed from your photo — this suggestion follows the goals you chose.";
}

const AREA_LABEL = Object.fromEntries(FOCUS_OPTIONS.map((option) => [option.id, option.label])) as Record<FocusArea, string>;

/** The hair advice points to the cut the concept shows, so a barber or stylist can do it. */
function withConceptHair(template: RecommendationTemplate, input: ReportInput): RecommendationTemplate {
  if (template.id !== "hair-cut-for-your-face" || !input.hairChange) return template;
  return {
    ...template,
    title: "Get the cut from your concept",
    suggestion:
      "Show your barber or stylist the after photo in your concept image and the hair advice in your consultation, and ask for that cut. Ask them for a two-minute way to style it each day.",
    plan: { ...template.plan, day30: "Get the cut from your concept: show your barber or stylist the after photo." },
    question: "Will the cut in my concept image suit my hair's texture and growth, and how often should I come back to keep it looking right?",
  };
}

export function planReport(
  input: ReportInput,
  observations: VisualObservations,
  options: {
    simulated: boolean;
    now?: Date;
    /** The consultant's written analysis (the model's answer to the owner's prompt). */
    consultation?: string;
    conceptLayout?: PaidReport["conceptLayout"];
  },
): PaidReport {
  const templates = selectTemplates(input).map((template) => withConceptHair(template, input));
  const recommendations: PriorityRecommendation[] = templates.map((template) => ({
    id: template.id,
    area: template.area,
    title: template.title,
    observation: observationFor(template.area, observations),
    suggestion: template.suggestion,
    reason: template.reason,
    evidenceLevel: template.evidenceLevel,
    effort: template.effort,
    costBand: template.costBand,
    horizon: template.horizon,
    uncertainty: template.uncertainty,
    sourceIds: onlyRegisteredIds(template.sourceIds),
  }));

  const sevenDayPlan = templates.flatMap((t) => (t.plan.day7 ? [t.plan.day7] : []));
  const thirtyDayPlan = templates.flatMap((t) => (t.plan.day30 ? [t.plan.day30] : []));
  const ninetyDayPlan = templates.flatMap((t) => (t.plan.day90 ? [t.plan.day90] : []));
  if (sevenDayPlan.length === 0) sevenDayPlan.push("Pick the first suggestion above and do it every day this week.");
  if (thirtyDayPlan.length === 0) thirtyDayPlan.push("Keep this week's habits going and take a comparison photo in the same light at day 30.");
  if (ninetyDayPlan.length === 0) ninetyDayPlan.push("Take a comparison photo in the same light and decide what to keep, change or drop.");
  thirtyDayPlan.push("Take a comparison photo in the same spot and light as your original.");

  const professionalQuestions = templates.flatMap((t) => (t.question ? [t.question] : []));
  const sourceIds = [...new Set(recommendations.flatMap((r) => r.sourceIds))];

  const report: PaidReport = {
    title: "Your appearance roadmap",
    createdAt: (options.now ?? new Date()).toISOString(),
    disclaimer: SIMULATION_DISCLAIMER,
    // The areas the plan covers (chosen from the photo, not by the buyer).
    goalsSummary: input.focusAreas.map((area) => AREA_LABEL[area]),
    observations: observations.observations.filter((entry) => input.focusAreas.includes(entry.area)),
    cannotAssess: observations.cannotAssess.slice(0, 10),
    recommendations,
    sevenDayPlan,
    thirtyDayPlan,
    ninetyDayPlan,
    professionalQuestions: professionalQuestions.length > 0 ? professionalQuestions : undefined,
    budgetNote:
      "Cost guide: free = no purchase, low = a basic product, medium = a service such as a haircut, professional = a consultation. Prices vary by country.",
    usedSources: sourceIds.map((id) => {
      const source = getSource(id);
      return {
        id,
        title: source.title,
        publisher: source.publisher,
        url: source.url,
        dateLabel: source.dateLabel,
        limitations: source.limitations,
        accessedAt: source.accessedAt,
      };
    }),
    consultation: options.consultation ?? "",
    conceptLayout: options.conceptLayout ?? "portrait",
    simulated: options.simulated,
  };
  return paidReportSchema.parse(report);
}
