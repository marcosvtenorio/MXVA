import "server-only";

/**
 * What a report cost at OpenAI: the tokens each response reports, times the list price.
 * Prices are USD per 1M tokens, standard tier, from developers.openai.com/api/docs/pricing
 * (checked 2026-10-16). Inputs here are a few thousand tokens, far below the 272K
 * long-context threshold, so the short-context rates apply.
 */

type TextPrice = { input: number; cachedInput?: number; output: number };
type ImagePrice = { textInput: number; textCached: number; imageInput: number; imageCached: number; imageOutput: number; textOutput?: number };

export const PRICES_CHECKED_ON = "2026-10-16";

const TEXT_PRICES: Record<string, TextPrice> = {
  "gpt-6-astra": { input: 10, cachedInput: 1, output: 50 },
  "gpt-6.1-sol": { input: 2, cachedInput: 0.1, output: 10 },
  "gpt-6-sol": { input: 2, cachedInput: 0.2, output: 10 },
  "gpt-6-luna": { input: 0.1, cachedInput: 0.01, output: 0.5 },
  "gpt-5.6-sol": { input: 4, cachedInput: 0.4, output: 20 },
  "gpt-5.6-terra": { input: 2, cachedInput: 0.2, output: 12 },
  "gpt-5.6-luna": { input: 0.2, cachedInput: 0.02, output: 1.2 },
  "gpt-5.5": { input: 5, cachedInput: 0.5, output: 30 },
  "gpt-5.5-pro": { input: 30, output: 180 },
  "gpt-5.4": { input: 2.5, cachedInput: 0.25, output: 15 },
  "gpt-5.4-pro": { input: 30, output: 180 },
  "gpt-5.4-mini": { input: 0.75, cachedInput: 0.075, output: 4.5 },
  "gpt-5.4-nano": { input: 0.2, cachedInput: 0.02, output: 1.25 },
  "gpt-5.2": { input: 1.75, cachedInput: 0.175, output: 14 },
  "gpt-5.1": { input: 1.25, cachedInput: 0.125, output: 10 },
  "gpt-5": { input: 1.25, cachedInput: 0.125, output: 10 },
  "gpt-5-mini": { input: 0.25, cachedInput: 0.025, output: 2 },
};

const IMAGE_PRICES: Record<string, ImagePrice> = {
  "gpt-image-2.5-sunburst": { textInput: 5, textCached: 1.25, imageInput: 8, imageCached: 2, imageOutput: 30 },
  "gpt-image-2.5-flare": { textInput: 5, textCached: 1.25, imageInput: 8, imageCached: 2, imageOutput: 30 },
  "gpt-image-2": { textInput: 5, textCached: 1.25, imageInput: 8, imageCached: 2, imageOutput: 30 },
  "gpt-image-1.5": { textInput: 5, textCached: 1.25, imageInput: 8, imageCached: 2, imageOutput: 32, textOutput: 10 },
  "gpt-image-1": { textInput: 5, textCached: 1.25, imageInput: 10, imageCached: 2.5, imageOutput: 40 },
  "gpt-image-1-mini": { textInput: 2, textCached: 0.2, imageInput: 2.5, imageCached: 0.25, imageOutput: 8 },
};

/** "gpt-5.5-2026-04-23" is priced as "gpt-5.5". */
function baseModel(model: string): string {
  return model.replace(/-\d{4}-\d{2}-\d{2}$/, "");
}

/** The `usage` of a Responses API response (the main model's tokens). */
export type TextUsage = {
  input_tokens: number;
  input_tokens_details?: { cached_tokens?: number } | null;
  output_tokens: number;
};

/** `tool_usage.image_gen` of a Responses API response: the image tool's own tokens. */
export type ImageToolUsage = {
  input_tokens_details?: { image_tokens?: number; text_tokens?: number } | null;
  output_tokens_details?: { image_tokens?: number; text_tokens?: number } | null;
};

export type CostLine = {
  /** What the call was for, in the owner's language ("análise da foto"). */
  step: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  /** Null when the model isn't in the price table. */
  usd: number | null;
};

const perToken = (pricePerMillion: number) => pricePerMillion / 1_000_000;

export function textCost(model: string, usage: TextUsage): number | null {
  const price = TEXT_PRICES[baseModel(model)];
  if (!price) return null;
  const cached = Math.min(usage.input_tokens_details?.cached_tokens ?? 0, usage.input_tokens);
  return (
    (usage.input_tokens - cached) * perToken(price.input) +
    cached * perToken(price.cachedInput ?? price.input) +
    usage.output_tokens * perToken(price.output)
  );
}

export function imageCost(model: string, usage: ImageToolUsage): number | null {
  const price = IMAGE_PRICES[baseModel(model)];
  if (!price) return null;
  return (
    (usage.input_tokens_details?.text_tokens ?? 0) * perToken(price.textInput) +
    (usage.input_tokens_details?.image_tokens ?? 0) * perToken(price.imageInput) +
    (usage.output_tokens_details?.image_tokens ?? 0) * perToken(price.imageOutput) +
    (usage.output_tokens_details?.text_tokens ?? 0) * perToken(price.textOutput ?? 0)
  );
}

/** Every OpenAI call one report made, across its retries. Holds token counts and prices only. */
export class CostMeter {
  readonly lines: CostLine[] = [];

  addText(step: string, model: string, usage: TextUsage | null | undefined): void {
    if (!usage) return;
    this.lines.push({ step, model, inputTokens: usage.input_tokens, outputTokens: usage.output_tokens, usd: textCost(model, usage) });
  }

  addImage(step: string, model: string, usage: ImageToolUsage | null | undefined): void {
    if (!usage) return;
    const input = (usage.input_tokens_details?.text_tokens ?? 0) + (usage.input_tokens_details?.image_tokens ?? 0);
    const output = (usage.output_tokens_details?.image_tokens ?? 0) + (usage.output_tokens_details?.text_tokens ?? 0);
    this.lines.push({ step, model, inputTokens: input, outputTokens: output, usd: imageCost(model, usage) });
  }

  get totalUsd(): number {
    return this.lines.reduce((sum, line) => sum + (line.usd ?? 0), 0);
  }

  /** Some call used a model missing from the price table, so the total is too low. */
  get incomplete(): boolean {
    return this.lines.some((line) => line.usd === null);
  }
}

/** "US$ 0,873": the owner reads Portuguese. */
export function formatUsd(usd: number, digits = 3): string {
  return `US$ ${usd.toFixed(digits).replace(".", ",")}`;
}
