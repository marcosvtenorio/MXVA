// Security headers shared by next.config.ts (build time) and route handlers.
// Keep this module free of path aliases and `server-only`: next.config.ts imports it directly.

type CspOptions = {
  isDev: boolean;
  /** Allow Stripe.js, its iframes and API calls (Phase B, real payments). */
  enableStripe: boolean;
};

export function buildContentSecurityPolicy({ isDev, enableStripe }: CspOptions): string {
  const stripeScript = enableStripe ? ["https://js.stripe.com"] : [];
  const stripeFrames = enableStripe ? ["https://js.stripe.com", "https://hooks.stripe.com"] : [];
  const stripeConnect = enableStripe ? ["https://api.stripe.com", "https://m.stripe.network"] : [];
  const stripeImages = enableStripe ? ["https://*.stripe.com"] : [];

  // Next.js injects inline bootstrap scripts into statically prerendered pages, so a
  // nonce-free policy needs 'unsafe-inline' for scripts. Hardening path (Phase D):
  // nonce-based CSP on dynamic routes or the experimental SRI mode, see README.
  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    "script-src": ["'self'", "'unsafe-inline'", ...(isDev ? ["'unsafe-eval'"] : []), ...stripeScript],
    "style-src": ["'self'", "'unsafe-inline'"],
    // blob: is required for in-memory photo previews (URL.createObjectURL).
    "img-src": ["'self'", "blob:", "data:", ...stripeImages],
    "media-src": ["'self'", "blob:"],
    "font-src": ["'self'"],
    "connect-src": ["'self'", ...stripeConnect],
    "frame-src": stripeFrames.length > 0 ? stripeFrames : ["'none'"],
    "worker-src": ["'self'", "blob:"],
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'"],
    "frame-ancestors": ["'none'"],
    "manifest-src": ["'self'"],
  };

  const policy = Object.entries(directives)
    .map(([name, values]) => `${name} ${values.join(" ")}`)
    .join("; ");

  return isDev ? policy : `${policy}; upgrade-insecure-requests`;
}

export function baseSecurityHeaders(options: CspOptions): { key: string; value: string }[] {
  const headers = [
    { key: "Content-Security-Policy", value: buildContentSecurityPolicy(options) },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    {
      key: "Permissions-Policy",
      value: [
        "camera=(self)",
        "microphone=()",
        "geolocation=()",
        "browsing-topics=()",
        options.enableStripe ? 'payment=(self "https://js.stripe.com")' : "payment=()",
      ].join(", "),
    },
    // Popups must keep working for wallet / bank authentication flows.
    { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
  ];

  if (!options.isDev) {
    headers.push({ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" });
  }

  return headers;
}

/** Routes that hold or describe private, per-visitor state. Never indexed, never cached. */
export const PRIVATE_ROUTE_SOURCES = [
  "/start",
  "/onboarding/:path*",
  "/checkout",
  "/processing",
  "/resume",
  "/api/:path*",
] as const;

export const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, max-age=0",
  Pragma: "no-cache",
} as const;
