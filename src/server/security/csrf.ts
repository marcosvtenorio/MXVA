import "server-only";
import { publicConfig } from "@/lib/config";
import { ApiError } from "../http";

/** Every first-party state-changing fetch sends this header (see src/lib/api-client.ts). */
export const CSRF_HEADER = "x-mxva-request";
export const CSRF_HEADER_VALUE = "1";

function allowedOrigins(request: Request): Set<string> {
  const origins = new Set<string>([new URL(publicConfig.appUrl).origin]);
  try {
    origins.add(new URL(request.url).origin);
  } catch {
    // ignore malformed request URLs
  }
  return origins;
}

/**
 * CSRF defence for cookie-authenticated POSTs:
 *  1. a custom header, which cross-site forms cannot send and cross-site fetches
 *     cannot send without a CORS preflight (we never answer preflights), and
 *  2. a same-origin Origin (or Sec-Fetch-Site) check.
 * Combined with SameSite=Lax cookies.
 */
export function assertSameOriginRequest(request: Request): void {
  if (request.headers.get(CSRF_HEADER) !== CSRF_HEADER_VALUE) throw new ApiError("FORBIDDEN_ORIGIN");

  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite && fetchSite !== "same-origin" && fetchSite !== "none") throw new ApiError("FORBIDDEN_ORIGIN");

  const origin = request.headers.get("origin");
  if (origin) {
    if (!allowedOrigins(request).has(origin)) throw new ApiError("FORBIDDEN_ORIGIN");
    return;
  }
  // Browsers always send Origin on POST; a missing one is only acceptable when
  // Sec-Fetch-Site vouches for a same-origin request.
  if (fetchSite !== "same-origin") throw new ApiError("FORBIDDEN_ORIGIN");
}
