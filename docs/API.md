# API and error contract

All POST handlers validate with Zod, cap body sizes, answer `Cache-Control: no-store`, and return errors as:

```json
{ "error": { "code": "ORDER_NOT_PAID", "message": "This order hasn't been paid yet.", "retryable": true } }
```

Cookie-authenticated POSTs require `x-mxva-request: 1` and a same-origin `Origin` / `Sec-Fetch-Site` (CSRF). The order session is an HMAC-signed, httpOnly, `SameSite=Lax` cookie (`__Host-mxva_order` in production) holding only the order id.

| Method | Route | Auth | Request | Response |
|---|---|---|---|---|
| POST | `/api/orders` | CSRF + IP rate limit | `{ sku, email, adultConfirmed, faceProcessingConsentVersion, termsVersion, marketingOptIn, countryHint? }` | `201 { alreadyPaid:false, order, checkout:{mode:"mock"} \| {mode:"stripe", clientSecret}, price }` + cookie, or `{ alreadyPaid:true, order }` |
| GET | `/api/orders/current` | cookie | — | `{ order: { status, paid, canSubmitPhotos, canRequestRetry, attemptsRemaining, deliveredToEmail } }` (no PII) |
| POST | `/api/stripe/webhook` | Stripe signature (raw body) | Stripe event | `{ received:true }`; 503 when payments are off |
| POST | `/api/fulfill` | cookie + CSRF + server-verified `paid` | multipart: `front` (required), `left`, `right`, `input` (report answers JSON), `faceProcessingConsent=true` | `application/x-ndjson`: `{"type":"phase","phase":…}` lines, then `{"type":"result", report, image:{mime,base64}, pdf:{filename,base64}, emailDelivered}` or `{"type":"error", error}` |
| POST | `/api/fulfill/retry` | cookie + CSRF | — | `{ order }` (resets `failed_retryable` / `generated_email_failed` to `paid`) |
| POST | `/api/consent/withdraw` | cookie + CSRF | — | `{ withdrawn, order }` |
| POST | `/api/events` | same-site + rate limit | `{ context, events[≤25] }` (allowlisted) | `204` |
| POST | `/api/dev/mock-pay` | dev only + cookie + CSRF | `{ outcome: "succeeded"\|"declined"\|"expired" }` | `{ order }`; **404 in production** |
| GET | `/api/health` | public | — | `{ ok, payments, fulfillment, time }` |

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
