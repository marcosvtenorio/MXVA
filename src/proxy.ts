import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Staging gate. With STAGING=true the whole site asks for a password (HTTP Basic, user
 * "mxva") so strangers can't use test payments to run the real AI. Provider webhooks and
 * the health probe stay open: they authenticate themselves or reveal nothing.
 * Without STAGING the proxy does nothing.
 */
const OPEN_PATHS = new Set(["/api/stripe/webhook", "/api/abacatepay/webhook", "/api/health"]);
export const STAGING_USER = "mxva";

function sameSecret(provided: string, expected: string): boolean {
  const left = Buffer.from(provided);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

function authorised(header: string | null, password: string): boolean {
  const [scheme, encoded] = (header ?? "").split(" ");
  if (scheme !== "Basic" || !encoded) return false;
  const decoded = Buffer.from(encoded, "base64").toString("utf8");
  const separator = decoded.indexOf(":");
  if (separator < 0) return false;
  return decoded.slice(0, separator) === STAGING_USER && sameSecret(decoded.slice(separator + 1), password);
}

export function proxy(request: NextRequest) {
  if (process.env.STAGING !== "true" || OPEN_PATHS.has(request.nextUrl.pathname)) return NextResponse.next();
  const noindex = { "X-Robots-Tag": "noindex, nofollow" };
  const password = process.env.STAGING_PASSWORD ?? "";
  // Fail closed: staging without a real password serves nothing.
  if (password.length < 12) return new NextResponse("Staging password is not configured.", { status: 503, headers: noindex });
  if (!authorised(request.headers.get("authorization"), password)) {
    return new NextResponse("Authentication required.", {
      status: 401,
      headers: { ...noindex, "WWW-Authenticate": 'Basic realm="MXVA staging", charset="UTF-8"' },
    });
  }
  const response = NextResponse.next();
  response.headers.set("X-Robots-Tag", "noindex, nofollow");
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
