import "server-only";
import type { Constraints } from "@/features/onboarding/schema";
import {
  findStaleProcessing,
  markDelivered,
  markEmailFailed,
  markFailed,
  markInterrupted,
  touchProcessing,
} from "@/features/orders/service";
import { MAX_FULFILLMENT_ATTEMPTS, PROCESSING_HEARTBEAT_MS, PROCESSING_LEASE_MS, type Order, type OrderStatus } from "@/features/orders/states";
import type { ApiErrorCode } from "@/lib/api-errors";
import { publicConfig } from "@/lib/config";
import { trackServer } from "@/server/analytics";
import { ConfigError, fulfillmentMode, serverEnv } from "@/server/config";
import { ApiError } from "@/server/http";
import { CostMeter, formatUsd } from "@/server/ai/cost";
import { emailProvider } from "@/server/mail/email-adapter";
import {
  buyerFailureNotice,
  ownerDeliveryReceipt,
  ownerFailureAlert,
  type BuyerNoticeKind,
  type CostSummary,
  type TimelineEntry,
} from "@/server/mail/notices";
import type { ServerPhoto } from "@/server/photos/validate";
import { resumeUrl } from "@/server/security/resume-token";
import { NeedsHumanReview, generateReport, type FulfillmentPhase, type ReportCache } from "./pipeline";

/**
 * The report queue. A paid buyer's request is accepted at once (the browser shows "it arrives by
 * email in about N minutes") and waits here, photo in RAM only, until one of FULFILLMENT_CONCURRENCY
 * slots is free. Each report is retried automatically; when it still fails, the buyer gets an email
 * with a link to create it again (no second charge) and the owner gets an alert with the error
 * log, never with images.
 *
 * One queue per server process (Railway runs one). Every queued or running report keeps its order's
 * claim fresh; if a server stops, the claim expires and any other server's sweeper (or this one's,
 * after a restart) fails the order and sends the same emails.
 */

export type QueueTicket = {
  /** 0: being made now. Otherwise the number of the buyer's place in line. */
  position: number;
  etaMinutes: number;
};

export type QueueInput = {
  /** The order as claimed for this attempt (status "processing"). */
  order: Order;
  front: ServerPhoto;
  profiles: ServerPhoto[];
  constraints: Constraints;
  timeZone?: string;
};

type Job = QueueInput & {
  enqueuedAt: number;
  notBefore: number;
  generationTries: number;
  /** Times the AI provider said "too many requests" for this report, and since when. */
  rateLimitWaits: number;
  rateLimitedSince?: number;
  emailTries: number;
  /** The photo analysis from an earlier try, so a retry doesn't pay for it again. */
  cache: ReportCache;
  /** Every OpenAI call this report made, over all its tries. */
  cost: CostMeter;
  firstTryAt?: number;
  pdf?: Uint8Array;
  timeline: TimelineEntry[];
};

export type Failure = {
  code: ApiErrorCode;
  /** Worth trying again automatically. */
  retry: boolean;
  /** The provider is busy (HTTP 429): wait for a turn; it doesn't count as a failed try. */
  rateLimited?: boolean;
  /** What the buyer is told if it still fails. */
  notice: BuyerNoticeKind;
  retryAfterMs?: number;
  /** Safe for the buyer to read (photo problems). */
  reason?: string;
  /** For the owner's alert: error class, HTTP status, provider codes. Scrubbed of data. */
  detail: string;
};

export const GENERATION_TRIES = 3;
export const EMAIL_TRIES = 4;
/** How long a report waits for turns at a busy AI provider before its tries start counting again. */
export const RATE_LIMIT_MAX_WAIT_MS = 30 * 60_000;
const RATE_LIMIT_DEFAULT_WAIT_MS = 30_000;
const MAX_RETRY_AFTER_MS = 5 * 60_000;
const SWEEP_EVERY_MS = 60_000;
const EMAIL_SECONDS = 30;

const PHASE_PT: Record<FulfillmentPhase, string> = {
  analysing_photo: "análise da foto",
  preparing_image: "geração da imagem",
  checking_image: "conferência da semelhança",
  building_report: "montagem do PDF",
  sending_email: "envio do email",
};

/** Removes anything that could be personal or secret from an error message before it is logged or emailed. */
function scrub(text: string): string {
  return text
    .replace(/data:[^\s"']+/g, "[data]")
    .replace(/[A-Za-z0-9+/=_-]{100,}/g, "[blob]")
    .replace(/[^\s@"'<>]+@[^\s@"'<>]+\.[a-z]{2,}/gi, "[email]")
    .replace(/\b(sk|re|pk|rk|whsec)[-_][A-Za-z0-9_-]{6,}/g, "[key]")
    .slice(0, 300);
}

export function describeError(error: unknown): string {
  if (!(error instanceof Error)) return scrub(String(error));
  const e = error as Error & { status?: unknown; code?: unknown; type?: unknown; requestID?: unknown };
  const parts = [e.name];
  if (typeof e.status === "number") parts.push(`HTTP ${e.status}`);
  if (typeof e.code === "string") parts.push(`code=${e.code}`);
  if (typeof e.type === "string") parts.push(`type=${e.type}`);
  if (typeof e.requestID === "string") parts.push(`request=${e.requestID}`);
  const message = scrub(e.message ?? "");
  if (message) parts.push(message);
  return parts.join(" · ");
}

function retryAfter(error: unknown): number | undefined {
  const headers = (error as { headers?: unknown })?.headers;
  let value: string | null | undefined;
  if (headers instanceof Headers) value = headers.get("retry-after");
  else if (headers && typeof headers === "object") value = (headers as Record<string, string | undefined>)["retry-after"];
  const seconds = Number(value);
  return Number.isFinite(seconds) && seconds > 0 ? Math.min(seconds * 1000, MAX_RETRY_AFTER_MS) : undefined;
}

/** What a failed attempt means: try again, ask for another photo, or hand it to a person. */
export function classifyFailure(error: unknown): Failure {
  const detail = describeError(error);
  if (error instanceof NeedsHumanReview) return { code: "AGE_RESTRICTED", retry: false, notice: "review", detail };
  // A missing key or model doesn't fix itself: no retries; the owner's alert says what to set.
  if (error instanceof ConfigError) return { code: "SERVICE_UNAVAILABLE", retry: false, notice: "regenerate", detail };
  if (error instanceof ApiError) {
    switch (error.code) {
      case "PHOTO_QUALITY_INSUFFICIENT":
        return { code: error.code, retry: false, notice: "photo", reason: error.message, detail };
      case "SIMULATION_QUALITY_FAILED":
        // The concept didn't look like the buyer twice in a row: one more full try, then ask for another photo.
        return { code: error.code, retry: true, notice: "photo", reason: "We couldn't make a concept that looks like you from that photo.", detail };
      case "SERVICE_UNAVAILABLE":
        return { code: error.code, retry: false, notice: "regenerate", detail };
      default:
        return { code: error.code, retry: true, notice: "regenerate", retryAfterMs: retryAfter(error), detail };
    }
  }
  // Errors straight from the AI provider's SDK (HTTP status, rate limits, network).
  const status = (error as { status?: unknown })?.status;
  const code = (error as { code?: unknown })?.code;
  const permanent = typeof status === "number" && status >= 400 && status < 500 && ![408, 409, 429].includes(status);
  // A 429 for an empty balance doesn't clear by waiting.
  const noCredits = code === "insufficient_quota";
  return {
    code: "AI_PROVIDER_FAILED",
    retry: !permanent && !noCredits,
    rateLimited: status === 429 && !noCredits,
    notice: "regenerate",
    retryAfterMs: retryAfter(error),
    detail,
  };
}

function wipe(job: Job): void {
  job.front.jpeg.fill(0);
  for (const profile of job.profiles) profile.jpeg.fill(0);
  job.pdf?.fill(0);
  job.pdf = undefined;
  job.cache = {};
}

/** Fire-and-forget server analytics; never delays or fails the report. */
function emit(order: Order, event: { name: "fulfillment_started" | "email_provider_accepted" } | { name: "fulfillment_failed"; code: ApiErrorCode }): void {
  const sent =
    event.name === "fulfillment_failed"
      ? trackServer("fulfillment_failed", { code: event.code }, order.id, order.countryHint)
      : trackServer(event.name, {}, order.id, order.countryHint);
  void sent.catch(() => undefined);
}

async function attempt<T>(tries: number, run: () => Promise<T>): Promise<T> {
  let last: unknown;
  for (let i = 0; i < tries; i++) {
    try {
      return await run();
    } catch (error) {
      last = error;
      if (i < tries - 1) await new Promise((resolve) => setTimeout(resolve, 1000 * 2 ** i));
    }
  }
  throw last;
}

const iso = () => new Date().toISOString();

export type QueueOptions = { concurrency: number; maxQueued: number; retryDelayMs: number };

export class FulfillmentQueue {
  private waiting: Job[] = [];
  private running = new Set<Job>();
  private pumpTimer: ReturnType<typeof setTimeout> | undefined;
  private timers: ReturnType<typeof setInterval>[] = [];
  private idle: (() => void)[] = [];
  private averageSeconds: number;
  private readonly startedAt = Date.now();

  constructor(readonly options: QueueOptions) {
    this.averageSeconds = fulfillmentMode() === "real" ? 150 : 5;
  }

  get size(): { waiting: number; running: number; concurrency: number } {
    return { waiting: this.waiting.length, running: this.running.size, concurrency: this.options.concurrency };
  }

  has(orderId: string): boolean {
    return [...this.running, ...this.waiting].some((job) => job.order.id === orderId);
  }

  /** Refuses new work before a payment's attempt is spent on it, when the queue is full. */
  assertCapacity(): void {
    if (this.waiting.length + this.running.size >= this.options.maxQueued) throw new ApiError("QUEUE_FULL");
  }

  /** Takes ownership of the photos: the queue wipes them when the report is done or has failed. */
  enqueue(input: QueueInput): QueueTicket {
    this.assertCapacity();
    const now = Date.now();
    const job: Job = { ...input, enqueuedAt: now, notBefore: now, generationTries: 0, rateLimitWaits: 0, emailTries: 0, cache: {}, cost: new CostMeter(), timeline: [] };
    this.waiting.push(job);
    this.pump();
    const ticket = this.ticket(job);
    job.timeline.push({ at: iso(), step: "pedido entrou na fila", outcome: "ok", detail: ticket.position ? `posição ${ticket.position}` : "começou na hora" });
    return ticket;
  }

  private ticket(job: Job): QueueTicket {
    const average = this.averageSeconds;
    if (this.running.has(job)) return { position: 0, etaMinutes: Math.max(1, Math.ceil((average + EMAIL_SECONDS) / 60)) };
    const index = Math.max(0, this.waiting.indexOf(job));
    const rounds = Math.floor(index / this.options.concurrency) + 2;
    return { position: index + 1, etaMinutes: Math.max(1, Math.ceil((rounds * average + EMAIL_SECONDS) / 60)) };
  }

  private pump(): void {
    if (this.pumpTimer) clearTimeout(this.pumpTimer);
    this.pumpTimer = undefined;
    const now = Date.now();
    while (this.running.size < this.options.concurrency) {
      const index = this.waiting.findIndex((job) => job.notBefore <= now);
      if (index < 0) break;
      const [job] = this.waiting.splice(index, 1);
      this.running.add(job!);
      void this.run(job!)
        .catch((error) => console.error(`[queue] unexpected ${describeError(error)}`))
        .finally(() => {
          this.running.delete(job!);
          this.pump();
        });
    }
    if (this.running.size < this.options.concurrency && this.waiting.length > 0) {
      const next = Math.min(...this.waiting.map((job) => job.notBefore));
      this.pumpTimer = setTimeout(() => this.pump(), Math.max(0, next - now));
      this.pumpTimer.unref?.();
    }
    if (this.running.size === 0 && this.waiting.length === 0) for (const resolve of this.idle.splice(0)) resolve();
  }

  /** Back in line, in its original place, after a pause. */
  private requeue(job: Job, delayMs: number): void {
    job.notBefore = Date.now() + delayMs;
    const index = this.waiting.findIndex((other) => other.enqueuedAt > job.enqueuedAt);
    if (index < 0) this.waiting.push(job);
    else this.waiting.splice(index, 0, job);
  }

  private retryDelay(failures: number, base: number): number {
    return base * 4 ** (failures - 1);
  }

  private async run(job: Job): Promise<void> {
    const id = job.order.id;
    if (!job.pdf) {
      job.generationTries++;
      if (job.generationTries === 1) emit(job.order, { name: "fulfillment_started" });
      const started = Date.now();
      job.firstTryAt ??= started;
      let phase: FulfillmentPhase | undefined;
      try {
        const { pdf } = await generateReport({
          front: job.front,
          profiles: job.profiles,
          constraints: job.constraints,
          timeZone: job.timeZone,
          cache: job.cache,
          meter: job.cost,
          onPhase: (current) => {
            phase = current;
          },
        });
        const seconds = (Date.now() - started) / 1000;
        this.averageSeconds = this.averageSeconds * 0.8 + seconds * 0.2;
        job.pdf = pdf;
        // The photos are inside the PDF now; nothing else needs them.
        job.front.jpeg.fill(0);
        for (const profile of job.profiles) profile.jpeg.fill(0);
        job.timeline.push({ at: iso(), step: `relatório gerado (tentativa ${job.generationTries})`, outcome: "ok", seconds });
      } catch (error) {
        const failure = classifyFailure(error);
        const seconds = (Date.now() - started) / 1000;
        job.rateLimitedSince ??= failure.rateLimited ? Date.now() : undefined;
        if (failure.rateLimited && Date.now() - job.rateLimitedSince! < RATE_LIMIT_MAX_WAIT_MS) {
          // The provider is at capacity: not this report's fault. Wait for a turn without spending a try.
          job.generationTries--;
          job.rateLimitWaits++;
          if (job.rateLimitWaits === 1 || job.rateLimitWaits % 5 === 0) {
            job.timeline.push({ at: iso(), step: `OpenAI ocupada (429), aguardando a vez (${job.rateLimitWaits}ª espera)`, outcome: "error", code: failure.code, detail: failure.detail });
          }
          return this.requeue(job, failure.retryAfterMs ?? RATE_LIMIT_DEFAULT_WAIT_MS);
        }
        job.timeline.push({
          at: iso(),
          step: `gerar relatório, tentativa ${job.generationTries} de ${GENERATION_TRIES}${phase ? ` (parou em: ${PHASE_PT[phase]})` : ""}`,
          outcome: "error",
          code: failure.code,
          detail: failure.detail,
          seconds,
        });
        console.warn(`[queue] order ${id.slice(0, 8)} try ${job.generationTries} failed: ${failure.code}`);
        if (failure.retry && job.generationTries < GENERATION_TRIES) {
          return this.requeue(job, Math.max(this.retryDelay(job.generationTries, this.options.retryDelayMs), failure.retryAfterMs ?? 0));
        }
        const what =
          failure.notice === "photo"
            ? "A foto do comprador não pôde ser usada"
            : failure.notice === "review"
              ? "O pedido precisa de revisão humana"
              : `O relatório não foi gerado depois de ${job.generationTries} tentativa${job.generationTries > 1 ? "s" : ""}`;
        return this.fail(job, failure, what, "generation");
      }
    }

    job.emailTries++;
    try {
      const { messageId } = await emailProvider().sendReport({
        to: job.order.email,
        pdf: Buffer.from(job.pdf!),
        // Same key on every try of this attempt: the provider never sends it twice.
        idempotencyKey: `report-${id}-a${job.order.fulfillmentAttempts}`,
      });
      job.timeline.push({ at: iso(), step: `email enviado (tentativa ${job.emailTries})`, outcome: "ok" });
      await markDelivered(id, messageId);
      emit(job.order, { name: "email_provider_accepted" });
      wipe(job);
      console.info(`[queue] order ${id.slice(0, 8)} delivered; AI cost ${formatUsd(job.cost.totalUsd, 4)}${job.cost.incomplete ? " (incomplete)" : ""}`);
      await this.sendReceipt(job);
    } catch (error) {
      const detail = describeError(error);
      job.timeline.push({ at: iso(), step: `enviar email, tentativa ${job.emailTries} de ${EMAIL_TRIES}`, outcome: "error", code: "EMAIL_FAILED", detail });
      console.warn(`[queue] order ${id.slice(0, 8)} email try ${job.emailTries} failed`);
      if (job.emailTries < EMAIL_TRIES) return this.requeue(job, this.retryDelay(job.emailTries, this.options.retryDelayMs / 3));
      return this.fail(job, { code: "EMAIL_FAILED", retry: false, notice: "regenerate", detail }, "O relatório foi gerado, mas o email com o PDF não saiu", "email");
    }
  }

  /** What this report's OpenAI calls cost, with the models that made it. */
  private costSummary(job: Job): CostSummary {
    const env = serverEnv();
    return {
      lines: job.cost.lines,
      totalUsd: job.cost.totalUsd,
      incomplete: job.cost.incomplete,
      real: fulfillmentMode() === "real",
      models: { text: env.VISION_MODEL ?? "?", image: env.IMAGE_EDIT_MODEL ?? "?", imageQuality: env.IMAGE_QUALITY },
    };
  }

  /** The owner's receipt for a delivered report. Never holds up or fails the delivery. */
  private async sendReceipt(job: Job): Promise<void> {
    const env = serverEnv();
    if (!env.OWNER_ALERT_EMAIL || !env.OWNER_DELIVERY_EMAILS) return;
    const receipt = ownerDeliveryReceipt({
      orderId: job.order.id,
      payment: { mode: job.order.paymentMode, amountMinor: job.order.amountMinor, currency: job.order.currency, paidAt: job.order.paidAt },
      generationSeconds: ((job.firstTryAt ? Date.now() - job.firstTryAt : 0) / 1000),
      generationTries: job.generationTries,
      cost: this.costSummary(job),
      server: { appUrl: publicConfig.appUrl, commit: process.env.RAILWAY_GIT_COMMIT_SHA?.slice(0, 7) ?? null },
    });
    const to = env.OWNER_ALERT_EMAIL;
    try {
      await attempt(3, () => emailProvider().sendNotice({ to, ...receipt, idempotencyKey: `receipt-${job.order.id}-a${job.order.fulfillmentAttempts}` }));
    } catch (error) {
      console.error(`[queue] order ${job.order.id.slice(0, 8)} delivered, but the owner's receipt could not be sent: ${describeError(error)}`);
    }
  }

  private async fail(job: Job, failure: Failure, what: string, stage: "generation" | "email"): Promise<void> {
    wipe(job);
    let order: Order = job.order;
    try {
      order =
        stage === "email"
          ? await markEmailFailed(job.order.id)
          : await markFailed(job.order.id, failure.code, failure.notice === "regenerate" || failure.notice === "photo");
    } catch (error) {
      console.error(`[queue] order ${job.order.id.slice(0, 8)} could not record the failure: ${describeError(error)}`);
    }
    emit(order, { name: "fulfillment_failed", code: failure.code });
    await this.notify(order, failure, what, job.timeline, this.costSummary(job));
  }

  /** The buyer's "create it again" (or "we'll contact you") email, then the owner's alert. */
  async notify(order: Order, failure: Failure, what: string, timeline: TimelineEntry[], cost?: CostSummary): Promise<void> {
    const finalStatus: OrderStatus = order.status;
    const notice: BuyerNoticeKind = finalStatus === "needs_support" && failure.notice !== "review" ? "support" : failure.notice;
    const link = notice === "regenerate" || notice === "photo" ? resumeUrl(order.id) : undefined;
    let buyerNoticeSent = false;
    try {
      const mailer = emailProvider();
      const content = buyerFailureNotice(notice, { resumeUrl: link, reason: failure.reason });
      await attempt(3, () => mailer.sendNotice({ to: order.email, ...content, idempotencyKey: `notice-${order.id}-a${order.fulfillmentAttempts}` }));
      buyerNoticeSent = true;
      timeline.push({ at: iso(), step: "email de aviso ao comprador", outcome: "ok" });
    } catch (error) {
      timeline.push({ at: iso(), step: "email de aviso ao comprador", outcome: "error", code: "EMAIL_FAILED", detail: describeError(error) });
    }

    const owner = serverEnv().OWNER_ALERT_EMAIL;
    if (!owner) {
      console.error(`[queue] order ${order.id} failed (${failure.code}); OWNER_ALERT_EMAIL is not set, so no alert was emailed`);
      return;
    }
    const alert = ownerFailureAlert({
      orderId: order.id,
      buyerEmail: order.email,
      code: failure.code,
      what,
      finalStatus,
      buyerAttempt: order.fulfillmentAttempts,
      maxAttempts: MAX_FULFILLMENT_ATTEMPTS,
      buyerNotice: notice,
      buyerNoticeSent,
      payment: { mode: order.paymentMode, amountMinor: order.amountMinor, currency: order.currency, paidAt: order.paidAt },
      timeline,
      server: {
        appUrl: publicConfig.appUrl,
        commit: process.env.RAILWAY_GIT_COMMIT_SHA?.slice(0, 7) ?? null,
        mode: fulfillmentMode(),
        queueWaiting: this.waiting.length,
        queueRunning: this.running.size,
        concurrency: this.options.concurrency,
        uptimeSeconds: (Date.now() - this.startedAt) / 1000,
      },
      cost,
    });
    try {
      await attempt(3, () => emailProvider().sendNotice({ to: owner, ...alert, idempotencyKey: `alert-${order.id}-a${order.fulfillmentAttempts}` }));
    } catch (error) {
      console.error(`[queue] order ${order.id} failed (${failure.code}) and the owner alert could not be sent: ${describeError(error)}`);
    }
  }

  /** Keeps the claims of every report this server holds fresh. */
  async heartbeat(): Promise<void> {
    const ids = [...this.running, ...this.waiting].map((job) => job.order.id);
    if (ids.length) await touchProcessing(ids);
  }

  /** Orders whose server stopped while they were queued or being made: fail them and send the emails. */
  async sweep(now = new Date()): Promise<number> {
    const stale = await findStaleProcessing(new Date(now.getTime() - PROCESSING_LEASE_MS));
    let handled = 0;
    for (const order of stale) {
      if (this.has(order.id)) continue;
      const { order: updated, changed } = await markInterrupted(order.id);
      if (!changed) continue; // another server got there first, or it came back to life
      handled++;
      emit(updated, { name: "fulfillment_failed", code: "FULFILLMENT_INTERRUPTED" });
      await this.notify(
        updated,
        { code: "FULFILLMENT_INTERRUPTED", retry: false, notice: "regenerate", detail: "o servidor que tinha a foto na memória parou (deploy, reinício ou falha) antes de terminar" },
        "O servidor parou com o relatório na fila",
        [{ at: order.processingStartedAt ?? order.createdAt, step: "último sinal de vida do servidor que tinha o pedido", outcome: "error", code: "FULFILLMENT_INTERRUPTED" }],
      );
    }
    return handled;
  }

  /** Starts the heartbeat and the sweeper (once). */
  startTimers(): void {
    if (this.timers.length) return;
    const heartbeat = setInterval(() => void this.heartbeat().catch(() => undefined), PROCESSING_HEARTBEAT_MS);
    const sweeper = setInterval(() => void this.sweep().catch((error) => console.error(`[queue] sweep: ${describeError(error)}`)), SWEEP_EVERY_MS);
    const first = setTimeout(() => void this.sweep().catch(() => undefined), 5_000);
    for (const timer of [heartbeat, sweeper, first]) timer.unref?.();
    this.timers.push(heartbeat, sweeper, first);
  }

  stopTimers(): void {
    for (const timer of this.timers.splice(0)) clearInterval(timer);
    if (this.pumpTimer) clearTimeout(this.pumpTimer);
  }

  /** Resolves when nothing is waiting or running (tests). */
  drained(): Promise<void> {
    if (this.running.size === 0 && this.waiting.length === 0) return Promise.resolve();
    return new Promise((resolve) => this.idle.push(resolve));
  }
}

const globalQueue = globalThis as unknown as { __mxvaFulfillmentQueue?: FulfillmentQueue };

/** This server's queue, with its heartbeat and sweeper running. */
export function fulfillmentQueue(): FulfillmentQueue {
  if (!globalQueue.__mxvaFulfillmentQueue) {
    const env = serverEnv();
    globalQueue.__mxvaFulfillmentQueue = new FulfillmentQueue({
      concurrency: env.FULFILLMENT_CONCURRENCY,
      maxQueued: env.FULFILLMENT_MAX_QUEUED,
      retryDelayMs: env.FULFILLMENT_RETRY_DELAY_MS,
    });
    // Unit tests drive the heartbeat and the sweeper by hand.
    if (process.env.NODE_ENV !== "test") globalQueue.__mxvaFulfillmentQueue.startTimers();
  }
  return globalQueue.__mxvaFulfillmentQueue;
}

/**
 * Makes sure this server's queue (and so its sweeper) is running. Called from routes every visitor
 * hits, so that after a restart the orders the old server held get their emails within a minute.
 */
export function ensureFulfillmentWorker(): void {
  try {
    if (fulfillmentMode() !== "unavailable") fulfillmentQueue();
  } catch (error) {
    console.error(`[queue] could not start: ${describeError(error)}`);
  }
}

/** Test hook: a fresh queue on next use. */
export function resetFulfillmentQueueForTests(): void {
  globalQueue.__mxvaFulfillmentQueue?.stopTimers();
  globalQueue.__mxvaFulfillmentQueue = undefined;
}
