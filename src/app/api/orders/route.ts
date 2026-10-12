import { z } from "zod";
import { publicConfig } from "@/lib/config";
import { FACE_PROCESSING_CONSENT_VERSION, TERMS_VERSION, emailSchema } from "@/features/onboarding/schema";
import { optionalOrderFromRequest } from "@/features/orders/authorization";
import { SKU, checkoutCurrency, createOrder, currentPrice } from "@/features/orders/service";
import { isPaidStatus, publicStatus } from "@/features/orders/states";
import { ApiError, handle, json, readJson } from "@/server/http";
import { toPublicCheckout } from "@/server/payment/adapter";
import { assertSameOriginRequest } from "@/server/security/csrf";
import { clientIp, enforceRateLimit } from "@/server/security/rate-limit";
import { createOrderSessionToken, orderCookieHeader } from "@/server/security/session";

const bodySchema = z
  .object({
    sku: z.literal(SKU),
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

    // A browser that already paid must never be sent to a second payment.
    const existing = await optionalOrderFromRequest(request);
    if (existing && isPaidStatus(existing.status)) {
      return json({ alreadyPaid: true, order: publicStatus(existing) });
    }

    const { order, checkout } = await createOrder({
      email: body.email,
      consentVersion: body.faceProcessingConsentVersion,
      termsVersion: body.termsVersion,
      marketingOptIn: body.marketingOptIn,
      countryHint: body.countryHint ?? null,
      returnUrl: `${publicConfig.appUrl}/processing`,
    });

    const price = currentPrice(checkoutCurrency());
    return json(
      {
        alreadyPaid: false,
        order: publicStatus(order),
        checkout: toPublicCheckout(checkout),
        price: { amountMinor: price.amountMinor, currency: price.currency },
      },
      { status: 201, headers: { "Set-Cookie": orderCookieHeader(createOrderSessionToken(order.id)) } },
    );
  });
}
