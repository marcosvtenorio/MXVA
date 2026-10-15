import { connection } from "next/server";
import { currentPrice } from "@/features/orders/service";
import { paymentOffers } from "@/server/config";
import { json } from "@/server/http";

// The payment methods the checkout can offer right now, each with its server-authoritative
// price. Which one to show first is the browser's call (PIX for visitors in Brazil), and so is
// the region it sends (`?region=BR`): visitors in Brazil see the card price in reais too.
export async function GET(request?: Request) {
  await connection();
  const region = request ? new URL(request.url).searchParams.get("region") : null;
  const countryHint = region && /^[A-Z]{2}$/.test(region) ? region : null;
  return json({
    offers: paymentOffers().map(({ method, provider, sandbox }) => {
      const price = currentPrice(method, countryHint);
      return {
        method,
        price: { amountMinor: price.amountMinor, currency: price.currency },
        sandbox,
        simulated: provider === "mock",
      };
    }),
  });
}
