import { randomUUID } from "node:crypto";
import { z } from "zod";
import { devPreviewEnabled, isProductionBuild } from "@/lib/config";
import { requireOrderFromRequest } from "@/features/orders/authorization";
import { applyPaymentFact } from "@/features/orders/service";
import { publicStatus } from "@/features/orders/states";
import { ApiError, errorResponse, handle, json, readJson } from "@/server/http";
import { assertSameOriginRequest } from "@/server/security/csrf";
import { clientIp, enforceRateLimit } from "@/server/security/rate-limit";

const bodySchema = z.object({ outcome: z.enum(["succeeded", "declined", "expired"]) }).strict();

/**
 * DEVELOPMENT ONLY. Simulates the payment provider's webhook for mock orders (card or PIX) through the
 * same code path as real payments. Production builds always answer 404.
 */
export async function POST(request: Request) {
  if (isProductionBuild || !devPreviewEnabled) return errorResponse("NOT_FOUND");
  return handle(async () => {
    assertSameOriginRequest(request);
    enforceRateLimit("devMockPay", clientIp(request));
    const { outcome } = await readJson(request, bodySchema);
    const order = await requireOrderFromRequest(request);
    const providerRef = order.stripeCheckoutSessionId ?? order.providerChargeId;
    if (order.paymentMode !== "mock" || !providerRef) throw new ApiError("NOT_FOUND");

    if (outcome === "declined") {
      return errorResponse("ORDER_NOT_PAID", "The payment was declined (simulated). Nothing was charged.");
    }
    const eventId = `mock_evt_${randomUUID()}`;
    const updated =
      outcome === "expired"
        ? await applyPaymentFact({ kind: "checkout_expired", provider: "mock", eventId, orderId: order.id, providerRef })
        : await applyPaymentFact({
            kind: "payment_succeeded",
            provider: "mock",
            eventId,
            orderId: order.id,
            providerRef,
            paymentIntentId: `mock_pi_${randomUUID()}`,
            amountMinor: order.amountMinor,
            currency: order.currency,
          });
    return json({ order: publicStatus(updated ?? order) });
  });
}
