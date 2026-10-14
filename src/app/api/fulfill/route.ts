import { fulfillInputSchema } from "@/features/onboarding/schema";
import { requireOrderFromRequest, requirePaid } from "@/features/orders/authorization";
import { claimForFulfillment, markFailed } from "@/features/orders/service";
import { publicStatus } from "@/features/orders/states";
import { serverEnv } from "@/server/config";
import { fulfillmentQueue } from "@/server/fulfillment/queue";
import { ApiError, handle, json, readBytesLimited } from "@/server/http";
import { validateUploadedPhoto, type ServerPhoto } from "@/server/photos/validate";
import { assertSameOriginRequest } from "@/server/security/csrf";
import { enforceRateLimit } from "@/server/security/rate-limit";

function optionalFile(form: FormData, name: string): File | undefined {
  const value = form.get(name);
  return value instanceof File && value.size > 0 ? value : undefined;
}

/**
 * Paid fulfilment request. The photos arrive as multipart and are validated here, then the report
 * goes into the server's queue (photos in RAM only) and this answers at once with the buyer's place
 * in line and an estimate: the report arrives by email. Nobody waits on an open request.
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
    const photos: ServerPhoto[] = [];
    const wipe = () => photos.forEach((photo) => photo.jpeg.fill(0));
    try {
      const front = await validateUploadedPhoto(frontFile, maxBytes);
      photos.push(front);
      for (const name of ["left", "right"]) {
        const file = optionalFile(form, name);
        if (file) photos.push(await validateUploadedPhoto(file, maxBytes));
      }
      const queue = fulfillmentQueue();
      queue.assertCapacity();
      const claimed = await claimForFulfillment(order.id);
      if (claimed.status !== "processing") throw new ApiError("ORDER_NOT_RETRYABLE");
      let ticket;
      try {
        ticket = queue.enqueue({ order: claimed, front, profiles: photos.slice(1), constraints: input.constraints, timeZone: input.timeZone });
      } catch (error) {
        // Filled up while this claim was saved: free the order so the buyer can send it again shortly.
        await markFailed(order.id, "QUEUE_FULL", true).catch(() => undefined);
        throw error;
      }
      return json({ order: publicStatus(claimed), queue: ticket }, { status: 202 });
    } catch (error) {
      wipe();
      throw error;
    }
  });
}
