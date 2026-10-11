import { requireOrderFromRequest } from "@/features/orders/authorization";
import { withdrawConsent } from "@/features/orders/service";
import { publicStatus } from "@/features/orders/states";
import { handle, json } from "@/server/http";
import { assertSameOriginRequest } from "@/server/security/csrf";
import { enforceRateLimit } from "@/server/security/rate-limit";

// Stops any processing that hasn't started. The browser clears its own volatile data.
export async function POST(request: Request) {
  return handle(async () => {
    assertSameOriginRequest(request);
    const order = await requireOrderFromRequest(request);
    enforceRateLimit("consent", order.id);
    const updated = await withdrawConsent(order.id);
    return json({ withdrawn: updated.status === "withdrawn", order: publicStatus(updated) });
  });
}
