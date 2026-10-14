import { requireOrderFromRequest } from "@/features/orders/authorization";
import { orderMethod, paidPreviousOrder, refreshPaymentStatus } from "@/features/orders/service";
import { isPaidStatus, publicStatus } from "@/features/orders/states";
import { ensureFulfillmentWorker } from "@/server/fulfillment/queue";
import { handle, json } from "@/server/http";
import { clientIp, enforceRateLimit } from "@/server/security/rate-limit";
import { createOrderSessionToken, orderCookieHeader } from "@/server/security/session";

// Server-confirmed order status for this browser. Never trusts ?success=true style hints.
export async function GET(request: Request) {
  return handle(async () => {
    enforceRateLimit("orderStatus", clientIp(request));
    ensureFulfillmentWorker();
    // Confirms with AbacatePay / Stripe directly instead of waiting for (or trusting) a webhook.
    const order = await refreshPaymentStatus(await requireOrderFromRequest(request));
    if (!isPaidStatus(order.status)) {
      // The buyer paid a PIX code shown earlier, after a newer checkout replaced it: follow that order.
      const previousPaid = await paidPreviousOrder(request);
      if (previousPaid) {
        return json(
          { order: publicStatus(previousPaid), pending: null },
          { headers: { "Set-Cookie": orderCookieHeader(createOrderSessionToken(previousPaid.id)) } },
        );
      }
    }
    return json({
      order: publicStatus(order),
      pending: order.status === "pending_payment" ? { method: orderMethod(order), expiresAt: order.chargeExpiresAt } : null,
    });
  });
}
