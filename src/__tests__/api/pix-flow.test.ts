import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  connection: async () => undefined,
}));

/**
 * PIX via AbacatePay, end to end through the route handlers, with AbacatePay's HTTP API
 * replaced by an in-test fake. Modules are imported after the env is set because the
 * public config is read at import time.
 */

const ORIGIN = "http://localhost:3000";
const API_KEY = "abc_dev_unit_test_key_000000";
const WEBHOOK_SECRET = "unit-test-webhook-secret";
const saved: Record<string, string | undefined> = {};
const ENV = {
  NEXT_PUBLIC_ENABLE_REAL_PAYMENTS: "true",
  PAYMENT_PROVIDER: "abacatepay",
  ABACATEPAY_API_KEY: API_KEY,
  ABACATEPAY_SANDBOX: "true",
  ABACATEPAY_WEBHOOK_SECRET: WEBHOOK_SECRET,
  PRICE_BRL_CENTS: "14900",
};

type Charge = { id: string; amount: number; status: string };
let charges: Map<string, Charge>;
let chargeSequence = 0; // charge ids are unique across tests, as in production
let calls: { url: string; init: RequestInit }[];

function fakeAbacatePay() {
  return vi.fn(async (input: string | URL, init: RequestInit = {}) => {
    const url = new URL(String(input));
    calls.push({ url: url.toString(), init });
    if (!url.hostname.endsWith("abacatepay.com")) return new Response("{}", { status: 404 });
    if ((init.headers as Record<string, string>).authorization !== `Bearer ${API_KEY}`) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    const id = url.searchParams.get("id") ?? "";
    if (url.pathname === "/v2/transparents/create") {
      const body = JSON.parse(String(init.body));
      const charge = { id: `pix_char_${++chargeSequence}`, amount: body.data.amount, status: "PENDING" };
      charges.set(charge.id, charge);
      return Response.json({
        data: {
          ...charge,
          devMode: true,
          brCode: "00020101021226950014br.gov.bcb.pix2573fake",
          brCodeBase64: "data:image/png;base64,iVBORw0KGgo=",
          expiresAt: new Date(Date.now() + 30 * 60_000).toISOString(),
          platformFee: 80,
        },
        error: null,
        success: true,
      });
    }
    if (url.pathname === "/v2/transparents/check") {
      const charge = charges.get(id);
      return charge ? Response.json({ data: { id, status: charge.status }, error: null }) : Response.json({ error: "not found" }, { status: 404 });
    }
    if (url.pathname === "/v2/transparents/simulate-payment") {
      const charge = charges.get(id)!;
      charge.status = "PAID";
      return Response.json({ data: { id, status: "PAID", amount: charge.amount }, error: null });
    }
    return new Response("{}", { status: 404 });
  });
}

const orderBody = {
  sku: "mxva_report_v1",
  email: "pix.buyer@example.com",
  adultConfirmed: true,
  faceProcessingConsentVersion: "2026-10-11.v1",
  termsVersion: "2026-10-11.v1",
  marketingOptIn: false,
  countryHint: "BR",
};

const post = (path: string, body?: unknown, cookie?: string) =>
  new Request(`${ORIGIN}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: ORIGIN, "x-mxva-request": "1", ...(cookie ? { cookie } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

let routes: {
  createOrder: (r: Request) => Promise<Response>;
  current: (r: Request) => Promise<Response>;
  webhook: (r: Request) => Promise<Response>;
  simulate: (r: Request) => Promise<Response>;
  options: () => Promise<Response>;
};
let repo: { list(): { id: string; providerChargeId: string | null; currency: string; amountMinor: number; status: string }[] };

beforeAll(async () => {
  for (const [key, value] of Object.entries(ENV)) {
    saved[key] = process.env[key];
    process.env[key] = value;
  }
  vi.resetModules();
  const repository = await import("@/features/orders/repository");
  const memory = new repository.InMemoryOrderRepository();
  repository.setOrderRepositoryForTests(memory);
  repo = memory;
  routes = {
    createOrder: (await import("@/app/api/orders/route")).POST,
    current: (await import("@/app/api/orders/current/route")).GET,
    webhook: (await import("@/app/api/abacatepay/webhook/route")).POST,
    simulate: (await import("@/app/api/dev/pix-simulate/route")).POST,
    options: (await import("@/app/api/checkout/options/route")).GET,
  };
});

afterAll(() => {
  for (const [key, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  vi.resetModules();
});

beforeEach(async () => {
  charges = new Map();
  calls = [];
  vi.stubGlobal("fetch", fakeAbacatePay());
  vi.spyOn(console, "info").mockImplementation(() => undefined);
  (await import("@/server/security/rate-limit")).resetRateLimitsForTests();
});

const lastCharge = () => charges.get(`pix_char_${chargeSequence}`)!;

async function createPixOrder() {
  const response = await routes.createOrder(post("/api/orders", orderBody));
  const cookie = (response.headers.get("set-cookie") ?? "").split(";")[0]!;
  return { response, cookie, body: await response.json() };
}

const current = async (cookie: string) =>
  (await (await routes.current(new Request(`${ORIGIN}/api/orders/current`, { headers: { cookie } }))).json()).order;

describe("PIX checkout (AbacatePay sandbox, faked HTTP)", () => {
  it("offers PIX in reais", async () => {
    const options = await (await routes.options()).json();
    expect(options).toEqual({ mode: "pix", price: { amountMinor: 14900, currency: "brl" }, sandbox: true });
  });

  it("creates a BRL charge server-side and returns only the QR and copy code", async () => {
    const { response, body } = await createPixOrder();
    expect(response.status).toBe(201);
    expect(body.checkout).toMatchObject({ mode: "pix", brCode: expect.stringContaining("br.gov.bcb.pix"), sandbox: true });
    expect(body.checkout.qrCodeDataUrl).toMatch(/^data:image\/png;base64,/);
    expect(body.price).toEqual({ amountMinor: 14900, currency: "brl" });
    expect(JSON.stringify(body)).not.toContain("pix_char_");

    const create = calls.find((call) => call.url.endsWith("/v2/transparents/create"))!;
    const sent = JSON.parse(String(create.init.body));
    expect(sent).toMatchObject({ method: "PIX", data: { amount: 14900, expiresIn: 1800 } });
    const stored = repo.list().at(-1)!;
    expect(sent.data.externalId).toBe(stored.id);
    expect(stored).toMatchObject({ currency: "brl", amountMinor: 14900, providerChargeId: `pix_char_${chargeSequence}`, status: "pending_payment" });
  });

  it("confirms payment only by asking AbacatePay, never from the browser", async () => {
    const { cookie } = await createPixOrder();
    expect((await current(cookie)).status).toBe("pending_payment");
    lastCharge().status = "PAID";
    await new Promise((resolve) => setTimeout(resolve, 2100)); // per-order check throttle
    expect(await current(cookie)).toMatchObject({ status: "paid", paid: true, canSubmitPhotos: true });
  });

  it("marks expired charges as expired", async () => {
    const { cookie } = await createPixOrder();
    lastCharge().status = "EXPIRED";
    expect((await current(cookie)).status).toBe("expired");
  });

  it("rejects webhooks without our secret and never trusts the payload's claims", async () => {
    const { cookie } = await createPixOrder();
    const chargeId = `pix_char_${chargeSequence}`;
    const payload = JSON.stringify({ id: "log_1", event: "transparent.completed", devMode: true, data: { id: chargeId, status: "PAID" } });

    const forged = await routes.webhook(new Request(`${ORIGIN}/api/abacatepay/webhook?webhookSecret=wrong`, { method: "POST", body: payload }));
    expect(forged.status).toBe(403);

    // Right secret, but AbacatePay still says PENDING: nothing is granted.
    const premature = await routes.webhook(new Request(`${ORIGIN}/api/abacatepay/webhook?webhookSecret=${WEBHOOK_SECRET}`, { method: "POST", body: payload }));
    expect(premature.status).toBe(200);
    expect(repo.list().at(-1)!.status).toBe("pending_payment");

    lastCharge().status = "PAID";
    const real = JSON.stringify({ id: "log_2", event: "transparent.completed", devMode: true, data: { id: chargeId } });
    for (let i = 0; i < 2; i++) {
      // Duplicate delivery of the same event: one state change.
      await routes.webhook(new Request(`${ORIGIN}/api/abacatepay/webhook?webhookSecret=${WEBHOOK_SECRET}`, { method: "POST", body: real }));
    }
    expect((await current(cookie)).status).toBe("paid");
  });

  it("sandbox simulation pays through the same confirmation path", async () => {
    const { cookie } = await createPixOrder();
    const response = await routes.simulate(post("/api/dev/pix-simulate", undefined, cookie));
    expect((await response.json()).order).toMatchObject({ status: "paid", paid: true });
  });

  it("never logs the API key", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.stubGlobal("fetch", vi.fn(async () => new Response("boom", { status: 500 })));
    const { response } = await createPixOrder();
    expect(response.status).toBe(503);
    expect(JSON.stringify(errors.mock.calls)).not.toContain(API_KEY);
  });
});
