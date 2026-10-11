import { requireOrderFromRequest } from "@/features/orders/authorization";
import { requestRetry } from "@/features/orders/service";
import { publicStatus } from "@/features/orders/states";
import { handle, json } from "@/server/http";
import { assertSameOriginRequest } from "@/server/security/csrf";
import { enforceRateLimit } from "@/server/security/rate-limit";

// Resets a retryable failure so the buyer can resubmit photos. Never charges again.
export async function POST(request: Request) {
  return handle(async () => {
    assertSameOriginRequest(request);
    const order = await requireOrderFromRequest(request);
    enforceRateLimit("retry", order.id);
    const updated = await requestRetry(order.id);
    return json({ order: publicStatus(updated) });
  });
}
