import { connection } from "next/server";
import { checkoutCurrency, currentPrice } from "@/features/orders/service";
import { paymentMode, paymentsAreSandbox } from "@/server/config";
import { json } from "@/server/http";

// What the checkout can offer right now, and the server-authoritative price for it.
export async function GET() {
  await connection();
  const mode = paymentMode();
  const price = currentPrice(checkoutCurrency());
  return json({
    mode,
    price: { amountMinor: price.amountMinor, currency: price.currency },
    sandbox: mode === "pix" || mode === "stripe" ? paymentsAreSandbox() : true,
  });
}
