import { applyPaymentFact } from "@/features/orders/service";
import { orderRepository } from "@/features/orders/repository";
import { serverEnv } from "@/server/config";
import { errorResponse, handle, json, readTextLimited } from "@/server/http";
import { checkPixCharge, isClosedUnpaid, isPaid, parseWebhook, verifyWebhook } from "@/server/payment/abacatepay";

/**
 * AbacatePay → us. Authenticated by our ?webhookSecret= (and the HMAC header when
 * configured). The body only tells us WHICH charge changed: its state is re-read from
 * AbacatePay before anything is granted.
 */
export async function POST(request: Request) {
  return handle(async () => {
    const env = serverEnv();
    if (!env.ABACATEPAY_API_KEY || !env.ABACATEPAY_WEBHOOK_SECRET) return errorResponse("SERVICE_UNAVAILABLE");
    const raw = await readTextLimited(request, 256 * 1024);
    if (!verifyWebhook(raw, new URL(request.url), request.headers.get("x-webhook-signature"))) {
      return errorResponse("FORBIDDEN_ORIGIN", "Invalid webhook credentials.");
    }
    const event = parseWebhook(raw);
    if (!event) return errorResponse("INVALID_REQUEST");
    if (!event.chargeId || !event.event.startsWith("transparent.")) {
      await applyPaymentFact({ kind: "ignored", provider: "abacatepay", eventId: event.eventId, type: event.event });
      return json({ received: true });
    }

    const order = await (await orderRepository()).findByProviderChargeId(event.chargeId);
    if (!order) return json({ received: true });
    const charge = await checkPixCharge(event.chargeId);

    if (isPaid(charge.status)) {
      await applyPaymentFact({
        kind: "payment_succeeded",
        provider: "abacatepay",
        eventId: event.eventId,
        orderId: order.id,
        providerRef: event.chargeId,
        paymentIntentId: null,
        amountMinor: order.amountMinor,
        currency: order.currency,
      });
    } else if (charge.status === "REFUNDED") {
      await applyPaymentFact({ kind: "refunded", provider: "abacatepay", eventId: event.eventId, providerRef: event.chargeId });
    } else if (isClosedUnpaid(charge.status)) {
      await applyPaymentFact({ kind: "checkout_expired", provider: "abacatepay", eventId: event.eventId, orderId: order.id, providerRef: event.chargeId });
    } else {
      await applyPaymentFact({ kind: "ignored", provider: "abacatepay", eventId: event.eventId, type: `${event.event}:${charge.status}` });
    }
    return json({ received: true });
  });
}
