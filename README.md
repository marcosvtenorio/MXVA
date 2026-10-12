# MXVA

Privacy-first, mobile-first web product for adults (18+): a 16-step intake, one front photo, a one-time purchase (US$ 29 by card, R$ 47,99 by Pix in Brazil), then an **AI concept portrait** (the buyer's own photo, groomed and well lit) plus a **sourced 7/30/90-day roadmap**, delivered as one PDF by email. Photos are never stored by the app.

Engineering source of truth: [`MXVA_CLAUDE_IMPLEMENTATION_SPEC.md`](MXVA_CLAUDE_IMPLEMENTATION_SPEC.md). Design source of truth: [`design/DIRECTION.md`](design/DIRECTION.md).

## Status

| Phase | State |
|---|---|
| **A — onboarding, photos, paywall, mock fulfilment** | **Done.** Runs locally end to end with simulated payment and simulated AI. |
| **B — real payments, database** | **Done in test mode.** Card (Stripe) and Pix (AbacatePay) verified end to end with test/sandbox keys; Railway Postgres migrated. Going live needs live keys, a public URL for webhooks and Phase C. |
| **C — real AI, PDF email** | **Working with real providers.** OpenAI vision (`gpt-5.5-2026-04-23`) + image edit (`gpt-image-2`) + identity check, PDF, Resend email: verified end to end on a fictional generated face (92 s). Before launch: test with consenting adults on several phones, and send from your own domain. |
| D — launch operations | **Staging live** on Railway (password-protected, test payments, real AI): https://mxva-production.up.railway.app. Pending: domain, live keys, legal review, analytics keys. |

## Run it

Requirements: Node.js ≥ 20.9 (developed on 26), npm, Google Chrome (tests use it).

```bash
npm install
cp .env.example .env.local        # defaults: mocks on, real payments/AI off
npm run dev                       # http://localhost:3000
```

| Command | What it does |
|---|---|
| `npm run dev` | Development server (mock payment and mock report available) |
| `npm run build && npm run start` | Production build (mocks are unreachable; checkout fails closed until configured) |
| `npm run typecheck` | Route type generation + TypeScript |
| `npm run lint` | ESLint |
| `npm test` | Unit and integration tests (Vitest) |
| `npm run test:e2e` | Playwright on Chrome desktop + Android emulation (starts or reuses `npm run dev`) |
| `E2E_WEBKIT=1 npm run test:e2e` | Adds the iPhone Safari (WebKit) project — run `npx playwright install webkit` once |
| `npm run test:e2e:prod` | Builds production and proves mocks are off and paid endpoints fail closed |
| `npm run fixtures` | Regenerates the synthetic (drawn, non-human) test photos |
| `npm run db:migrate` | Applies `db/migrations/*.sql` to `DATABASE_URL` |
| `TEST_DATABASE_URL=… npx vitest run src/__tests__/features/orders/postgres-repository.test.ts` | Repository contract test on a real Postgres, in a throwaway schema |

The end-to-end suite starts its own dev server (port 3100, build dir `.next-e2e`, simulated payments and AI), so it never touches real providers or your dev server on :3000.

### Try the whole flow locally

1. `npm run dev`, open http://localhost:3000 on a phone-sized window.
2. Start → answer the steps → add any front photo (e.g. `e2e/fixtures/synthetic-front.jpg`) → email + consents → review → checkout.
3. Checkout shows **Pix first if your device is set to Brazil** (time zone or language), card otherwise; the other method is one tap away.
   - **Card**, with Stripe test keys and `NEXT_PUBLIC_ENABLE_REAL_PAYMENTS=true`: the real Stripe form in test mode. Use `4242 4242 4242 4242` (paid), `4000 0000 0000 0002` (declined) or `4000 0027 6000 3184` (3D Secure), any future date, any CVC. Without keys: a **Development preview** block with *Pay $29 (simulated)*, *Simulate decline* and *Simulate bank page* (a full page load that drops in-memory photos, to exercise the "reselect your photo, no second charge" recovery).
   - **Pix**: *Generate Pix code* → QR + Pix Copia e Cola, live status, real expiry time. With an AbacatePay Dev Mode key the charge is real sandbox; *Simulate Pix payment* pays it through AbacatePay. Without a key it is simulated locally.
4. Processing streams the real server phases; the result page shows the concept, the plan, sources and the PDF download. With `NEXT_PUBLIC_ENABLE_REAL_AI=true` and the OpenAI/Resend keys, the concept and plan are real (about 90 s, paid per report from your OpenAI credits) and the PDF is emailed; otherwise both are simulated and stamped "SIMULATED".
5. Email without your own domain: `EMAIL_FROM="MXVA <onboarding@resend.dev>"` only delivers to your Resend account's address; other addresses show "couldn't email it" and keep the download.

Payments are confirmed only on the server: by the provider's webhook or by the server asking Stripe / AbacatePay for the payment state. Locally no webhook is needed.

## Test results (12 Oct 2026)

| Suite | Result |
|---|---|
| Vitest (unit + API integration) | **142 passed** (26 files), plus 5 opt-in real-database tests |
| Postgres repository contract (opt-in) | **5 passed** on Postgres 17 (local) and Postgres 18 (Railway) |
| Playwright, dev server (Chrome desktop, Android Chrome, iPhone Safari/WebKit) | **129 passed** (43 tests × 3 engines) |
| Playwright, production build | **3 passed** |
| Stripe test mode, local dev server | 4242 paid → report; 4000…0002 declined, order left unpaid; 3D Secure challenge → paid |
| AbacatePay Dev Mode, local dev server | real sandbox Pix code (QR + copy) → simulated payment → server check → report |
| Live AI (opt-in, `LIVE_AI_PHOTO=…`) | vision 9 s, image edit 75 s, identity check passed first try, PDF audit passed, email accepted |
| Full flow, local dev server | Pix sandbox → real AI concept and plan in 90 s → PDF → email received |
| axe-core (WCAG 2.1 A/AA) on landing, start, sample, privacy, help and the funnel | no serious or critical violations |

What the end-to-end matrix covers (spec §12): start-to-result, conditionals, invalid uploads, reload clears photos (answers stay), age gate, consent gate, payment redirect with reselect and no second charge, faked `paid=true` refused (`ORDER_NOT_PAID`), refresh after delivery points to email, storage and network leak checks before payment, console never logs photo data, 320/375/768/1440 px without horizontal scroll, production flags block every mock.
Covered by unit/integration tests instead: duplicate webhooks (one state change), Stripe signature verification, QC failure → retry → never delivered, email failure keeps the report downloadable, concurrent fulfilment (exactly one runs).

## Architecture

- **Next.js 16 App Router** (Cache Components, Turbopack), React 19, TypeScript strict, Tailwind v4 tokens from the design.
- **State:** Zustand. Photos and results live **only in memory** (`src/features/photos/memory-store.ts`, `src/features/results/memory-store.ts`); allowlisted survey choices may survive a reload for 2 hours in `sessionStorage`.
- **Photos:** checked and normalised on the device (`src/features/photos/client-processor.ts`: magic bytes, disguise and decompression-bomb checks, EXIF orientation, metadata stripped by re-encoding, quality heuristics), re-validated on the server with `sharp` (`src/server/photos/validate.ts`).
- **Orders:** a pure state machine (`src/features/orders/states.ts`) with compare-and-set storage — in memory for development, Postgres in production (`db/migrations/001_orders.sql`, metadata only).
- **Fulfilment:** `PhotoValidator → VisualObservations → RecommendationPlanner → ImageEdit → IdentityQualityGate → PDFComposer → EmailSender` (`src/server/fulfillment/pipeline.ts`), streamed to the browser as NDJSON phases.
- **Evidence:** `src/data/evidence-sources.json` — 17 human-verified sources (URLs checked, PubMed records via NCBI E-utilities). The planner can cite nothing else.
- **Analytics:** first-party `/api/events` with a strict allowlist; forwards to PostHog (anonymous, GeoIP off) and Meta Conversions API (marketing consent only). No photos, answers, emails or free text, ever.

More: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) (route map and component tree), [`docs/API.md`](docs/API.md) (endpoints and error contract), [`docs/PRIVACY-CHECKLIST.md`](docs/PRIVACY-CHECKLIST.md).

## Credentials checklist

| Needed for | Variables | Where |
|---|---|---|
| Signed order cookie (production) | `COOKIE_SIGNING_SECRET` (32+ chars) | `openssl rand -base64 48` |
| Order database | `DATABASE_URL` | Railway Postgres (private). On Railway: `DATABASE_URL=${{Postgres.DATABASE_URL}}`. From this machine: `railway connect Postgres --tunnel-only --port 55432`, then use the printed `127.0.0.1` URL for `npm run db:migrate` |
| Card payments | `NEXT_PUBLIC_ENABLE_REAL_PAYMENTS=true`, `STRIPE_SECRET_KEY`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET` (production) | Stripe dashboard; webhook → `https://<domain>/api/stripe/webhook` with `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.expired`, `charge.refunded` |
| Pix payments | `ABACATEPAY_API_KEY`, `ABACATEPAY_SANDBOX`, `ABACATEPAY_WEBHOOK_SECRET` (production), optional `ABACATEPAY_PUBLIC_KEY`, `PRICE_BRL_CENTS` | AbacatePay dashboard; webhook → `https://<domain>/api/abacatepay/webhook?webhookSecret=<ABACATEPAY_WEBHOOK_SECRET>` |
| Vision + QC (Phase C) | `NEXT_PUBLIC_ENABLE_REAL_AI=true`, `VISION_API_KEY`, `VISION_MODEL` | OpenAI (Responses API, strict JSON) |
| Image edit (Phase C) | `IMAGE_API_KEY`, `IMAGE_EDIT_MODEL` (default `gpt-image-2`) | OpenAI Images Edit |
| Email (Phase C) | `RESEND_API_KEY`, `EMAIL_FROM`, `SUPPORT_EMAIL` | Resend with a verified sending domain |
| Analytics | `POSTHOG_PROJECT_API_KEY`, `POSTHOG_HOST` | PostHog project (EU or US) |
| Meta ads measurement | `META_PIXEL_ID`, `META_CAPI_ACCESS_TOKEN`, optional `META_TEST_EVENT_CODE` | Meta Events Manager (dataset/pixel id + Conversions API token) |

Real payments refuse to start unless **every** provider above (payments, AI, email, database, signing secret) is configured: the app never charges for a report it cannot deliver.

## Production blockers

1. **Payments, live:** card and Pix pass in test/sandbox mode. Before live: deploy to a public URL, register both webhooks, run one real low-value payment per method and a refund. The Stripe account is Brazilian (BRL settlement) and not yet activated; activation needs the live website. Confirm in live mode that it can present USD to international cards.
2. **Real AI quality:** the identity QC, prompts and vision output must be tested with a consenting adult and several phones before launch. Check the chosen models' availability and data-retention settings (OpenAI data controls) and disclose them.
3. **Email provider limits:** confirm Resend plan quotas, attachment size (PDFs are ~0.2–1.5 MB) and domain authentication (SPF/DKIM/DMARC).
4. **Hosting timeouts:** fulfilment can take 1–3 minutes with real AI. Use a persistent Node host (Railway) — not short serverless functions. Rate limiting is in-process: move it to a shared store (e.g. Redis) before running more than one instance.
5. **Taxes and currency:** Stripe Adaptive Pricing shows local currency; VAT/GST/ICMS handling (Stripe Tax or a merchant of record) is not configured. Don't advertise prices "including tax" until it is.
6. **Legal:** Privacy Policy, Terms and Refund Policy are drafts. Review with counsel for GDPR/UK GDPR, LGPD (Brazil) and US state laws, including face-photo processing and the Meta Conversions API. Meta may classify the product under health & wellness ad restrictions.
7. **CSP hardening:** scripts are allowed `'unsafe-inline'` because pages are statically prerendered. Move to nonces on dynamic routes or the experimental SRI mode before launch.
8. **Paid-order recovery across devices:** recovery works in the same browser (signed cookie). A new device needs support or a magic-link flow (not built).
9. **Brand assets:** the plaster "light-test head" is a stand-in; the owner will choose real photography. Trademark, domain and handle clearance for "MXVA" pending.

## Deploy (Railway)

- Project `strong-insight`, environment `production`: services `Postgres` (private network only) and `mxva` (this repo, `main` branch; every push deploys).
- `railway.json`: Railpack build, `npm run db:migrate` before each deploy, health check `/api/health`.
- Service variables: everything in `.env.example`, with `DATABASE_URL=${{Postgres.DATABASE_URL}}`, `NEXT_PUBLIC_APP_URL` = the public URL, `RAILPACK_NODE_VERSION=24`.
- Staging: `STAGING=true` + `STAGING_PASSWORD` put the whole site behind a password (user `mxva`) and allow sandbox keys. Remove both for launch, together with switching to live keys.
- Webhooks: Stripe endpoint `https://<domain>/api/stripe/webhook` (created via API in test mode; its secret is `STRIPE_WEBHOOK_SECRET`). AbacatePay: dashboard → Webhooks → URL `https://<domain>/api/abacatepay/webhook`, secret = `ABACATEPAY_WEBHOOK_SECRET`.

## Next steps

1. Test real AI with consenting adults (different faces, lighting, phones); verify a sending domain in Resend and set `EMAIL_FROM` and `SUPPORT_EMAIL` on it.
2. Deploy on Railway next to the Postgres service (`DATABASE_URL=${{Postgres.DATABASE_URL}}`, `npm run db:migrate` as the pre-deploy command), then register the Stripe and AbacatePay webhooks on the public URL.
3. Switch to live keys only after Phase C passes end to end (the app refuses real money otherwise).
