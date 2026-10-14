import "server-only";
import { isProductionBuild } from "@/lib/config";
import { serverEnv } from "@/server/config";
import { ApiError } from "@/server/http";
import type { Order, OrderEvent } from "./states";

export type PaymentProviderName = "stripe" | "abacatepay" | "mock";

/**
 * Order metadata storage. Implementations store ONLY the fields of `Order` and
 * minimal transition events: never images, generated portraits, face descriptions,
 * report contents or embeddings.
 */
export interface OrderRepository {
  readonly kind: "memory" | "postgres";
  create(order: Order, event: OrderEvent): Promise<void>;
  findById(id: string): Promise<Order | undefined>;
  findByCheckoutSessionId(sessionId: string): Promise<Order | undefined>;
  findByPaymentIntentId(paymentIntentId: string): Promise<Order | undefined>;
  findByProviderChargeId(chargeId: string): Promise<Order | undefined>;
  /** Compare-and-set: writes only if the stored version equals `expectedVersion`. */
  save(order: Order, expectedVersion: number, event: OrderEvent): Promise<boolean>;
  /** Heartbeat of queued or running reports: refreshes their claims. No state change, no new version. */
  touchProcessing(orderIds: readonly string[], at: Date): Promise<void>;
  /** Orders still "processing" whose claim nobody has refreshed since `before` (their server stopped). */
  findStaleProcessing(before: Date, limit: number): Promise<Order[]>;
  /** Records an external (webhook) event id. Returns false when it was already recorded. */
  markExternalEvent(provider: PaymentProviderName, eventId: string): Promise<boolean>;
  hasExternalEvent(provider: PaymentProviderName, eventId: string): Promise<boolean>;
}

export class InMemoryOrderRepository implements OrderRepository {
  readonly kind = "memory" as const;
  private orders = new Map<string, Order>();
  private events: (OrderEvent & { orderId: string })[] = [];
  private external = new Set<string>();

  async create(order: Order, event: OrderEvent): Promise<void> {
    if (this.orders.has(order.id)) throw new Error("Duplicate order id");
    this.orders.set(order.id, { ...order });
    this.events.push({ ...event, orderId: order.id });
  }

  async findById(id: string): Promise<Order | undefined> {
    const order = this.orders.get(id);
    return order ? { ...order } : undefined;
  }

  async findByCheckoutSessionId(sessionId: string): Promise<Order | undefined> {
    for (const order of this.orders.values()) if (order.stripeCheckoutSessionId === sessionId) return { ...order };
    return undefined;
  }

  async findByPaymentIntentId(paymentIntentId: string): Promise<Order | undefined> {
    for (const order of this.orders.values()) if (order.stripePaymentIntentId === paymentIntentId) return { ...order };
    return undefined;
  }

  async findByProviderChargeId(chargeId: string): Promise<Order | undefined> {
    for (const order of this.orders.values()) if (order.providerChargeId === chargeId) return { ...order };
    return undefined;
  }

  async save(order: Order, expectedVersion: number, event: OrderEvent): Promise<boolean> {
    // Synchronous check-and-set: atomic within one Node process.
    const current = this.orders.get(order.id);
    if (!current || current.version !== expectedVersion) return false;
    this.orders.set(order.id, { ...order });
    this.events.push({ ...event, orderId: order.id });
    return true;
  }

  async touchProcessing(orderIds: readonly string[], at: Date): Promise<void> {
    for (const orderId of orderIds) {
      const current = this.orders.get(orderId);
      if (current?.status === "processing") this.orders.set(orderId, { ...current, processingStartedAt: at.toISOString() });
    }
  }

  async findStaleProcessing(before: Date, limit: number): Promise<Order[]> {
    return [...this.orders.values()]
      .filter((order) => order.status === "processing" && Date.parse(order.processingStartedAt ?? order.createdAt) < before.getTime())
      .slice(0, limit)
      .map((order) => ({ ...order }));
  }

  async markExternalEvent(provider: PaymentProviderName, eventId: string): Promise<boolean> {
    const key = `${provider}:${eventId}`;
    if (this.external.has(key)) return false;
    this.external.add(key);
    return true;
  }

  async hasExternalEvent(provider: PaymentProviderName, eventId: string): Promise<boolean> {
    return this.external.has(`${provider}:${eventId}`);
  }

  /** Test/diagnostic view of stored orders. */
  list(): Order[] {
    return [...this.orders.values()].map((order) => ({ ...order }));
  }

  /** Test/diagnostic view of recorded transitions. */
  eventsFor(orderId: string): OrderEvent[] {
    return this.events
      .filter((event) => event.orderId === orderId)
      .map(({ type, from, to, at }) => ({ type, from, to, at }));
  }
}

const globalRepos = globalThis as unknown as { __mxvaOrderRepository?: OrderRepository };

/**
 * Postgres when DATABASE_URL is set; the in-memory store in development and tests.
 * Production without a database fails closed: orders can't be recovered otherwise.
 */
export async function orderRepository(): Promise<OrderRepository> {
  if (globalRepos.__mxvaOrderRepository) return globalRepos.__mxvaOrderRepository;
  const databaseUrl = serverEnv().DATABASE_URL;
  if (databaseUrl) {
    const { PostgresOrderRepository } = await import("./postgres-repository");
    globalRepos.__mxvaOrderRepository = new PostgresOrderRepository(databaseUrl);
  } else if (isProductionBuild) {
    throw new ApiError("SERVICE_UNAVAILABLE");
  } else {
    globalRepos.__mxvaOrderRepository = new InMemoryOrderRepository();
  }
  return globalRepos.__mxvaOrderRepository;
}

/** Test hook. */
export function setOrderRepositoryForTests(repository: OrderRepository | undefined): void {
  globalRepos.__mxvaOrderRepository = repository;
}
