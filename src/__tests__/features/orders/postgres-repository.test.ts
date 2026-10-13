import { randomUUID } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PostgresOrderRepository } from "@/features/orders/postgres-repository";
import type { Order, OrderEvent } from "@/features/orders/states";

/**
 * Contract test against a real Postgres. Opt-in: TEST_DATABASE_URL=postgres://… npm test
 * Runs in a throwaway schema (migrations applied there, dropped afterwards), so it can point
 * at any database without touching its tables.
 */
const url = process.env.TEST_DATABASE_URL;
const schema = `mxva_test_${randomUUID().replaceAll("-", "").slice(0, 12)}`;
const migrations = path.join(__dirname, "../../../../db/migrations");

const scoped = () => {
  const scopedUrl = new URL(url!);
  scopedUrl.searchParams.set("options", `-c search_path=${schema}`);
  return scopedUrl.toString();
};

const order = (overrides: Partial<Order> = {}): Order => ({
  id: randomUUID(),
  version: 1,
  paymentMode: "abacatepay",
  stripeCheckoutSessionId: null,
  stripePaymentIntentId: null,
  providerChargeId: `pix_char_${randomUUID()}`,
  chargeExpiresAt: "2026-10-12T10:30:00.000Z",
  email: "pg.contract@example.com",
  currency: "brl",
  amountMinor: 4799,
  countryHint: "BR",
  priceVariant: "brl_4799",
  status: "pending_payment",
  consentVersion: "2026-10-11.v1",
  termsVersion: "2026-10-11.v1",
  marketingOptIn: false,
  createdAt: "2026-10-12T10:00:00.000Z",
  paidAt: null,
  fulfillmentAttempts: 0,
  processingStartedAt: null,
  emailProviderMessageId: null,
  lastFailureCode: null,
  fulfillmentVersion: "report-v1",
  completedAt: null,
  refundedAt: null,
  ...overrides,
});

const created: OrderEvent = { type: "created", from: null, to: "pending_payment", at: "2026-10-12T10:00:00.000Z" };
const paidEvent: OrderEvent = { type: "payment_succeeded", from: "pending_payment", to: "paid", at: "2026-10-12T10:01:00.000Z" };

describe.skipIf(!url)("PostgresOrderRepository on a real database", () => {
  let admin: pg.Client;
  let repository: PostgresOrderRepository;

  beforeAll(async () => {
    admin = new pg.Client({ connectionString: url });
    await admin.connect();
    await admin.query(`create schema ${schema}`);
    await admin.query(`set search_path to ${schema}`);
    for (const file of readdirSync(migrations).filter((name) => name.endsWith(".sql")).sort()) {
      await admin.query(readFileSync(path.join(migrations, file), "utf8"));
    }
    repository = new PostgresOrderRepository(scoped());
  });

  afterAll(async () => {
    await repository?.close();
    await admin?.query(`drop schema if exists ${schema} cascade`);
    await admin?.end();
  });

  it("stores and reads back every field (Pix in reais and card in dollars)", async () => {
    const pix = order();
    const card = order({
      paymentMode: "stripe",
      providerChargeId: null,
      chargeExpiresAt: null,
      stripeCheckoutSessionId: `cs_test_${randomUUID()}`,
      currency: "usd",
      amountMinor: 2900,
      priceVariant: "usd_29",
      countryHint: null,
    });
    await repository.create(pix, created);
    await repository.create(card, created);
    expect(await repository.findById(pix.id)).toEqual(pix);
    expect(await repository.findByProviderChargeId(pix.providerChargeId!)).toEqual(pix);
    expect(await repository.findByCheckoutSessionId(card.stripeCheckoutSessionId!)).toEqual(card);
  });

  it("saves only with the expected version (compare-and-set), one winner under concurrency", async () => {
    const pending = order();
    await repository.create(pending, created);
    const paid = { ...pending, version: 2, status: "paid" as const, paidAt: "2026-10-12T10:01:00.000Z", stripePaymentIntentId: `pi_${randomUUID()}` };
    const results = await Promise.all([repository.save(paid, 1, paidEvent), repository.save({ ...paid, lastFailureCode: "X" }, 1, paidEvent)]);
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(await repository.save(paid, 1, paidEvent)).toBe(false);
    expect(await repository.findByPaymentIntentId(paid.stripePaymentIntentId)).toMatchObject({ status: "paid", version: 2 });
  });

  it("refreshes a running fulfilment's claim without a new version, and only while processing", async () => {
    const running = { ...order(), status: "processing" as const, processingStartedAt: "2026-10-12T10:00:00.000Z" };
    await repository.create(running, created);
    await repository.touchProcessing(running.id, new Date("2026-10-12T10:00:40.000Z"));
    expect(await repository.findById(running.id)).toMatchObject({ processingStartedAt: "2026-10-12T10:00:40.000Z", version: running.version });
    const idle = order();
    await repository.create(idle, created);
    await repository.touchProcessing(idle.id, new Date("2026-10-12T10:00:40.000Z"));
    expect((await repository.findById(idle.id))?.processingStartedAt).toBeNull();
  });

  it("records each provider event once", async () => {
    const id = `evt_${randomUUID()}`;
    expect(await repository.markExternalEvent("stripe", id)).toBe(true);
    expect(await repository.markExternalEvent("stripe", id)).toBe(false);
    expect(await repository.hasExternalEvent("stripe", id)).toBe(true);
    expect(await repository.hasExternalEvent("abacatepay", id)).toBe(false);
  });

  it("refuses a second order for the same Pix charge", async () => {
    const first = order();
    await repository.create(first, created);
    await expect(repository.create(order({ providerChargeId: first.providerChargeId }), created)).rejects.toThrow();
  });

  it("keeps orders across a server restart (a new connection pool)", async () => {
    const kept = order();
    await repository.create(kept, created);
    const restarted = new PostgresOrderRepository(scoped());
    try {
      expect(await restarted.findById(kept.id)).toEqual(kept);
    } finally {
      await restarted.close();
    }
  });
});
