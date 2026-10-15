import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  connection: async () => undefined,
}));

/**
 * Card payments through Stripe Checkout Sessions, end to end through the route handlers,
 * with the Stripe SDK replaced by an in-test fake. Confirmation comes from retrieving the
 * session server-side (no webhook needed), and never from the browser.
 */

type FakeSession = {
  id: string;
  object: "checkout.session";
  status: "open" | "complete" | "expired";
  payment_status: "unpaid" | "paid";
  amount_total: number;
  currency: string;
  client_reference_id: string | null;
  metadata: Record<string, string>;
  payment_intent: string | null;
  currency_conversion: { amount_total: number; source_currency: string } | null;
  client_secret: string;
};

const stripeFake = vi.hoisted(() => ({
  sessions: new Map<string, FakeSession>(),
  creates: [] as { params: Record<string, unknown>; options: Record<string, unknown> | undefined }[],
  expired: [] as string[],
  sequence: 0,
}));

vi.mock("stripe", () => {
  class FakeStripe {
    checkout = {
      sessions: {
        create: async (params: Record<string, unknown>, options?: Record<string, unknown>) => {
          stripeFake.creates.push({ params, options });
          const lineItems = params.line_items as { price_data: { currency: string; unit_amount: number } }[];
          const id = `cs_test_fake_${++stripeFake.sequence}`;
          const session: FakeSession = {
            id,
            object: "checkout.session",
            status: "open",
            payment_status: "unpaid",
            amount_total: lineItems[0]!.price_data.unit_amount,
            currency: lineItems[0]!.price_data.currency,
            client_reference_id: params.client_reference_id as string,
            metadata: params.metadata as Record<string, string>,
            payment_intent: null,
            currency_conversion: null,
            client_secret: `${id}_secret_fake`,
          };
          stripeFake.sessions.set(id, session);
          return structuredClone(session);
        },
        retrieve: async (id: string) => {
          const session = stripeFake.sessions.get(id);
          if (!session) throw new Error("No such checkout session");
          return structuredClone(session);
        },
        expire: async (id: string) => {
          const session = stripeFake.sessions.get(id);
          if (!session || session.status !== "open") throw new Error("Only open sessions can be expired");
          stripeFake.expired.push(id);
          session.status = "expired";
          return structuredClone(session);
        },
      },
    };
    webhooks = {
      constructEvent: () => {
        throw new Error("not used here");
      },
    };
  }
  return { default: FakeStripe };
});

const ORIGIN = "http://localhost:3000";
const saved: Record<string, string | undefined> = {};
const ENV = {
  NEXT_PUBLIC_ENABLE_REAL_PAYMENTS: "true",
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: "pk_test_unit",
  STRIPE_SECRET_KEY: "sk_test_unit",
};

const orderBody = {
  sku: "mxva_report_v1",
  method: "card",
  email: "card.buyer@example.com",
  adultConfirmed: true,
  faceProcessingConsentVersion: "2026-10-13.v1",
  termsVersion: "2026-10-11.v1",
  marketingOptIn: false,
  countryHint: "US",
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
  options: (r?: Request) => Promise<Response>;
};
let repo: { list(): { id: string; stripeCheckoutSessionId: string | null; currency: string; amountMinor: number; status: string; paymentMode: string }[] };
let clearThrottle: () => void;

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
  clearThrottle = (await import("@/features/orders/service")).clearPaymentCheckThrottle;
  routes = {
    createOrder: (await import("@/app/api/orders/route")).POST,
    current: (await import("@/app/api/orders/current/route")).GET,
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
  stripeFake.creates.length = 0;
  stripeFake.expired.length = 0;
  vi.spyOn(console, "info").mockImplementation(() => undefined);
  (await import("@/server/security/rate-limit")).resetRateLimitsForTests();
});

async function createCardOrder(cookie?: string) {
  const response = await routes.createOrder(post("/api/orders", orderBody, cookie));
  const setCookie = (response.headers.get("set-cookie") ?? "").split(";")[0]!;
  return { response, cookie: setCookie || cookie || "", body: await response.json() };
}

async function current(cookie: string) {
  clearThrottle();
  return (await routes.current(new Request(`${ORIGIN}/api/orders/current`, { headers: { cookie } }))).json();
}

const lastSession = () => stripeFake.sessions.get(`cs_test_fake_${stripeFake.sequence}`)!;

describe("card checkout (Stripe test mode, faked SDK)", () => {
  it("offers card in dollars; Pix stays simulated in development without an AbacatePay key", async () => {
    const { offers } = await (await routes.options()).json();
    expect(offers).toEqual([
      { method: "pix", price: { amountMinor: 4799, currency: "brl" }, sandbox: true, simulated: true },
      { method: "card", price: { amountMinor: 2900, currency: "usd" }, sandbox: true, simulated: false },
    ]);
  });

  it("prices the card in reais for visitors in Brazil, like Pix", async () => {
    const { offers } = await (await routes.options(new Request(`${ORIGIN}/api/checkout/options?region=BR`))).json();
    expect(offers).toContainEqual({ method: "card", price: { amountMinor: 4799, currency: "brl" }, sandbox: true, simulated: false });
    const junk = await (await routes.options(new Request(`${ORIGIN}/api/checkout/options?region=brazil`))).json();
    expect(junk.offers).toContainEqual({ method: "card", price: { amountMinor: 2900, currency: "usd" }, sandbox: true, simulated: false });
  });

  it("charges a card from Brazil in reais, with no currency conversion at payment", async () => {
    const response = await routes.createOrder(post("/api/orders", { ...orderBody, countryHint: "BR" }));
    expect((await response.json()).price).toEqual({ amountMinor: 4799, currency: "brl" });
    const { params } = stripeFake.creates.at(-1)!;
    expect(params).toMatchObject({
      line_items: [{ quantity: 1, price_data: { currency: "brl", unit_amount: 4799 } }],
      adaptive_pricing: { enabled: false },
    });
    expect(repo.list().at(-1)).toMatchObject({ currency: "brl", amountMinor: 4799 });
  });

  it("opens an embedded Checkout Session priced by the server", async () => {
    const { response, body } = await createCardOrder();
    expect(response.status).toBe(201);
    expect(body.checkout).toEqual({ mode: "stripe", clientSecret: expect.stringContaining("_secret_") });
    expect(body.price).toEqual({ amountMinor: 2900, currency: "usd" });

    const stored = repo.list().at(-1)!;
    const { params, options } = stripeFake.creates.at(-1)!;
    expect(params).toMatchObject({
      ui_mode: "elements",
      mode: "payment",
      client_reference_id: stored.id,
      customer_email: "card.buyer@example.com",
      line_items: [{ quantity: 1, price_data: { currency: "usd", unit_amount: 2900 } }],
      metadata: { order_id: stored.id },
    });
    expect(options).toEqual({ idempotencyKey: `checkout-${stored.id}` });
    expect(stored).toMatchObject({ paymentMode: "stripe", stripeCheckoutSessionId: lastSession().id, status: "pending_payment" });
  });

  it("confirms payment by retrieving the session, never from the browser", async () => {
    const { cookie } = await createCardOrder();
    expect((await current(cookie)).order.status).toBe("pending_payment");
    Object.assign(lastSession(), { status: "complete", payment_status: "paid", payment_intent: "pi_fake_1" });
    expect((await current(cookie)).order).toMatchObject({ status: "paid", paid: true, canSubmitPhotos: true });
  });

  it("accepts Adaptive Pricing: the buyer paid in local currency, the source amount matches", async () => {
    const { cookie } = await createCardOrder();
    Object.assign(lastSession(), {
      status: "complete",
      payment_status: "paid",
      currency: "brl",
      amount_total: 16_244,
      currency_conversion: { amount_total: 2900, source_currency: "usd" },
    });
    expect((await current(cookie)).order.status).toBe("paid");
  });

  it("never grants a report for a payment that doesn't match the price", async () => {
    const { cookie } = await createCardOrder();
    Object.assign(lastSession(), { status: "complete", payment_status: "paid", amount_total: 100 });
    expect((await current(cookie)).order).toMatchObject({ status: "needs_support", canSubmitPhotos: false });
  });

  it("marks an expired session as expired", async () => {
    const { cookie } = await createCardOrder();
    lastSession().status = "expired";
    expect((await current(cookie)).order.status).toBe("expired");
  });

  it("closes the open card session when the buyer switches to Pix", async () => {
    const { cookie } = await createCardOrder();
    const cardSession = lastSession().id;
    clearThrottle();
    const switched = await routes.createOrder(post("/api/orders", { ...orderBody, method: "pix" }, cookie));
    expect(switched.status).toBe(201);
    expect((await switched.json()).checkout).toMatchObject({ mode: "pix", simulated: true });
    expect(stripeFake.expired).toEqual([cardSession]);
  });

  it("never opens a second checkout when the first one was just paid", async () => {
    const { cookie } = await createCardOrder();
    Object.assign(lastSession(), { status: "complete", payment_status: "paid" });
    clearThrottle();
    const { body } = await createCardOrder(cookie);
    expect(body).toMatchObject({ alreadyPaid: true, order: { status: "paid" } });
    expect(stripeFake.creates).toHaveLength(1);
  });
});
