import { publicConfig } from "@/lib/config";
import { applyPaymentFact } from "@/features/orders/service";
import { serverEnv } from "@/server/config";
import { errorResponse, handle, json, readTextLimited } from "@/server/http";

// Stripe → us. Signature is verified over the exact raw body before anything is trusted.
export async function POST(request: Request) {
  return handle(async () => {
    const env = serverEnv();
    if (!publicConfig.enableRealPayments || !env.STRIPE_SECRET_KEY || !env.STRIPE_WEBHOOK_SECRET) {
      return errorResponse("SERVICE_UNAVAILABLE");
    }
    const raw = await readTextLimited(request, 1024 * 1024);
    const { parseStripeWebhook } = await import("@/server/payment/stripe");
    let fact;
    try {
      fact = parseStripeWebhook(raw, request.headers.get("stripe-signature"));
    } catch {
      return errorResponse("INVALID_REQUEST", "Invalid signature.");
    }
    await applyPaymentFact(fact);
    return json({ received: true });
  });
}
