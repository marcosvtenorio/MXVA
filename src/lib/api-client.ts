import { API_ERRORS, isApiErrorBody, type ApiErrorCode } from "./api-errors";
import type { PublicOrderStatus } from "@/features/orders/states";
import type { PaidReport } from "@/features/report/schema";

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

/**
 * The report stream broke after the server took the order (a network change, a deploy). The
 * server keeps working and emails the report, so the page follows the order instead of failing.
 */
export class ConnectionLostError extends Error {
  override readonly name = "ConnectionLostError";
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

export type FulfillmentPhase = "analysing_photo" | "preparing_image" | "checking_image" | "building_report" | "sending_email";

export type FulfillmentResult = {
  report: PaidReport;
  image: { mime: "image/jpeg"; base64: string };
  pdf: { filename: string; base64: string };
  emailDelivered: boolean;
};

type StreamLine =
  | { type: "phase"; phase: FulfillmentPhase }
  | ({ type: "result" } & FulfillmentResult)
  | { type: "error"; error: { code: ApiErrorCode; message: string; retryable: boolean } };

/** Reads newline-delimited JSON as it streams, reporting real server phases. */
async function readFulfillmentStream(
  response: Response,
  onPhase: (phase: FulfillmentPhase) => void,
): Promise<FulfillmentResult> {
  if (!response.body) throw new ApiClientError("SERVICE_UNAVAILABLE", API_ERRORS.SERVICE_UNAVAILABLE.message, true, response.status);
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    let chunk: ReadableStreamReadResult<Uint8Array>;
    try {
      chunk = await reader.read();
    } catch {
      throw new ConnectionLostError("The connection dropped while your report was being made.");
    }
    const { done, value } = chunk;
    buffer += decoder.decode(value, { stream: !done });
    let newline = buffer.indexOf("\n");
    while (newline >= 0) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      newline = buffer.indexOf("\n");
      if (!line) continue;
      const message = JSON.parse(line) as StreamLine;
      if (message.type === "phase") onPhase(message.phase);
      else if (message.type === "error") {
        const status = API_ERRORS[message.error.code]?.status ?? 500;
        throw new ApiClientError(message.error.code, message.error.message, message.error.retryable, status);
      } else {
        return { report: message.report, image: message.image, pdf: message.pdf, emailDelivered: message.emailDelivered };
      }
    }
    if (done) break;
  }
  // The connection ended without a result: the server may still finish and email it.
  throw new ConnectionLostError("The connection ended before your report arrived.");
}

export const api = {
  createOrder: (body: CreateOrderBody) =>
    request<CreateOrderResponse>("/api/orders", { method: "POST", body: JSON.stringify(body) }),

  currentOrder: () => request<CurrentOrderResponse>("/api/orders/current"),

  checkoutOptions: () => request<{ offers: CheckoutOffer[] }>("/api/checkout/options"),

  /** Development + AbacatePay sandbox only: asks the sandbox to pay this order's PIX charge. */
  pixSimulate: () => request<{ order: PublicOrderStatus }>("/api/dev/pix-simulate", { method: "POST" }),

  mockPay: (outcome: "succeeded" | "declined" | "expired") =>
    request<{ order: PublicOrderStatus }>("/api/dev/mock-pay", { method: "POST", body: JSON.stringify({ outcome }) }),

  requestRetry: () => request<{ order: PublicOrderStatus }>("/api/fulfill/retry", { method: "POST" }),

  withdrawConsent: () =>
    request<{ withdrawn: boolean; order: PublicOrderStatus }>("/api/consent/withdraw", { method: "POST" }),

  async fulfill(form: FormData, onPhase: (phase: FulfillmentPhase) => void): Promise<FulfillmentResult> {
    let response: Response;
    try {
      response = await fetch("/api/fulfill", {
        method: "POST",
        body: form,
        credentials: "same-origin",
        cache: "no-store",
        headers: BASE_HEADERS,
      });
    } catch {
      throw new ApiClientError("SERVICE_UNAVAILABLE", "You seem to be offline. Your payment is safe — try again when you're back online.", true, 0);
    }
    if (!response.ok) throw await toError(response);
    return readFulfillmentStream(response, onPhase);
  },
};
