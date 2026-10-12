import { isProductionBuild } from "@/lib/config";
import { requireOrderFromRequest } from "@/features/orders/authorization";
import { clearPaymentCheckThrottle, refreshPaymentStatus } from "@/features/orders/service";
import { publicStatus } from "@/features/orders/states";
import { providerIsSandbox } from "@/server/config";
import { ApiError, errorResponse, handle, json } from "@/server/http";
import { simulatePixPayment } from "@/server/payment/abacatepay";
import { assertSameOriginRequest } from "@/server/security/csrf";
import { enforceRateLimit } from "@/server/security/rate-limit";

/**
 * DEVELOPMENT + SANDBOX ONLY. Asks AbacatePay's Dev Mode to mark this order's PIX charge
 * as paid, then confirms it the normal way (server-side status check). 404 otherwise.
 */
export async function POST(request: Request) {
  if (isProductionBuild || !providerIsSandbox("abacatepay")) return errorResponse("NOT_FOUND");
  return handle(async () => {
    assertSameOriginRequest(request);
    const order = await requireOrderFromRequest(request);
    enforceRateLimit("devMockPay", order.id);
    if (order.paymentMode !== "abacatepay" || !order.providerChargeId) throw new ApiError("NOT_FOUND");
    await simulatePixPayment(order.providerChargeId);
    clearPaymentCheckThrottle(order.id); // confirm right away instead of waiting out the poll throttle
    const updated = await refreshPaymentStatus(order);
    return json({ order: publicStatus(updated) });
  });
}
