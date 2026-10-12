# Privacy inspection checklist

Evidence that the app does not persist user photos. Each line names the check and where it is enforced or tested.

## Browser
- [x] Photos are held as `Blob`s in a Zustand store with no persistence middleware — `src/features/photos/memory-store.ts`
- [x] Previews use `URL.createObjectURL`; URLs are revoked on replace, remove, clear and `pagehide` — memory-store + unit tests
- [x] No photo, data URL or base64 in `localStorage`, `sessionStorage`, IndexedDB, Cache API, cookies or `history.state` — `e2e/privacy.spec.ts`
- [x] Only allowlisted survey choices persist (2-hour TTL, schema-validated, strict) — `src/features/onboarding/persistence.ts` + tests
- [x] An open Pix code (copy-and-paste text, expiry, price; no ids, no image, no personal data) is kept in `sessionStorage` until paid, expired or replaced, so a reload while in the bank app shows the same code — `src/features/checkout/pix-session.ts` + `e2e/pix.spec.ts`. The QR code is drawn in the browser from that text; no QR image is stored or downloaded
- [x] The Stripe client secret stays in memory only — `src/features/checkout/store.ts`
- [x] Email, consents, marketing choice and the free-text note stay in memory — `src/__tests__/features/onboarding/store.test.ts`
- [x] Original file references are dropped (`input.value = ""`) right after processing — `PhotoCapture.tsx`
- [x] Re-encoding through a canvas drops the original EXIF (camera, GPS, time) — `e2e/photo-processor.spec.ts` (Chrome, Android, WebKit)
- [x] Reloading clears photos; answers remain — `e2e/onboarding.spec.ts`, `e2e/photos-ui.spec.ts`
- [x] No photo bytes leave the browser before payment (no multipart, no `/api/fulfill` call) — `e2e/privacy.spec.ts`
- [x] The paid result (concept, PDF) lives in memory; "Clear from this device" and `pagehide` revoke it — `src/features/results/memory-store.ts`
- [x] No photos in URLs, query strings, analytics or console — allowlist (`src/features/analytics/events.ts`) + `e2e/funnel.spec.ts`

## Server
- [x] Photos arrive as multipart, are size-capped while streaming, validated and re-encoded in memory, and zero-filled after use — `src/app/api/fulfill/route.ts`, `src/server/photos/validate.ts`
- [x] No upload folder, bucket, CDN or disk write exists; `public/` holds no user content
- [x] The orders table has no image, description, embedding or report columns — `db/migrations/001_orders.sql`
- [x] Logs carry error classes and codes only; email addresses are masked in mock mail logs — `src/server/http.ts`, `src/server/mail/email-adapter.ts`
- [x] Fulfilment refuses unpaid, withdrawn or delivered orders; one claim at a time — `src/features/orders/states.ts` + `src/__tests__/api/fulfill-flow.test.ts`
- [x] No face embeddings or face-recognition templates; identity QC asks a vision model plain questions — `src/server/ai/identity-qc.ts`

## Third parties (disclosed in the Privacy Policy)
- [ ] OpenAI data controls reviewed for the chosen models and account (Phase C)
- [ ] Resend retention for messages and attachments reviewed (Phase C)
- [ ] Stripe receives email and payment data only (card)
- [ ] AbacatePay receives the amount, an order id and a description; no email, name or tax id (Pix) — `src/server/payment/abacatepay.ts`
- [ ] PostHog project set to the EU region if serving EU users; person profiles off (events are sent personless)
- [ ] Meta Conversions API enabled only with marketing consent; Automatic Advanced Matching off in Events Manager
- [ ] Privacy Policy, Terms, Refund Policy reviewed by counsel (GDPR/UK GDPR, LGPD, US states)
