import { API_ERRORS, isApiErrorBody, type ApiErrorCode } from "./api-errors";
import type { PublicOrderStatus } from "@/features/orders/states";

/** Browser-side client for MXVA's own API. Every call is same-origin with the CSRF header. */

export class ApiClientError extends Error {
  override readonly name = "ApiClientError";
  constructor(
    readonly code: ApiErrorCode,
    message: string,
    readonly retryable: boolean,
    readonly status: number,
  ) {
    super(message);
  }
}

const BASE_HEADERS = { "x-mxva-request": "1" } as const;

async function toError(response: Response): Promise<ApiClientError> {
  try {
    const body: unknown = await response.json();
    if (isApiErrorBody(body)) {
      return new ApiClientError(body.error.code, body.error.message, body.error.retryable, response.status);
    }
  } catch {
    // fall through
  }
  const code: ApiErrorCode = response.status === 429 ? "RATE_LIMITED" : "SERVICE_UNAVAILABLE";
  return new ApiClientError(code, API_ERRORS[code].message, true, response.status);
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      ...init,
      credentials: "same-origin",
      cache: "no-store",
      headers: { ...BASE_HEADERS, ...(init.body && !(init.body instanceof FormData) ? { "content-type": "application/json" } : {}), ...init.headers },
    });
  } catch {
    throw new ApiClientError("SERVICE_UNAVAILABLE", "You seem to be offline. Check your connection and try again.", true, 0);
  }
  if (!response.ok) throw await toError(response);
  return (await response.json()) as T;
}

export type PaymentMethod = "pix" | "card";
export type Price = { amountMinor: number; currency: "usd" | "brl" };

export type CheckoutOffer = { method: PaymentMethod; price: Price; sandbox: boolean; simulated: boolean };

export type PixCheckout = {
  mode: "pix";
  /** PIX "copia e cola" code. Meant to be copied; not secret. The QR code is drawn from it. */
  brCode: string;
  expiresAt: string;
  sandbox: boolean;
  simulated: boolean;
  /** The server allows "Simulate Pix payment" (development or staging sandbox). */
  canSimulate: boolean;
};

export type PublicCheckout = { mode: "mock" } | { mode: "stripe"; clientSecret: string } | PixCheckout;

export type CreateOrderBody = {
  sku: "mxva_report_v1";
  method: PaymentMethod;
  email: string;
  adultConfirmed: boolean;
  faceProcessingConsentVersion: string;
  termsVersion: string;
  marketingOptIn: boolean;
  countryHint?: string;
};

export type CreateOrderResponse =
  | { alreadyPaid: true; order: PublicOrderStatus }
  | {
      alreadyPaid: false;
      order: PublicOrderStatus;
      checkout: PublicCheckout;
      price: Price;
    };

export type CurrentOrderResponse = {
  order: PublicOrderStatus;
  /** Set while the order waits for payment. */
  pending: { method: PaymentMethod; expiresAt: string | null } | null;
};

/** The buyer's place in the report queue, and when the email should arrive. */
export type QueueTicket = { position: number; etaMinutes: number };

export type FulfillResponse = { order: PublicOrderStatus; queue: QueueTicket };

export const api = {
  createOrder: (body: CreateOrderBody) =>
    request<CreateOrderResponse>("/api/orders", { method: "POST", body: JSON.stringify(body) }),

  currentOrder: () => request<CurrentOrderResponse>("/api/orders/current"),

  /** `region` (from the device's time zone and languages) prices the card in reais for Brazil. */
  checkoutOptions: (region?: string) =>
    request<{ offers: CheckoutOffer[] }>(region === "BR" ? "/api/checkout/options?region=BR" : "/api/checkout/options"),

  /** Development + AbacatePay sandbox only: asks the sandbox to pay this order's PIX charge. */
  pixSimulate: () => request<{ order: PublicOrderStatus }>("/api/dev/pix-simulate", { method: "POST" }),

  mockPay: (outcome: "succeeded" | "declined" | "expired") =>
    request<{ order: PublicOrderStatus }>("/api/dev/mock-pay", { method: "POST", body: JSON.stringify({ outcome }) }),

  requestRetry: () => request<{ order: PublicOrderStatus }>("/api/fulfill/retry", { method: "POST" }),

  withdrawConsent: () =>
    request<{ withdrawn: boolean; order: PublicOrderStatus }>("/api/consent/withdraw", { method: "POST" }),

  /** Sends the photo; the server queues the report and answers at once. The report arrives by email. */
  fulfill: (form: FormData) => request<FulfillResponse>("/api/fulfill", { method: "POST", body: form }),
};
