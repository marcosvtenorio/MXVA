import "server-only";
import { Pool, type PoolClient } from "pg";
import type { OrderRepository, PaymentProviderName } from "./repository";
import type { Order, OrderEvent, OrderStatus } from "./states";

type OrderRow = {
  id: string;
  version: number;
  payment_mode: "mock" | "stripe" | "abacatepay";
  stripe_checkout_session_id: string | null;
  stripe_payment_intent_id: string | null;
  provider_charge_id: string | null;
  charge_expires_at: Date | null;
  email: string;
  currency: "usd" | "brl";
  amount_minor: number;
  country_hint: string | null;
  price_variant: string;
  status: OrderStatus;
  consent_version: string;
  terms_version: string;
  marketing_opt_in: boolean;
  created_at: Date;
  paid_at: Date | null;
  fulfillment_attempts: number;
  processing_started_at: Date | null;
  email_provider_message_id: string | null;
  last_failure_code: string | null;
  fulfillment_version: string;
  completed_at: Date | null;
  refunded_at: Date | null;
};

const iso = (value: Date | null) => (value ? value.toISOString() : null);

function fromRow(row: OrderRow): Order {
  return {
    id: row.id,
    version: row.version,
    paymentMode: row.payment_mode,
    stripeCheckoutSessionId: row.stripe_checkout_session_id,
    stripePaymentIntentId: row.stripe_payment_intent_id,
    providerChargeId: row.provider_charge_id,
    chargeExpiresAt: iso(row.charge_expires_at),
    email: row.email,
    currency: row.currency,
    amountMinor: row.amount_minor,
    countryHint: row.country_hint,
    priceVariant: row.price_variant,
    status: row.status,
    consentVersion: row.consent_version,
    termsVersion: row.terms_version,
    marketingOptIn: row.marketing_opt_in,
    createdAt: row.created_at.toISOString(),
    paidAt: iso(row.paid_at),
    fulfillmentAttempts: row.fulfillment_attempts,
    processingStartedAt: iso(row.processing_started_at),
    emailProviderMessageId: row.email_provider_message_id,
    lastFailureCode: row.last_failure_code,
    fulfillmentVersion: row.fulfillment_version,
    completedAt: iso(row.completed_at),
    refundedAt: iso(row.refunded_at),
  };
}

const COLUMNS = [
  "id",
  "version",
  "payment_mode",
  "stripe_checkout_session_id",
  "stripe_payment_intent_id",
  "provider_charge_id",
  "charge_expires_at",
  "email",
  "currency",
  "amount_minor",
  "country_hint",
  "price_variant",
  "status",
  "consent_version",
  "terms_version",
  "marketing_opt_in",
  "created_at",
  "paid_at",
  "fulfillment_attempts",
  "processing_started_at",
  "email_provider_message_id",
  "last_failure_code",
  "fulfillment_version",
  "completed_at",
  "refunded_at",
] as const;

function values(order: Order): unknown[] {
  return [
    order.id,
    order.version,
    order.paymentMode,
    order.stripeCheckoutSessionId,
    order.stripePaymentIntentId,
    order.providerChargeId,
    order.chargeExpiresAt,
    order.email,
    order.currency,
    order.amountMinor,
    order.countryHint,
    order.priceVariant,
    order.status,
    order.consentVersion,
    order.termsVersion,
    order.marketingOptIn,
    order.createdAt,
    order.paidAt,
    order.fulfillmentAttempts,
    order.processingStartedAt,
    order.emailProviderMessageId,
    order.lastFailureCode,
    order.fulfillmentVersion,
    order.completedAt,
    order.refundedAt,
  ];
}

export class PostgresOrderRepository implements OrderRepository {
  readonly kind = "postgres" as const;
  private pool: Pool;

  constructor(connectionString: string) {
    this.pool = new Pool({ connectionString, max: 5, idleTimeoutMillis: 30_000, statement_timeout: 10_000 });
  }

  private async inTransaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const result = await work(client);
      await client.query("commit");
      return result;
    } catch (error) {
      await client.query("rollback").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  private static async insertEvent(client: PoolClient, orderId: string, event: OrderEvent): Promise<void> {
    await client.query(
      "insert into order_events (order_id, type, from_status, to_status, created_at) values ($1, $2, $3, $4, $5)",
      [orderId, event.type, event.from, event.to, event.at],
    );
  }

  async create(order: Order, event: OrderEvent): Promise<void> {
    const placeholders = COLUMNS.map((_, i) => `$${i + 1}`).join(", ");
    await this.inTransaction(async (client) => {
      await client.query(`insert into orders (${COLUMNS.join(", ")}) values (${placeholders})`, values(order));
      await PostgresOrderRepository.insertEvent(client, order.id, event);
    });
  }

  private async findOne(column: string, value: string): Promise<Order | undefined> {
    const { rows } = await this.pool.query<OrderRow>(`select ${COLUMNS.join(", ")} from orders where ${column} = $1`, [value]);
    return rows[0] ? fromRow(rows[0]) : undefined;
  }

  findById(id: string) {
    return this.findOne("id", id);
  }

  findByCheckoutSessionId(sessionId: string) {
    return this.findOne("stripe_checkout_session_id", sessionId);
  }

  findByPaymentIntentId(paymentIntentId: string) {
    return this.findOne("stripe_payment_intent_id", paymentIntentId);
  }

  findByProviderChargeId(chargeId: string) {
    return this.findOne("provider_charge_id", chargeId);
  }

  async save(order: Order, expectedVersion: number, event: OrderEvent): Promise<boolean> {
    const assignments = COLUMNS.slice(1).map((column, i) => `${column} = $${i + 2}`).join(", ");
    return this.inTransaction(async (client) => {
      const result = await client.query(
        `update orders set ${assignments}, updated_at = now() where id = $1 and version = $${COLUMNS.length + 1}`,
        [...values(order), expectedVersion],
      );
      if (result.rowCount !== 1) return false;
      await PostgresOrderRepository.insertEvent(client, order.id, event);
      return true;
    });
  }

  /** Closes the connection pool (graceful shutdown, tests). */
  async close(): Promise<void> {
    await this.pool.end();
  }

  async touchProcessing(orderId: string, at: Date): Promise<void> {
    await this.pool.query("update orders set processing_started_at = $2 where id = $1 and status = 'processing'", [orderId, at.toISOString()]);
  }

  async markExternalEvent(provider: PaymentProviderName, eventId: string): Promise<boolean> {
    const result = await this.pool.query(
      "insert into processed_webhook_events (provider, event_id) values ($1, $2) on conflict do nothing",
      [provider, eventId],
    );
    return result.rowCount === 1;
  }

  async hasExternalEvent(provider: PaymentProviderName, eventId: string): Promise<boolean> {
    const { rowCount } = await this.pool.query(
      "select 1 from processed_webhook_events where provider = $1 and event_id = $2",
      [provider, eventId],
    );
    return (rowCount ?? 0) > 0;
  }
}
