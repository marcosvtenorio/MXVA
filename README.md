# MXVA

Privacy-first, mobile-first web product for adults (18+): a short intake (photo, anything to avoid, email), one front photo, a one-time purchase (US$ 29 by card, R$ 47,99 by Pix in Brazil), then an **AI concept portrait** (the buyer's own photo, groomed and well lit) plus a **sourced 7/30/90-day roadmap**, delivered as one PDF by email. Photos are never stored by the app.

Engineering source of truth: [`MXVA_CLAUDE_IMPLEMENTATION_SPEC.md`](MXVA_CLAUDE_IMPLEMENTATION_SPEC.md). Design source of truth: [`design/DIRECTION.md`](design/DIRECTION.md).

## Status

| Phase | State |
|---|---|
| **A — onboarding, photos, paywall, mock fulfilment** | **Done.** Runs locally end to end with simulated payment and simulated AI. |
| **B — real payments, database** | **Done in test mode.** Card (Stripe) and Pix (AbacatePay) verified end to end with test/sandbox keys; Railway Postgres migrated. Going live needs live keys, a public URL for webhooks and Phase C. |
| **C — real AI, PDF email** | **Working with real providers.** OpenAI vision (`gpt-5.5-2026-04-23`) + image edit (`gpt-image-2`) + identity check, PDF, Resend email: verified end to end on a fictional generated face (92 s). Before launch: test with consenting adults on several phones, and send from your own domain. |
| D — launch operations | **Staging live** on Railway (test payments, real AI, open without a password at the owner's request): https://mxva-production.up.railway.app. Pending: domain, live keys, legal review, analytics keys. |

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
| `npm run test:stress -- --users 100 [--database-url postgres://…]` | Load test: N buyers pay at the same moment (see below). Never calls OpenAI or Resend |

The end-to-end suite starts its own dev server (port 3100, build dir `.next-e2e`, simulated payments and AI), so it never touches real providers or your dev server on :3000.

**Load test** (`e2e/stress/`): starts a dev server on :3200 (build dir `.next-stress`) with the **real** OpenAI and Resend code paths pointed at `e2e/stress/fake-providers.mjs` through `OPENAI_BASE_URL` and `RESEND_BASE_URL` (fake keys, so nothing can reach the real services), and simulated payments. A warm-up buyer in Chrome compiles the routes and records the calls a browser makes; then N buyers park on the checkout and all pay within a few milliseconds. `--browser-buyers` of them use Chrome through the interface, the rest replay the browser's HTTP calls (one laptop cannot run 100 browsers). Each buyer's photo carries a unique code, and the run checks that every PDF, and every email sent to that buyer's address, carries their own photo. Options: `--vision-ms`, `--image-ms`, `--qc-ms`, `--jitter` (provider latency), `--image-limit` (images the fake OpenAI accepts at once; the rest get 429). Results go to `test-results/stress/<label>.json`.

### Try the whole flow locally

1. `npm run dev`, open http://localhost:3000 on a phone-sized window.
2. Start → photo guide → add any front photo (e.g. `e2e/fixtures/synthetic-front.jpg`) → anything to avoid (optional) → email + consents → review → checkout. No aesthetic questions: the plan and the concept are decided from the photo.
3. Checkout shows **Pix first if your device is set to Brazil** (time zone or language), card otherwise; the other method is one tap away.
   - **Card**, with Stripe test keys and `NEXT_PUBLIC_ENABLE_REAL_PAYMENTS=true`: the real Stripe form in test mode. Use `4242 4242 4242 4242` (paid), `4000 0000 0000 0002` (declined) or `4000 0027 6000 3184` (3D Secure), any future date, any CVC. Without keys: a **Development preview** block with *Pay $29 (simulated)*, *Simulate decline* and *Simulate bank page* (a full page load that drops in-memory photos, to exercise the "reselect your photo, no second charge" recovery).
   - **Pix**: *Generate Pix code* → QR + Pix Copia e Cola, live status, real expiry time. With an AbacatePay Dev Mode key the charge is real sandbox; *Simulate Pix payment* pays it through AbacatePay. Without a key it is simulated locally.
4. Processing streams the real server phases; the result page shows the concept, the plan, sources and the PDF download. With `NEXT_PUBLIC_ENABLE_REAL_AI=true` and the OpenAI/Resend keys, the concept and plan are real (about 90 s, paid per report from your OpenAI credits) and the PDF is emailed; otherwise both are simulated and stamped "SIMULATED".
5. Email without your own domain: `EMAIL_FROM="MXVA <onboarding@resend.dev>"` only delivers to your Resend account's address; other addresses show "couldn't email it" and keep the download.

Payments are confirmed only on the server: by the provider's webhook or by the server asking Stripe / AbacatePay for the payment state. Locally no webhook is needed.

## Test results (13 Oct 2026)

| Suite | Result |
|---|---|
| Vitest (unit + API integration) | **162 passed** (28 files), plus opt-in real-database and live-AI tests |
| Postgres repository contract (opt-in) | **6 passed** on Postgres 17 (local); migrations run on Railway before each deploy |
| Playwright, dev server (Chrome desktop, Android Chrome) | **90 passed** (45 tests × 2 engines; `E2E_WEBKIT=1` adds iPhone Safari) |
| Playwright, production build | **3 passed** |
| Stripe test mode, local dev server | 4242 paid → report; 4000…0002 declined, order left unpaid; 3D Secure challenge → paid |
| AbacatePay Dev Mode, local dev server | real sandbox Pix code (QR + copy) → simulated payment → server check → report |
| Live AI (opt-in, `LIVE_AI_PHOTO=…`) | vision 9 s, image edit 75 s, identity check passed first try, PDF audit passed, email accepted |
| Full flow, local dev server | Pix sandbox → real AI concept and plan in 90 s → PDF → email received |
| axe-core (WCAG 2.1 A/AA) on landing, start, sample, privacy, help and the funnel | no serious or critical violations |
| Manual QA on the live staging site, UI only (iPhone WebKit, Android Chrome, desktop, small phone, dark mode) | card (paid, declined, 3D Secure), Pix, two tabs (card and Pix share one checkout; only the paying tab makes the report), leaving and coming back, reload and background tab mid-report, double taps, offline, a server restart mid-report (the page carries on by itself) |

What the end-to-end matrix covers (spec §12): start-to-result, conditionals, invalid uploads, reload clears photos (answers stay), age gate, consent gate, payment redirect with reselect and no second charge, faked `paid=true` refused (`ORDER_NOT_PAID`), refresh after delivery points to email, storage and network leak checks before payment, console never logs photo data, 320/375/768/1440 px without horizontal scroll, production flags block every mock.
Covered by unit/integration tests instead: duplicate webhooks (one state change), Stripe signature verification, QC failure → retry → never delivered, email failure keeps the report downloadable, concurrent fulfilment (exactly one runs).

## Architecture

- **Next.js 16 App Router** (Cache Components, Turbopack), React 19, TypeScript strict, Tailwind v4 tokens from the design.
- **State:** Zustand. Photos and results live **only in memory** (`src/features/photos/memory-store.ts`, `src/features/results/memory-store.ts`); allowlisted survey choices may survive a reload for 2 hours in `sessionStorage`.
- **Photos:** checked and normalised on the device (`src/features/photos/client-processor.ts`: magic bytes, disguise and decompression-bomb checks, EXIF orientation, metadata stripped by re-encoding, quality heuristics), re-validated on the server with `sharp` (`src/server/photos/validate.ts`).
- **Orders:** a pure state machine (`src/features/orders/states.ts`) with compare-and-set storage — in memory for development, Postgres in production (`db/migrations/001_orders.sql`, metadata only).
- **Fulfilment:** `PhotoValidator → VisualObservations → RecommendationPlanner → ImageEdit → IdentityQualityGate → PDFComposer` (`src/server/fulfillment/pipeline.ts`), run by the **report queue** (`src/server/fulfillment/queue.ts`). `POST /api/fulfill` validates the photo, claims the order and answers `202` at once with the buyer's place in line and an estimate; the page says "it arrives by email in about N minutes" and can be closed. Nothing is shown in the browser: the PDF goes only by email.
- **Report queue:** one per server process, photos in RAM only, at most `FULFILLMENT_CONCURRENCY` reports at a time (keep it under the OpenAI account's image rate limit). Each report gets 3 tries (waits of `FULFILLMENT_RETRY_DELAY_MS`, then ×4); an OpenAI "too many requests" (429) waits for a turn without spending a try; an empty balance, a bad request or a missing setting stops at once. The email gets 4 tries. When a report still fails, the buyer gets an email with a 7-day link (`/resume`) to add a photo again without paying, and `OWNER_ALERT_EMAIL` gets an alert with the order, the buyer's email and the error timeline — never the photo, concept, face analysis or report. Every queued report refreshes its order's claim every 20 s; if a server stops, a sweeper (on any server, started by the health probe and page traffic) fails those orders within ~2 minutes and sends the same emails.
- **Concept image:** the owner's glow-up prompt, sent exactly as written (`OWNER_PROMPT` in `src/server/ai/prompts.ts`) with the front photo, like ChatGPT: the vision model writes the consultation and calls the image tool, which draws the annotated before and after. The report shows both as returned.
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
| Image edit (Phase C) | `IMAGE_API_KEY`, `IMAGE_EDIT_MODEL` (default `gpt-image-2`), with `VISION_MODEL` | OpenAI Responses API with the image generation tool |
| Email (Phase C) | `RESEND_API_KEY`, `EMAIL_FROM`, `SUPPORT_EMAIL` | Resend with a verified sending domain |
| Report queue | `FULFILLMENT_CONCURRENCY` (default 4), `FULFILLMENT_MAX_QUEUED` (300), `FULFILLMENT_RETRY_DELAY_MS` (30000), `OWNER_ALERT_EMAIL` | Concurrency under the OpenAI image rate limit; alerts go to the owner |
| Analytics | `POSTHOG_PROJECT_API_KEY`, `POSTHOG_HOST` | PostHog project (EU or US) |
| Meta ads measurement | `META_PIXEL_ID`, `META_CAPI_ACCESS_TOKEN`, optional `META_TEST_EVENT_CODE` | Meta Events Manager (dataset/pixel id + Conversions API token) |

Real payments refuse to start unless **every** provider above (payments, AI, email, database, signing secret) is configured: the app never charges for a report it cannot deliver.

## Production blockers

1. **Payments, live:** card and Pix pass in test/sandbox mode. Before live: deploy to a public URL, register both webhooks, run one real low-value payment per method and a refund. The Stripe account is Brazilian (BRL settlement) and not yet activated; activation needs the live website. Confirm in live mode that it can present USD to international cards.
2. **Real AI quality:** the identity QC, prompts and vision output must be tested with a consenting adult and several phones before launch. Check the chosen models' availability and data-retention settings (OpenAI data controls) and disclose them.
3. **Email provider limits:** confirm Resend plan quotas, attachment size (PDFs are ~0.2–1.5 MB) and domain authentication (SPF/DKIM/DMARC).
4. **Hosting:** the report queue lives in the server process, so it needs a persistent Node host (Railway), not serverless functions. A deploy or restart loses the photos of queued reports (by design they're never stored); those buyers get the "create it again" email. Rate limiting and the queue are per process: one instance until they move to a shared store (e.g. Redis).
5. **Taxes and currency:** Stripe Adaptive Pricing shows local currency; VAT/GST/ICMS handling (Stripe Tax or a merchant of record) is not configured. Don't advertise prices "including tax" until it is.
6. **Legal:** Privacy Policy, Terms and Refund Policy are drafts. Review with counsel for GDPR/UK GDPR, LGPD (Brazil) and US state laws, including face-photo processing and the Meta Conversions API. Meta may classify the product under health & wellness ad restrictions.
7. **CSP hardening:** scripts are allowed `'unsafe-inline'` because pages are statically prerendered. Move to nonces on dynamic routes or the experimental SRI mode before launch.
8. **Paid-order recovery across devices:** recovery works in the same browser (signed cookie). A new device needs support or a magic-link flow (not built).
9. **Brand assets:** the plaster "light-test head" is a stand-in; the owner will choose real photography. Trademark, domain and handle clearance for "MXVA" pending.

## Deploy (Railway)

- Project `strong-insight`, environment `production`: services `Postgres` (private network only) and `mxva` (this repo, `main` branch; every push deploys).
- Service settings (set on the service through the Railway API, because deployments showed `railway.json` being read but not applied): pre-deploy `npm run db:migrate` (idempotent), health check `/api/health` (120 s), draining 300 s so a replaced server finishes in-flight reports (the report work is registered with `after()`). `railway.json` mirrors these values.
- Service variables: everything in `.env.example`, with `DATABASE_URL=${{Postgres.DATABASE_URL}}`, `NEXT_PUBLIC_APP_URL` = the public URL, `RAILPACK_NODE_VERSION=24`.
- Staging: `STAGING=true` allows sandbox keys in the production build and marks every page noindex. An optional `STAGING_PASSWORD` (12+ characters) also puts the site behind a password (user `mxva`). While staging is open, anyone with the link can get a real AI report with a Stripe test card, so cap OpenAI spend in its dashboard. Remove both for launch, together with switching to live keys.
- Webhooks: Stripe endpoint `https://<domain>/api/stripe/webhook` (created via API in test mode; its secret is `STRIPE_WEBHOOK_SECRET`). AbacatePay: dashboard → Webhooks → URL `https://<domain>/api/abacatepay/webhook`, secret = `ABACATEPAY_WEBHOOK_SECRET`.

## Next steps

1. Test real AI with consenting adults (different faces, lighting, phones); verify a sending domain in Resend and set `EMAIL_FROM` and `SUPPORT_EMAIL` on it.
2. Deploy on Railway next to the Postgres service (`DATABASE_URL=${{Postgres.DATABASE_URL}}`, `npm run db:migrate` as the pre-deploy command), then register the Stripe and AbacatePay webhooks on the public URL.
3. Switch to live keys only after Phase C passes end to end (the app refuses real money otherwise).
