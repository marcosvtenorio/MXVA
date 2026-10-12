import { requireOrderFromRequest } from "@/features/orders/authorization";
import { orderMethod, refreshPaymentStatus } from "@/features/orders/service";
import { publicStatus } from "@/features/orders/states";
import { handle, json } from "@/server/http";
import { clientIp, enforceRateLimit } from "@/server/security/rate-limit";

// Server-confirmed order status for this browser. Never trusts ?success=true style hints.
export async function GET(request: Request) {
  return handle(async () => {
    enforceRateLimit("orderStatus", clientIp(request));
    // Confirms with AbacatePay / Stripe directly instead of waiting for (or trusting) a webhook.
    const order = await refreshPaymentStatus(await requireOrderFromRequest(request));
    return json({
      order: publicStatus(order),
      pending: order.status === "pending_payment" ? { method: orderMethod(order), expiresAt: order.chargeExpiresAt } : null,
    });
  });
}
