import { after } from "next/server";
import { CONSENT_COOKIE, FBC_COOKIE, FBP_COOKIE, parseConsentCookie, readCookie } from "@/features/analytics/consent";
import { parseEventBatch } from "@/features/analytics/events";
import { optionalOrderFromRequest } from "@/features/orders/authorization";
import { isPaidStatus } from "@/features/orders/states";
import { publicConfig } from "@/lib/config";
import { ensureFulfillmentWorker } from "@/server/fulfillment/queue";
import {
  dispatchClientBatch,
  metaConfigured,
  purchaseMetaEvent,
  sha256,
  type MetaEvent,
  type RequestFacts,
} from "@/server/analytics";
import { serverEnv } from "@/server/config";
import { ApiError, handle, readTextLimited } from "@/server/http";
import { NO_STORE_HEADERS } from "@/server/security/headers";
import { clientIp, enforceRateLimit } from "@/server/security/rate-limit";

function assertSameSite(request: Request): void {
  const site = request.headers.get("sec-fetch-site");
  if (site && site !== "same-origin" && site !== "none") throw new ApiError("FORBIDDEN_ORIGIN");
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(publicConfig.appUrl).origin && origin !== new URL(request.url).origin) {
    throw new ApiError("FORBIDDEN_ORIGIN");
  }
}

// First-party analytics intake. Anonymous and allowlisted; answers 204 immediately and
// forwards to providers after the response.
export async function POST(request: Request) {
  return handle(async () => {
    assertSameSite(request);
    const ip = clientIp(request);
    enforceRateLimit("events", ip);
    // Page views reach this on every visit: after a restart, the queue's sweeper starts with the first one.
    ensureFulfillmentWorker();

    let raw: unknown;
    try {
      raw = JSON.parse(await readTextLimited(request, 32 * 1024));
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw new ApiError("INVALID_REQUEST");
    }
    const batch = parseEventBatch(raw);
    if (!batch) throw new ApiError("INVALID_REQUEST");

    // The consent cookie is the source of truth; the stricter of cookie and client wins.
    const cookieHeader = request.headers.get("cookie") ?? "";
    const consent = parseConsentCookie(readCookie(cookieHeader, CONSENT_COOKIE));
    batch.context.consent = {
      analytics: batch.context.consent.analytics && consent.analytics,
      marketing: batch.context.consent.marketing && consent.marketing,
    };
    const marketing = batch.context.consent.marketing;
    const facts: RequestFacts = {
      ip,
      userAgent: (request.headers.get("user-agent") ?? "").slice(0, 512),
      fbp: marketing ? readCookie(cookieHeader, FBP_COOKIE)?.slice(0, 200) : undefined,
      fbc: marketing ? readCookie(cookieHeader, FBC_COOKIE)?.slice(0, 600) : undefined,
    };

    // Purchase is never taken from the browser's word: the order cookie must prove payment.
    const extraMeta: MetaEvent[] = [];
    if (marketing && metaConfigured() && batch.events.some((event) => event.name === "payment_confirmed")) {
      const order = await optionalOrderFromRequest(request);
      if (order && isPaidStatus(order.status) && order.status !== "refunded") {
        const emailSha256 = serverEnv().META_CAPI_SEND_HASHED_EMAIL ? sha256(order.email.trim().toLowerCase()) : undefined;
        extraMeta.push(purchaseMetaEvent(order, { ...facts, emailSha256 }));
      }
    }

    after(() => dispatchClientBatch(batch, facts, extraMeta));
    return new Response(null, { status: 204, headers: NO_STORE_HEADERS });
  });
}
