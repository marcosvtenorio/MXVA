import { connection } from "next/server";
import { NO_STORE_HEADERS } from "@/server/security/headers";
import { fulfillmentMode, paymentSummary } from "@/server/config";

// Public liveness probe. Reports modes only — never keys, hosts or provider names.
export async function GET() {
  await connection();
  return Response.json(
    {
      ok: true,
      service: "mxva",
      payments: paymentSummary(),
      fulfillment: fulfillmentMode(),
      time: new Date().toISOString(),
    },
    { headers: NO_STORE_HEADERS },
  );
}
