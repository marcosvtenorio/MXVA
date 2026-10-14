import { orderRepository } from "@/features/orders/repository";
import { NO_STORE_HEADERS } from "@/server/security/headers";
import { clientIp, enforceRateLimit } from "@/server/security/rate-limit";
import { verifyResumeToken } from "@/server/security/resume-token";
import { createOrderSessionToken, orderCookieHeader } from "@/server/security/session";

function redirect(location: string, extra: Record<string, string> = {}): Response {
  // The token stays out of the next page's referrer.
  return new Response(null, { status: 303, headers: { ...NO_STORE_HEADERS, "Referrer-Policy": "no-referrer", Location: location, ...extra } });
}

/**
 * The link in a "create your report again" email. A valid link signs this browser in to that paid
 * order and opens the processing page, where the buyer adds a photo; no second charge. An expired
 * or broken link goes to the Help section about it.
 */
export async function GET(request: Request) {
  try {
    enforceRateLimit("resume", clientIp(request));
  } catch {
    return redirect("/help#expired-link");
  }
  const orderId = verifyResumeToken(new URL(request.url).searchParams.get("t"));
  const order = orderId ? await (await orderRepository()).findById(orderId).catch(() => undefined) : undefined;
  if (!order) return redirect("/help#expired-link");
  return redirect("/processing", { "Set-Cookie": orderCookieHeader(createOrderSessionToken(order.id)) });
}
