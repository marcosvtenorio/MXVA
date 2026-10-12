# MXVA

Privacy-first, mobile-first web product for adults (18+): a 16-step intake, one front photo, a one-time $29 purchase, then an **AI concept portrait** (the buyer's own photo, groomed and well lit) plus a **sourced 7/30/90-day roadmap**, delivered as one PDF by email. Photos are never stored by the app.

Engineering source of truth: [`MXVA_CLAUDE_IMPLEMENTATION_SPEC.md`](MXVA_CLAUDE_IMPLEMENTATION_SPEC.md). Design source of truth: [`design/DIRECTION.md`](design/DIRECTION.md).

## Status

| Phase | State |
|---|---|
| **A — onboarding, photos, paywall, mock fulfilment** | **Done.** Runs locally end to end with simulated payment and simulated AI. |
| B — real payments (Stripe) | Scaffolded and switched off. Needs keys and a database. |
| C — real AI, PDF email | Adapters written and switched off. Needs keys, a domain and testing with a consenting adult. |
| D — launch operations | Not started (hosting, legal review, monitoring, support playbook). |

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
| `npm run db:migrate` | Applies `db/migrations/*.sql` to `DATABASE_URL` (Phase B) |

### Try the whole flow locally

1. `npm run dev`, open http://localhost:3000 on a phone-sized window.
2. Start → answer the steps → add any front photo (e.g. `e2e/fixtures/synthetic-front.jpg`) → email + consents → review → checkout.
3. Checkout shows a **Development preview** block: *Pay $29 (simulated)*, *Simulate decline*, *Simulate bank page* (a full page load that drops in-memory photos, to exercise the "reselect your photo, no second charge" recovery).
4. Processing streams the real server phases; the result page shows the concept (stamped "SIMULATED"), the plan, sources and the PDF download.

## Test results (11 Oct 2026)

| Suite | Result |
|---|---|
| Vitest (unit + API integration) | **120 passed** (23 files) |
| Playwright, dev server (Chrome desktop, Android Chrome, iPhone Safari/WebKit) | **111 passed** (37 tests × 3 engines) |
| Playwright, production build | **3 passed** |
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
| Order database (Phase B) | `DATABASE_URL` | Postgres (Railway or Supabase *database only*), then `npm run db:migrate` |
| Payments (Phase B) | `NEXT_PUBLIC_ENABLE_REAL_PAYMENTS=true`, `STRIPE_SECRET_KEY`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET` | Stripe dashboard; webhook → `https://<domain>/api/stripe/webhook` with `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.expired`, `charge.refunded` |
| Vision + QC (Phase C) | `NEXT_PUBLIC_ENABLE_REAL_AI=true`, `VISION_API_KEY`, `VISION_MODEL` | OpenAI (Responses API, strict JSON) |
| Image edit (Phase C) | `IMAGE_API_KEY`, `IMAGE_EDIT_MODEL` (default `gpt-image-2`) | OpenAI Images Edit |
| Email (Phase C) | `RESEND_API_KEY`, `EMAIL_FROM`, `SUPPORT_EMAIL` | Resend with a verified sending domain |
| Analytics | `POSTHOG_PROJECT_API_KEY`, `POSTHOG_HOST` | PostHog project (EU or US) |
| Meta ads measurement | `META_PIXEL_ID`, `META_CAPI_ACCESS_TOKEN`, optional `META_TEST_EVENT_CODE` | Meta Events Manager (dataset/pixel id + Conversions API token) |

Real payments refuse to start unless **every** provider above (payments, AI, email, database, signing secret) is configured: the app never charges for a report it cannot deliver.

## Production blockers

1. **Payment fulfilment:** Stripe mode is untested against live test keys. Test card success, decline, 3DS, redirect methods, webhook duplicates and expiry before turning payments on (spec Phase B).
2. **Real AI quality:** the identity QC, prompts and vision output must be tested with a consenting adult and several phones before launch. Check the chosen models' availability and data-retention settings (OpenAI data controls) and disclose them.
3. **Email provider limits:** confirm Resend plan quotas, attachment size (PDFs are ~0.2–1.5 MB) and domain authentication (SPF/DKIM/DMARC).
4. **Hosting timeouts:** fulfilment can take 1–3 minutes with real AI. Use a persistent Node host (Railway) — not short serverless functions. Rate limiting is in-process: move it to a shared store (e.g. Redis) before running more than one instance.
5. **Taxes and currency:** Stripe Adaptive Pricing shows local currency; VAT/GST/ICMS handling (Stripe Tax or a merchant of record) is not configured. Don't advertise prices "including tax" until it is.
6. **Legal:** Privacy Policy, Terms and Refund Policy are drafts. Review with counsel for GDPR/UK GDPR, LGPD (Brazil) and US state laws, including face-photo processing and the Meta Conversions API. Meta may classify the product under health & wellness ad restrictions.
7. **CSP hardening:** scripts are allowed `'unsafe-inline'` because pages are statically prerendered. Move to nonces on dynamic routes or the experimental SRI mode before launch.
8. **Paid-order recovery across devices:** recovery works in the same browser (signed cookie). A new device needs support or a magic-link flow (not built).
9. **Brand assets:** the plaster "light-test head" is a stand-in; the owner will choose real photography. Trademark, domain and handle clearance for "MXVA" pending.

## Phase B next steps

1. Create Stripe test keys and a Postgres database; set the variables above; `npm run db:migrate`.
2. Run with `NEXT_PUBLIC_ENABLE_REAL_PAYMENTS=true` and real AI/email configured in a staging environment (payments stay "unavailable" otherwise).
3. Verify the `ui_mode: "elements"` Checkout Session and the Payment Element against the installed SDK (`stripe@23`, API `2026-09-30.endive`), then forward webhooks with the Stripe CLI and run the payment test matrix.
