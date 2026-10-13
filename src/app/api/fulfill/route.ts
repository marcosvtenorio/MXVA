import { after } from "next/server";
import { fulfillInputSchema } from "@/features/onboarding/schema";
import { requireOrderFromRequest, requirePaid } from "@/features/orders/authorization";
import { claimForFulfillment, markDelivered, markEmailFailed, markFailed, touchProcessing } from "@/features/orders/service";
import { PROCESSING_HEARTBEAT_MS } from "@/features/orders/states";
import { API_ERRORS, type ApiErrorCode } from "@/lib/api-errors";
import { trackServer } from "@/server/analytics";
import { ConfigError, serverEnv } from "@/server/config";
import { NeedsHumanReview, runPipeline, type FulfillmentPhase } from "@/server/fulfillment/pipeline";
import { ApiError, handle, readBytesLimited } from "@/server/http";
import { REPORT_FILENAME } from "@/server/mail/email-adapter";
import { validateUploadedPhoto, type ServerPhoto } from "@/server/photos/validate";
import { assertSameOriginRequest } from "@/server/security/csrf";
import { NO_STORE_HEADERS } from "@/server/security/headers";
import { enforceRateLimit } from "@/server/security/rate-limit";

// Long AI calls: needs a persistent Node server (see README → hosting).
export const maxDuration = 300;

type StreamLine =
  | { type: "phase"; phase: FulfillmentPhase }
  | {
      type: "result";
      report: unknown;
      image: { mime: "image/jpeg"; base64: string };
      pdf: { filename: string; base64: string };
      emailDelivered: boolean;
    }
  | { type: "error"; error: { code: ApiErrorCode; message: string; retryable: boolean } };

function optionalFile(form: FormData, name: string): File | undefined {
  const value = form.get(name);
  return value instanceof File && value.size > 0 ? value : undefined;
}

/**
 * Paid fulfilment. Photos arrive as multipart, are validated and processed in memory,
 * and the results stream back as NDJSON (real phases, then the result). Nothing is stored.
 */
export async function POST(request: Request) {
  return handle(async () => {
    assertSameOriginRequest(request);
    const order = await requireOrderFromRequest(request);
    enforceRateLimit("fulfill", order.id);
    requirePaid(order);
    if (order.status === "withdrawn") throw new ApiError("CONSENT_REQUIRED");
    if (order.status === "delivered_to_provider") {
      throw new ApiError("ORDER_NOT_RETRYABLE", "Your report has already been sent. Check your email.");
    }

    const maxBytes = serverEnv().MAX_PHOTO_BYTES;
    const contentType = request.headers.get("content-type") ?? "";
    if (!contentType.toLowerCase().startsWith("multipart/form-data")) throw new ApiError("INVALID_REQUEST");
    const body = await readBytesLimited(request, maxBytes * 3 + 256 * 1024);
    let form: FormData;
    try {
      form = await new Response(body, { headers: { "content-type": contentType } }).formData();
    } catch {
      throw new ApiError("INVALID_REQUEST");
    } finally {
      body.fill(0);
    }

    if (form.get("faceProcessingConsent") !== "true") throw new ApiError("CONSENT_REQUIRED");
    let input;
    try {
      input = fulfillInputSchema.parse(JSON.parse(String(form.get("input") ?? "")));
    } catch {
      throw new ApiError("INVALID_REQUEST");
    }

    const frontFile = optionalFile(form, "front");
    if (!frontFile) throw new ApiError("PHOTO_REQUIRED");
    // Validate everything before claiming, so a bad photo never costs an attempt.
    const front = await validateUploadedPhoto(frontFile, maxBytes);
    const profiles: ServerPhoto[] = [];
    for (const name of ["left", "right"]) {
      const file = optionalFile(form, name);
      if (file) profiles.push(await validateUploadedPhoto(file, maxBytes));
    }

    const claimed = await claimForFulfillment(order.id);
    if (claimed.status !== "processing") throw new ApiError("ORDER_NOT_RETRYABLE");
    void trackServer("fulfillment_started", {}, order.id, order.countryHint).catch(() => undefined);

    // If the browser's connection drops (a phone switching networks, a deploy replacing this
    // server), the work goes on and the report is emailed. Registering it with after() makes a
    // shutting-down server finish it before exiting.
    let workDone!: () => void;
    const work = new Promise<void>((resolve) => {
      workDone = resolve;
    });
    try {
      after(() => work);
    } catch {
      // Outside a Next request (unit tests): there is no server lifetime to extend.
    }

    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        let open = true;
        const send = (line: StreamLine) => {
          if (!open) return;
          try {
            controller.enqueue(encoder.encode(`${JSON.stringify(line)}\n`));
          } catch {
            open = false; // the browser went away; work continues and email still goes out
          }
        };
        // While this server works, it refreshes the claim. If it stops (a deploy, a crash), the
        // claim expires within PROCESSING_LEASE_MS and the buyer's page carries on with a new attempt.
        const heartbeat = setInterval(() => void touchProcessing(order.id).catch(() => undefined), PROCESSING_HEARTBEAT_MS);
        try {
          const output = await runPipeline({ order: claimed, front, profiles, constraints: input.constraints, timeZone: input.timeZone, onPhase: (phase) => send({ type: "phase", phase }) });
          if (output.emailDelivered && output.messageId) {
            await markDelivered(order.id, output.messageId);
            void trackServer("email_provider_accepted", {}, order.id, order.countryHint).catch(() => undefined);
          } else {
            await markEmailFailed(order.id);
            void trackServer("fulfillment_failed", { code: "EMAIL_FAILED" }, order.id, order.countryHint).catch(() => undefined);
          }
          send({
            type: "result",
            report: output.report,
            image: { mime: "image/jpeg", base64: output.conceptJpeg.toString("base64") },
            pdf: { filename: REPORT_FILENAME, base64: Buffer.from(output.pdf).toString("base64") },
            emailDelivered: output.emailDelivered,
          });
          output.conceptJpeg.fill(0);
        } catch (error) {
          const code: ApiErrorCode =
            error instanceof ApiError ? error.code : error instanceof ConfigError ? "SERVICE_UNAVAILABLE" : "AI_PROVIDER_FAILED";
          const humanReview = error instanceof NeedsHumanReview;
          const retryable = !humanReview && API_ERRORS[code].retryable;
          if (!(error instanceof ApiError)) console.error(`[fulfillment] ${error instanceof Error ? error.name : "unknown"} failure`);
          await markFailed(order.id, code, retryable).catch(() => undefined);
          void trackServer("fulfillment_failed", { code }, order.id, order.countryHint).catch(() => undefined);
          const message = humanReview
            ? "We need to review your order before creating a report. Our support team will email you."
            : error instanceof ApiError
              ? error.message
              : API_ERRORS[code].message;
          send({ type: "error", error: { code, message, retryable } });
        } finally {
          clearInterval(heartbeat);
          front.jpeg.fill(0);
          for (const profile of profiles) profile.jpeg.fill(0);
          if (open) controller.close();
          workDone();
        }
      },
    });

    return new Response(stream, {
      status: 200,
      headers: { ...NO_STORE_HEADERS, "Content-Type": "application/x-ndjson; charset=utf-8", "X-Accel-Buffering": "no" },
    });
  });
}
