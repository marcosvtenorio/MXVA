import { z } from "zod";
import { publicConfig } from "@/lib/config";
import { FACE_PROCESSING_CONSENT_VERSION, TERMS_VERSION, emailSchema } from "@/features/onboarding/schema";
import { optionalOrderFromRequest } from "@/features/orders/authorization";
import {
  SKU,
  abandonPendingCheckout,
  createOrder,
  hasPayablePixCharge,
  paidPreviousOrder,
  refreshPaymentStatus,
  reusableCheckout,
} from "@/features/orders/service";
import { isUnfinishedPaidStatus, publicStatus } from "@/features/orders/states";
import { ApiError, handle, json, readJson } from "@/server/http";
import { PAYMENT_METHODS } from "@/server/config";
import { toPublicCheckout } from "@/server/payment/adapter";
import { assertSameOriginRequest } from "@/server/security/csrf";
import { clientIp, enforceRateLimit } from "@/server/security/rate-limit";
import { createOrderSessionToken, orderCookieHeader, readOrderCookie, verifyOrderSessionToken } from "@/server/security/session";

const bodySchema = z
  .object({
    sku: z.literal(SKU),
    method: z.enum(PAYMENT_METHODS),
    email: emailSchema,
    adultConfirmed: z.boolean(),
    faceProcessingConsentVersion: z.string().max(64),
    termsVersion: z.string().max(64),
    marketingOptIn: z.boolean(),
    countryHint: z
      .string()
      .regex(/^[A-Z]{2}$/)
      .optional(),
  })
  .strict();

// Creates order metadata + a checkout session. Never receives photos or survey answers.
export async function POST(request: Request) {
  return handle(async () => {
    assertSameOriginRequest(request);
    enforceRateLimit("createOrder", clientIp(request));
    const body = await readJson(request, bodySchema);

    if (!body.adultConfirmed) throw new ApiError("AGE_RESTRICTED");
    if (body.faceProcessingConsentVersion !== FACE_PROCESSING_CONSENT_VERSION || body.termsVersion !== TERMS_VERSION) {
      throw new ApiError("CONSENT_REQUIRED");
    }

    // A browser with a paid, unfinished order must never be sent to a second payment. A PIX or
    // card payment may have landed seconds ago, so ask the provider before opening another
    // checkout. A finished order (delivered, refunded, with support) doesn't block a new report.
    // An earlier PIX code may have been paid after a newer checkout replaced it: follow that order.
    const previousPaid = await paidPreviousOrder(request);
    if (previousPaid && isUnfinishedPaidStatus(previousPaid.status)) {
      return json(
        { alreadyPaid: true, order: publicStatus(previousPaid) },
        { headers: { "Set-Cookie": orderCookieHeader(createOrderSessionToken(previousPaid.id)) } },
      );
    }
    const existing = await optionalOrderFromRequest(request);
    let previous: string | undefined;
    if (existing) {
      const fresh = await refreshPaymentStatus(existing).catch(() => existing);
      if (isUnfinishedPaidStatus(fresh.status)) return json({ alreadyPaid: true, order: publicStatus(fresh) });
      // One open checkout per browser: another tab gets the one already open, so every tab pays
      // the same order (no stale card form, no second PIX code).
      const reused = await reusableCheckout(fresh, body.method, body.email, body.countryHint).catch(() => undefined);
      if (reused) {
        return json({
          alreadyPaid: false,
          order: publicStatus(fresh),
          checkout: toPublicCheckout(reused),
          price: { amountMinor: fresh.amountMinor, currency: fresh.currency },
        });
      }
      // A PIX code shown before may still be paid in a bank app: keep watching that order.
      previous = hasPayablePixCharge(fresh) ? fresh.id : verifyOrderSessionToken(readOrderCookie(request))?.prv;
      await abandonPendingCheckout(fresh).catch(() => undefined);
    }

    const { order, checkout } = await createOrder({
      method: body.method,
      email: body.email,
      consentVersion: body.faceProcessingConsentVersion,
      termsVersion: body.termsVersion,
      marketingOptIn: body.marketingOptIn,
      countryHint: body.countryHint ?? null,
      returnUrl: `${publicConfig.appUrl}/processing`,
    });

    return json(
      {
        alreadyPaid: false,
        order: publicStatus(order),
        checkout: toPublicCheckout(checkout),
        price: { amountMinor: order.amountMinor, currency: order.currency },
      },
      { status: 201, headers: { "Set-Cookie": orderCookieHeader(createOrderSessionToken(order.id, undefined, undefined, previous)) } },
    );
  });
}
