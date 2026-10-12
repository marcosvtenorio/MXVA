import { connection } from "next/server";
import { currentPrice } from "@/features/orders/service";
import { paymentOffers } from "@/server/config";
import { json } from "@/server/http";

// The payment methods the checkout can offer right now, each with its server-authoritative
// price. Which one to show first is the browser's call (PIX for visitors in Brazil).
export async function GET() {
  await connection();
  return json({
    offers: paymentOffers().map(({ method, provider, sandbox }) => {
      const price = currentPrice(method);
      return {
        method,
        price: { amountMinor: price.amountMinor, currency: price.currency },
        sandbox,
        simulated: provider === "mock",
      };
    }),
  });
}
