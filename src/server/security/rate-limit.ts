import "server-only";
import { isProductionBuild } from "@/lib/config";
import { ApiError } from "../http";

/**
 * In-process sliding-window rate limiter. Correct for a single Node instance (the
 * V1 deployment model). Multi-instance hosting needs a shared store — see README.
 */

type Window = { hits: number[] };

const globalStore = globalThis as unknown as { __mxvaRateLimits?: Map<string, Window> };
const buckets: Map<string, Window> = (globalStore.__mxvaRateLimits ??= new Map());

const MAX_KEYS = 50_000;

export type RateRule = { limit: number; windowMs: number };

export const RATE_RULES = {
  createOrder: { limit: 10, windowMs: 10 * 60_000 },
  orderStatus: { limit: 120, windowMs: 60_000 },
  fulfill: { limit: 6, windowMs: 10 * 60_000 },
  retry: { limit: 10, windowMs: 10 * 60_000 },
  consent: { limit: 10, windowMs: 10 * 60_000 },
  events: { limit: 240, windowMs: 60_000 },
  devMockPay: { limit: 30, windowMs: 60_000 },
} satisfies Record<string, RateRule>;

/** Returns seconds until the next allowed hit, or 0 when allowed (and records the hit). */
export function hit(key: string, rule: RateRule, now = Date.now()): number {
  let window = buckets.get(key);
  if (!window) {
    if (buckets.size >= MAX_KEYS) prune(now);
    window = { hits: [] };
    buckets.set(key, window);
  }
  const cutoff = now - rule.windowMs;
  while (window.hits.length > 0 && window.hits[0]! <= cutoff) window.hits.shift();
  if (window.hits.length >= rule.limit) {
    return Math.max(1, Math.ceil((window.hits[0]! + rule.windowMs - now) / 1000));
  }
  window.hits.push(now);
  return 0;
}

function prune(now: number): void {
  for (const [key, window] of buckets) {
    const last = window.hits.at(-1);
    if (last === undefined || now - last > 60 * 60_000) buckets.delete(key);
  }
  // Still full: drop the oldest keys rather than grow without bound.
  if (buckets.size >= MAX_KEYS) {
    let excess = buckets.size - MAX_KEYS + 1000;
    for (const key of buckets.keys()) {
      if (excess-- <= 0) break;
      buckets.delete(key);
    }
  }
}

export function resetRateLimitsForTests(): void {
  buckets.clear();
}

/** Best-effort client address. Behind a proxy, the first X-Forwarded-For hop is the client. */
export function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const real = request.headers.get("x-real-ip")?.trim();
  const candidate = forwarded || real || "unknown";
  return candidate.slice(0, 64);
}

/** Development and test servers allow far more traffic (automated suites run many flows). */
const DEV_SCALE = 50;

export function enforceRateLimit(name: keyof typeof RATE_RULES, key: string): void {
  const rule = RATE_RULES[name];
  const retryAfter = hit(`${name}:${key}`, isProductionBuild ? rule : { ...rule, limit: rule.limit * DEV_SCALE });
  if (retryAfter > 0) throw new ApiError("RATE_LIMITED", undefined, { "Retry-After": String(retryAfter) });
}
