import "server-only";
import { ApiError } from "@/server/http";
import { readOrderCookie, verifyOrderSessionToken } from "@/server/security/session";
import { orderRepository } from "./repository";
import { isPaidStatus, type Order } from "./states";

/** The order this browser owns, proven by the signed httpOnly cookie. */
export async function requireOrderFromRequest(request: Request): Promise<Order> {
  const session = verifyOrderSessionToken(readOrderCookie(request));
  if (!session) throw new ApiError("ORDER_SESSION_INVALID");
  const order = await (await orderRepository()).findById(session.oid);
  if (!order) throw new ApiError("ORDER_SESSION_INVALID");
  return order;
}

/** Orders this browser may still pay for, or has already paid for (prevents double charging). */
export async function optionalOrderFromRequest(request: Request): Promise<Order | undefined> {
  try {
    return await requireOrderFromRequest(request);
  } catch {
    return undefined;
  }
}

export function requirePaid(order: Order): void {
  if (!isPaidStatus(order.status) || order.status === "refunded") throw new ApiError("ORDER_NOT_PAID");
}
