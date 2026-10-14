// API error contract shared by route handlers and the client (spec §6).
// Every error response has the shape { error: { code, message, retryable } }.

export const API_ERROR_CODES = [
  "PHOTO_REQUIRED",
  "UNSUPPORTED_IMAGE_TYPE",
  "PHOTO_TOO_LARGE",
  "PHOTO_QUALITY_INSUFFICIENT",
  "AGE_RESTRICTED",
  "CONSENT_REQUIRED",
  "ORDER_NOT_PAID",
  "ORDER_SESSION_INVALID",
  "ALREADY_PROCESSING",
  "AI_PROVIDER_FAILED",
  "SIMULATION_QUALITY_FAILED",
  "PDF_GENERATION_FAILED",
  "EMAIL_FAILED",
  "RATE_LIMITED",
  "SERVICE_UNAVAILABLE",
  // Additions beyond the spec list, for request hygiene:
  "INVALID_REQUEST",
  "FORBIDDEN_ORIGIN",
  "NOT_FOUND",
  "ORDER_NOT_RETRYABLE",
  // The report queue (src/server/fulfillment/queue.ts):
  "QUEUE_FULL",
  "FULFILLMENT_INTERRUPTED",
] as const;

export type ApiErrorCode = (typeof API_ERROR_CODES)[number];

export type ApiErrorBody = {
  error: { code: ApiErrorCode; message: string; retryable: boolean };
};

type ErrorSpec = {
  status: number;
  retryable: boolean;
  /** Safe, user-facing default message. Never includes internal details. */
  message: string;
  /** What the interface should offer next. */
  action: "reselect_photo" | "fix_input" | "retry" | "contact_support" | "go_to_checkout" | "restart" | "wait";
};

export const API_ERRORS: Record<ApiErrorCode, ErrorSpec> = {
  PHOTO_REQUIRED: {
    status: 400,
    retryable: true,
    message: "Add a front-facing photo to continue.",
    action: "reselect_photo",
  },
  UNSUPPORTED_IMAGE_TYPE: {
    status: 415,
    retryable: true,
    message: "That file isn't a supported photo. Use a JPEG, PNG or WebP.",
    action: "reselect_photo",
  },
  PHOTO_TOO_LARGE: {
    status: 413,
    retryable: true,
    message: "That photo is too large. Choose a smaller one.",
    action: "reselect_photo",
  },
  PHOTO_QUALITY_INSUFFICIENT: {
    status: 422,
    retryable: true,
    message: "We couldn't use that photo. Try a clearer, well-lit front photo.",
    action: "reselect_photo",
  },
  AGE_RESTRICTED: {
    status: 403,
    retryable: false,
    message: "MXVA is only available to adults aged 18 or over.",
    action: "restart",
  },
  CONSENT_REQUIRED: {
    status: 403,
    retryable: true,
    message: "We need your consent to process your photos before we can continue.",
    action: "fix_input",
  },
  ORDER_NOT_PAID: {
    status: 402,
    retryable: true,
    message: "This order hasn't been paid yet.",
    action: "go_to_checkout",
  },
  ORDER_SESSION_INVALID: {
    status: 401,
    retryable: false,
    message: "We couldn't find your order in this browser. Check your email or contact support.",
    action: "contact_support",
  },
  ALREADY_PROCESSING: {
    status: 409,
    retryable: true,
    message: "Your report is already being made. It arrives by email.",
    action: "wait",
  },
  AI_PROVIDER_FAILED: {
    status: 502,
    retryable: true,
    message: "Our image service didn't respond. You haven't been charged again — try once more.",
    action: "retry",
  },
  SIMULATION_QUALITY_FAILED: {
    status: 422,
    retryable: true,
    message: "The concept image didn't meet our quality bar. Try a different front photo or contact support.",
    action: "reselect_photo",
  },
  PDF_GENERATION_FAILED: {
    status: 500,
    retryable: true,
    message: "We couldn't build your PDF. Try again — there's no second charge.",
    action: "retry",
  },
  EMAIL_FAILED: {
    status: 502,
    retryable: true,
    message: "We couldn't email your report. Create it again — there's no second charge.",
    action: "retry",
  },
  RATE_LIMITED: {
    status: 429,
    retryable: true,
    message: "Too many attempts. Wait a minute and try again.",
    action: "wait",
  },
  SERVICE_UNAVAILABLE: {
    status: 503,
    retryable: true,
    message: "This service isn't available right now. Please try again later.",
    action: "retry",
  },
  INVALID_REQUEST: {
    status: 400,
    retryable: false,
    message: "Something in that request wasn't right. Refresh and try again.",
    action: "fix_input",
  },
  FORBIDDEN_ORIGIN: {
    status: 403,
    retryable: false,
    message: "This request wasn't allowed.",
    action: "restart",
  },
  NOT_FOUND: { status: 404, retryable: false, message: "Not found.", action: "restart" },
  ORDER_NOT_RETRYABLE: {
    status: 409,
    retryable: false,
    message: "This order can't be retried automatically. Contact support and we'll sort it out.",
    action: "contact_support",
  },
  QUEUE_FULL: {
    status: 503,
    retryable: true,
    message: "We're making a lot of reports right now. Try again in a few minutes — your payment is safe.",
    action: "retry",
  },
  FULFILLMENT_INTERRUPTED: {
    status: 503,
    retryable: true,
    message: "Your report was interrupted on our side. Create it again — there's no second charge.",
    action: "retry",
  },
};

export function isApiErrorBody(value: unknown): value is ApiErrorBody {
  if (typeof value !== "object" || value === null || !("error" in value)) return false;
  const error = (value as { error: unknown }).error;
  return (
    typeof error === "object" &&
    error !== null &&
    typeof (error as { code?: unknown }).code === "string" &&
    (API_ERROR_CODES as readonly string[]).includes((error as { code: string }).code)
  );
}
