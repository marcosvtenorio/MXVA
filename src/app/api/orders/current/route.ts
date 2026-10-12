import { requireOrderFromRequest } from "@/features/orders/authorization";
import { refreshPixStatus } from "@/features/orders/service";
import { publicStatus } from "@/features/orders/states";
import { handle, json } from "@/server/http";
import { clientIp, enforceRateLimit } from "@/server/security/rate-limit";

// Server-confirmed order status for this browser. Never trusts ?success=true style hints.
export async function GET(request: Request) {
  return handle(async () => {
    enforceRateLimit("orderStatus", clientIp(request));
    // PIX: confirm with AbacatePay directly instead of waiting for (or trusting) a webhook.
    const order = await refreshPixStatus(await requireOrderFromRequest(request));
    return json({ order: publicStatus(order) });
  });
}
