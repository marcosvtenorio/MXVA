# API and error contract

All POST handlers validate with Zod, cap body sizes, answer `Cache-Control: no-store`, and return errors as:

```json
{ "error": { "code": "ORDER_NOT_PAID", "message": "This order hasn't been paid yet.", "retryable": true } }
```

Cookie-authenticated POSTs require `x-mxva-request: 1` and a same-origin `Origin` / `Sec-Fetch-Site` (CSRF). The order session is an HMAC-signed, httpOnly, `SameSite=Lax` cookie (`__Host-mxva_order` in production) holding only the order id.

| Method | Route | Auth | Request | Response |
|---|---|---|---|---|
| GET | `/api/checkout/options` | public | — | `{ offers: [{ method:"pix"\|"card", price:{amountMinor, currency:"brl"\|"usd"}, sandbox, simulated }] }`: what checkout can take right now; empty in production until live keys, AI and email are configured |
| POST | `/api/orders` | CSRF + IP rate limit | `{ sku, method:"pix"\|"card", email, adultConfirmed, faceProcessingConsentVersion, termsVersion, marketingOptIn, countryHint? }` | `201 { alreadyPaid:false, order, checkout, price }` + cookie, or `{ alreadyPaid:true, order }`. `checkout` is `{mode:"stripe", clientSecret}` (card), `{mode:"pix", brCode, expiresAt, sandbox, simulated}` (Pix) or `{mode:"mock"}` (simulated card). Before opening a new checkout the server re-checks the browser's last order with the provider (no second charge) and expires an open card session |
| GET | `/api/orders/current` | cookie | — | `{ order: { status, paid, canSubmitPhotos, canRequestRetry, attemptsRemaining, deliveredToEmail }, pending: { method, expiresAt } \| null }` (no PII). While pending it asks AbacatePay / Stripe for the payment state (throttled to one check per 2 s per order) |
| POST | `/api/stripe/webhook` | Stripe signature (raw body) | Stripe event | `{ received:true }`; 503 when payments are off |
| POST | `/api/abacatepay/webhook?webhookSecret=…` | our secret (+ HMAC header when `ABACATEPAY_PUBLIC_KEY` is set) | AbacatePay event | `{ received:true }`. The body only names the charge; its state is re-read from AbacatePay before anything is granted. 403 on bad credentials, 503 when not configured |
| POST | `/api/fulfill` | cookie + CSRF + server-verified `paid` | multipart: `front` (required), `left`, `right`, `input` (report answers JSON), `faceProcessingConsent=true` | `application/x-ndjson`: `{"type":"phase","phase":…}` lines, then `{"type":"result", report, image:{mime,base64}, pdf:{filename,base64}, emailDelivered}` or `{"type":"error", error}` |
| POST | `/api/fulfill/retry` | cookie + CSRF | — | `{ order }` (resets `failed_retryable` / `generated_email_failed` to `paid`) |
| POST | `/api/consent/withdraw` | cookie + CSRF | — | `{ withdrawn, order }` |
| POST | `/api/events` | same-site + rate limit | `{ context, events[≤25] }` (allowlisted) | `204` |
| POST | `/api/dev/mock-pay` | dev only + cookie + CSRF | `{ outcome: "succeeded"\|"declined"\|"expired" }` | `{ order }` for simulated card or Pix orders; **404 in production** |
| POST | `/api/dev/pix-simulate` | dev + AbacatePay sandbox key + cookie + CSRF | — | asks AbacatePay Dev Mode to pay this order's charge, then confirms it the normal way; **404 in production** |
| GET | `/api/health` | public | — | `{ ok, payments: "real"\|"sandbox"\|"mock"\|"unavailable", fulfillment, time }` |

## Error codes → next action (`src/lib/api-errors.ts`)

| Code | HTTP | Retryable | UI action |
|---|---|---|---|
| PHOTO_REQUIRED | 400 | yes | reselect photo |
| UNSUPPORTED_IMAGE_TYPE | 415 | yes | reselect photo |
| PHOTO_TOO_LARGE | 413 | yes | reselect photo |
| PHOTO_QUALITY_INSUFFICIENT | 422 | yes | reselect photo |
| AGE_RESTRICTED | 403 | no | restart (blocked) |
| CONSENT_REQUIRED | 403 | yes | fix input (give consent) |
| ORDER_NOT_PAID | 402 | yes | go to checkout |
| ORDER_SESSION_INVALID | 401 | no | contact support |
| ALREADY_PROCESSING | 409 | yes | wait |
| AI_PROVIDER_FAILED | 502 | yes | retry (no charge) |
| SIMULATION_QUALITY_FAILED | 422 | yes | reselect photo (never delivered) |
| PDF_GENERATION_FAILED | 500 | yes | retry |
| EMAIL_FAILED | 502 | yes | download now, retry email |
| RATE_LIMITED | 429 | yes | wait (`Retry-After`) |
| SERVICE_UNAVAILABLE | 503 | yes | retry later (also: configuration incomplete, fail closed) |
| INVALID_REQUEST | 400 | no | fix input |
| FORBIDDEN_ORIGIN | 403 | no | restart |
| NOT_FOUND | 404 | no | restart |
| ORDER_NOT_RETRYABLE | 409 | no | contact support |

## Order states (`src/features/orders/states.ts`)

`pending_payment → paid → processing → delivered_to_provider`, with `generated_email_failed`, `failed_retryable` (retry resets to `paid`), `needs_support` (attempts exhausted, QC hard fail, payment mismatch, possible minor), `refunded`, `expired`, `withdrawn`. Three fulfilment attempts per order; a processing claim older than 10 minutes is treated as a crashed worker.
