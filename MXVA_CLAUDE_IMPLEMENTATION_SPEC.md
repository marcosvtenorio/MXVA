# PROJECT MXVA — CLAUDE CODE IMPLEMENTATION SPECIFICATION
**Version:** 3.0 | **Date:** 11 October 2026 | **Language of product:** English | **Markets:** Worldwide, including Brazil | **Audience:** Adults 18+ only  
**Status:** Engineering source of truth. **MXVA is the chosen product name**, subject to trademark, domain and social-handle clearance. Final logo, typography, palettes, animations and detailed UI belong to the owner's Claude design skill.

> **Send THIS file to Claude Code, not the business-growth playbook.** It defines the app that should actually be built. Implement in phases, with a working onboarding first. Do not assume that naming, providers, payment accounts or API credentials are already configured. Show safe placeholders instead of faking production integrations.

---

## 0. IMMEDIATE INSTRUCTION FOR CLAUDE CODE

You are the lead full-stack engineer for a privacy-first, mobile-first, English-language looksmaxxing web product (product name MXVA). Read this whole specification and obey the non-negotiable decisions. Build a robust working repository with clear abstractions and tests. Begin with **Phase A: real onboarding, client-only photograph selection, photo quality checks, accessible paywall and simulated fulfillment in development mode**. The UI is designed separately using an installed design skill. Implement semantic component structures, responsive layouts and component contracts, **NOT** high-fidelity wireframes, invented brand assets or an arbitrary art direction.

Follow this sequence: (1) inspect repository and installed skill/instructions; (2) summarize architecture and constraints briefly; (3) implement Phase A in running code; (4) provide validation/tests; (5) scaffold production provider adapters; (6) implement real payment and fulfillment only after required credentials and integration tests. Never charge a real customer if photo transformation, report PDF and email delivery have not passed end-to-end testing. Do not ask repeated questions if choices can be implemented behind configuration flags.

### Core decisions — do not change

1. **Paid-only results.** There is **no free results preview**, no free face score, no partial AI assessment. Before payment, show only entered preferences, a non-personalized sample report and a precise explanation of what the user will receive. Do not say "analysis complete" if no analysis has happened.
2. **Two paid outputs together:** (a) a personalized **AI-edited, aspirational looksmaxxing visualization of the same person**, and (b) a grounded, detailed improvement roadmap. Both appear inside a single downloadable PDF, delivered by email after purchase. A temporary browser results view may show the same outputs.
3. **Photos are never stored permanently by this application.** Do not upload them to Supabase Storage, S3, public buckets, databases, persistent disk, logs, analytics, browser cookies, localStorage or sessionStorage. Keep photo File/Blob objects in **volatile browser memory** before payment and **volatile server/worker RAM** during fulfillment. Erase references as soon as no longer needed. External processor/email-provider retention is separate and must be disclosed honestly.
4. **Global audience; English creative/UI.** Brazil is included. Do not geo-block or hardcode a US/UK-only signup. Paid ads in English; run country-cohort analysis instead of assuming one worldwide CAC. Optionally localize payment display where Stripe supports it.
5. **One-time purchase, no recurring billing.** Default configurable price USD $29; tests $19 / $29 / $39 are business experiments, not frontend-authoritative prices. Never misrepresent local taxes or FX.
6. **18+ only.** Require confirmed adult status, clear refusal for minors, no biometric/medical diagnosis, beauty rankings, humiliating defect labels, weight-restriction advice, or guarantees of bone/eye structure transformation.
7. **Focus on face-related, feasible categories** (skin-care presentation, eyebrow styling, eye-area presentation, grooming/facial hair, hairline/hair framing, smile/teeth care, jaw/chin *visual presentation*). Professional dental/dermatological care may be recommended as a consultation, not diagnosed or sold as an assured fix.
8. **No wireframe images and no screen designs** in specification or output. Use the semantic component and layout blueprint below. It is intentionally design-neutral.
9. **No autonomous downloading or external install beyond ordinary, reviewed package dependencies.** Never bypass network protections. API keys only on server.

## 1. PRODUCT DEFINITION & EXPERIENCE CONTRACT

**One-sentence offer:** "Upload clear face photos, choose your goals, and unlock a realistic AI transformation concept plus a research-informed, prioritized action plan." The result is a concept visualization, not a predicted future outcome.

**Full funnel:**

```
Instagram Reels / organic posts / Meta ads (English; global incl. BR)
   → Landing page → 16-step adult onboarding → photos held in browser RAM
   → Review & paywall [NO PERSONAL RESULT]
   → Embedded Stripe payment or authorized redirect
   → Server-confirmed paid order
   → Photo handoff from browser / ask to reselect if browser context was lost
   → Vision assessment → recommendation guardrails → identity-preserving image edit
   → PDF (visualization + written roadmap + citations)
   → Email PDF attachment → Ephemeral result display + Download PDF
   → Images and PDF cleared from app RAM at end of session / request
```

**Pre-purchase value demonstration:** show a generic sample excerpt, what is included, privacy facts, one-time price, payment methods, estimated *range only if measured*, refunds, contact info and consent. Never reveal any user-specific analysis before successful payment.

**Output:** one edited image as the visual hero; paired with sectioned report: selected goals; observed visible features (non-diagnostic); options ranked by feasibility/evidence/effort/cost, not numerical attractiveness; 7-day basics, 30-day and 90-day roadmap; low-risk at-home care; optional professional consults; source links with publication dates and limitations; simulation disclaimer; editorial footer.

**Image output behavior:** call a genuine *image-edit* API with the user's face image as reference. Preserve identity, face geometry, skin tone, age appearance and facial proportions. Allow achievable, non-invasive-looking concept changes from user's chosen categories (eyebrow grooming/fill, hair/framing, beard grooming, lighting, natural-looking skin clarity, smile presentation). Do not digitally invent a new maxilla, forcibly reshape eyes/jaw, erase distinctive features, change ethnicity or produce a supposed guaranteed surgical after-photo. Label "AI concept preview; not a guaranteed result" on screen and PDF. If fidelity is inadequate or the image service fails, do not substitute a random attractive stock face: show retry/support/refund options.

## 2. STACK & RESPONSIBILITIES

| Layer | Recommendation | Explicit purpose |
|---|---|---|
| Runtime | Next.js App Router + React + TypeScript, Node.js server runtime | English mobile-first website and protected API handlers |
| Styling | Tailwind CSS + accessible headless primitives | Design skill owns tokens/styles; implementation owns semantics/responsive behavior |
| Forms/state | React Hook Form + Zod + context/Zustand *in-memory only for photos* | Per-step validation, progress and conditional questions |
| Checkout | Stripe Checkout Sessions API with embedded Payment Element (current Stripe recommended approach) | One-time global payment; handle redirects and webhook verification |
| Order metadata | Postgres via Supabase **database only** (optional for prototype, required for real recovery) | Paid state, email, consent version, delivery status, idempotency; never image bytes |
| Image analysis | Pluggable vision model returning strict JSON | Describe only evident, visible presentation cues and uncertainty |
| Image visualization | OpenAI Images Edit provider behind adapter (configurable) | Identity-preserving edit of supplied face photo |
| Source library | Versioned, curated citations stored in repository | Avoid fabricated medical or cosmetic research links |
| PDF | `pdf-lib` or server-side PDF library with embedded image bytes | Compile complete report, inspect size and fonts |
| Email | Resend or equivalent provider with binary attachment, after provider limits validation | Deliver PDF; provider keeps its own delivery copies/logs |
| Analytics | Privacy-minimized event tracking + Meta Pixel/CAPI where consented | Only funnel counts / anonymized order metadata; **NO face photos, filenames, face descriptions or medical info** |
| Deployment | Node process with sufficient memory/time budget | Long inference can exceed short serverless timeouts: benchmark and select suitable hosting |

**Verify SDK syntax and hosting quotas against installed versions** before wiring production. Stripe currently recommends Checkout Sessions with Elements for many implementations. Do not hardcode deprecated model names. See source URLs in §15.

### Runtime secrets and flags

```dotenv
NEXT_PUBLIC_BRAND_NAME=MXVA
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_ENABLE_REAL_PAYMENTS=false
NEXT_PUBLIC_ENABLE_REAL_AI=false
NEXT_PUBLIC_SHOW_DEV_PREVIEW=true
PRICE_USD_CENTS=2900
STRIPE_SECRET_KEY=
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=
STRIPE_WEBHOOK_SECRET=
DATABASE_URL=
VISION_API_KEY=
VISION_MODEL=
IMAGE_API_KEY=
IMAGE_EDIT_MODEL=gpt-image-2
RESEND_API_KEY=
EMAIL_FROM=
SUPPORT_EMAIL=
COOKIE_SIGNING_SECRET=
```

Real provider routes must fail closed with actionable configuration errors. Public flags must never allow clients to choose price or mark an order paid. Dev mock endpoints only on development/test builds and may never be deployed as production unlocks.

## 3. SEMANTIC SCREEN BLUEPRINT — NO VISUAL DESIGN

**Universal mobile scaffold for onboarding steps:**

```
<AppShell>
  <SiteHeader> [LogoWordmark] [optional privacy/info action] </SiteHeader>
  <ProgressHeader> [BackButton] [StepCount] [ProgressIndicator] </ProgressHeader>
  <main>
    <StepContent>
      <StepHeading />       // short English headline
      <StepDescription />   // supporting reason/privacy note
      <QuestionControl />   // tiles, options, fields or photo input
      <InlineValidation />  // accessible, non-shaming
    </StepContent>
  </main>
  <StickyBottomAction> [PrimaryContinueButton] [optional Skip/Secondary] </StickyBottomAction>
</AppShell>
```

Header stays at top; content can scroll; primary action reachable at bottom without covering input; avoid full-height keyboard traps. Respect reduced motion and 320px viewport. Desktop max-width content column selected by design skill, no hardcoded pixel-perfect mockups. Browser back should navigate to previous *safe* step; the upload prompt must explain that tab reload loses selected photos.

**Exactly 16 pre-pay steps (route names are canonical):**

| # | URL | Top/center components | Lower/action components | Validation / conditional |
|---|---|---|---|---|
| 01 | `/start` | Hero, clear offer, `Age18ConsentToggle` | `StartCTA`, terms/privacy | 18+ confirmation required; reject underage |
| 02 | `/onboarding/goals` | `SingleChoiceCards` (clear skin, brow definition, smile, hair, grooming, overall) | Next | at least 1 goal |
| 03 | `/onboarding/focus` | `MultiChoiceChips` for skin, brows, eye-area styling, hair, facial hair, smile, jawline presentation | Next | 1–4 priorities |
| 04 | `/onboarding/timeline` | `SingleChoiceCards` (this week / 30 days / 90 days / flexible) | Next | required |
| 05 | `/onboarding/budget` | `BudgetSelector` (no spend / low / moderate / flexible), currency-neutral | Next | required |
| 06 | `/onboarding/skin` | `SkinGoalsSelector` (routine, clarity, uneven tone, under-eye look, none) | Next + Skip | no diagnosis / no treatment prescription |
| 07 | `/onboarding/brows` | `BrowPreferenceSelector` (shape, grooming, fuller visual look, none) | Next + Skip | subjective preference |
| 08 | `/onboarding/eyes` | `EyeAreaPreferenceSelector` (rested appearance, grooming, none) | Next + Skip | no promised shape change |
| 09 | `/onboarding/hair` | `HairGoalsSelector` + optional facial-hair preferences | Next + Skip | gender-neutral, branch if facial hair not relevant |
| 10 | `/onboarding/smile` | `SmileGoalsSelector` (hygiene, whitening info, alignment consult, none) | Next + Skip | professional context if selected |
| 11 | `/onboarding/jaw` | `LowerFaceGoalSelector` (grooming, facial framing, photo presentation, none) | Next + Skip | do not claim bone growth via exercise |
| 12 | `/onboarding/constraints` | `TimeBudgetChoice`, avoid-products choice, optional text note | Next | no sensitive medical intake required |
| 13 | `/onboarding/photo-guide` | `CaptureRequirements`, sample neutral illustrated icons **provided by design skill** | `UnderstoodCTA` | front image required; 2 side profiles optional |
| 14 | `/onboarding/photos` | `CameraInput`, `FilePicker`, `PhotoPreview`, `RetakeButton`, `QualityFeedback` | `PhotoConfirmCTA` | front face required, self-photo ownership permission, MIME/size/orientation |
| 15 | `/onboarding/delivery` | `EmailInput`, `ExplicitPhotoProcessingConsent`, privacy disclosure, terms checkbox | Next | valid email + explicit consent; marketing opt-in separate |
| 16 | `/onboarding/review` | `GoalsSummary`, `PhotoReadyIndicator`, `DeliveryEmailSummary`, `IncludedInPurchase`, `NoImageStorageExplanation` | `ContinueToCheckoutCTA` | price before payment; no analysis/preview |

Then `/checkout` (paywall/payment UI), `/processing` (after confirmed payment), `/result` (temporarily rendered, not persisted), `/help`, `/privacy`, `/terms`, `/refunds`. Checkout is *not* counted among the 16 preference/intake steps.

**Checkout arrangement (not a wireframe):** top `CheckoutHeading`, concise `IncludedDeliverables` (1 AI concept portrait + actionable sourced PDF + email delivery), middle `OneTimePrice` and `PaymentElement`, bottom `ConsentDisclosure` and `SecurePaymentCTA`; supporting `PrivacyNote`, `RefundLink` and `HelpLink`. Never display a fake locked user's generated portrait, invented personal face facts, countdown timers or false scarcity.

**Processing arrangement:** `PaymentConfirmedStatus`, `ProcessingPhaseLabel` ("Preparing image", "Building report", "Sending email" — only reflect actual server phases), optional user guidance to keep tab open, `RetryContactBox`, `NoImageStorageNotice`. No simulated progress percent unless based on real completed phases.

**Result arrangement:** top `SimulationDisclosure`, then `AIConceptImage` with download accessibility, `ReportHighlights`, `ResearchSources`, `PDFDownloadButton`, `EmailDeliveryStatus`, `ClearResultsButton`, support/refunds. Product design may choose image first or report first, but both are included in same paid deliverable. Browser state cleared on closing/reloading; the **emailed PDF is the durable copy**.

### Shared component inventory

`AppShell`, `SiteHeader`, `OnboardingLayout`, `StepHeading`, `StepDescription`, `ProgressIndicator`, `OptionCard`, `ChoiceChip`, `BackButton`, `StickyActionBar`, `InlineError`, `AgeGate`, `PhotoCapture`, `PhotoQualityNotice`, `ConsentCheckbox`, `EmailCapture`, `CheckoutSummary`, `CheckoutPaymentForm`, `ProcessingStatus`, `ResultHero`, `ReportSection`, `ResearchCitation`, `DownloadReport`, `SessionExpirationAlert`, `RefundHelp`, `PrivacyDisclosure`, `ToastHost`, `ErrorBoundary`.

All controls keyboard-operable, meaningful labels, touch target >=44 CSS px, focus management on step change, clear error association via `aria-describedby`, not color-only validation. Do not create high-fidelity screen PNGs.

## 4. STATE & TYPE CONTRACT

TypeScript type design (implement via Zod schemas and inferred types; the snippet is illustrative):

```ts
type FocusArea = 'skin' | 'brows' | 'eye_area' | 'hair' |
  'facial_hair' | 'smile' | 'jaw_presentation';

type OnboardingAnswers = {
  adultConfirmed: true;
  goals: string[];
  focusAreas: FocusArea[];
  timeline: 'week' | '30d' | '90d' | 'flexible';
  budget: 'none' | 'low' | 'moderate' | 'flexible';
  preferences: Record<string, string[]>;
  constraints?: string;
  email: string;
  faceProcessingConsentVersion: string;
  termsVersion: string;
  marketingOptIn: boolean;
};

type VolatilePhotoState = {
  front?: File;   // REQUIRED; RAM-only, no persistence
  left?: File;
  right?: File;
  previewObjectUrls: string[]; // revoke after replacement and exit
};

type PriorityRecommendation = {
  area: FocusArea;
  observation: string; // never a diagnosis
  suggestion: string;
  reason: string;
  evidenceLevel: 'established' | 'limited' | 'styling_opinion';
  effort: 'low' | 'medium' | 'high';
  costBand: 'free' | 'low' | 'medium' | 'professional';
  horizon: 'now' | '30d' | '90d' | 'professional';
  uncertainty: string;
  sourceIds: string[]; // real IDs from curated bibliography
};

type PaidReport = {
  title: string;
  disclaimer: string;
  recommendations: PriorityRecommendation[];
  sevenDayPlan: string[];
  thirtyDayPlan: string[];
  ninetyDayPlan: string[];
  professionalQuestions?: string[];
  usedSources: { id: string; title: string; url: string; accessedAt: string }[];
  imageEditSummary: string[];
};
```

**Persistence policy:** regular answers may optionally persist to `sessionStorage` (non-image, non-sensitive short survey data only) with user explanation and TTL. Photos **never persist**, even in IndexedDB, cookies, service-worker cache, Cache API or browser history state. No image in URL, JSON logs, error reporting, query strings or analytics. Never use a data URL with the raw face photo in local storage. No account required in V1.

## 5. CRITICAL ARCHITECTURE: PAYMENT + NO STORED PHOTOS

There is an unavoidable tradeoff: payment redirects, page refreshes, external latency and email retries usually require durable jobs or inputs. The product **forbids permanent raw-image storage**. Therefore implement the following transparent recovery-first V1 instead of pretending it's perfect:

**Recommended happy path (embedded checkout):**

1. After photo step, hold original `File` in a React Context or in-memory store at top-level layout. Use `URL.createObjectURL` only for browser preview, revoke on clear/unmount.
2. Collect contact email and consent. Call backend `POST /api/orders` (without photo bytes), which creates minimal metadata row and embedded Stripe Checkout Session. The server computes authorized price; returns client secret and opaque signed order token tied to a short-lived httpOnly SameSite=Lax cookie.
3. Render embedded Stripe Payment Element on `/checkout`, avoiding full-page redirect where possible. A bank authentication or payment-method redirect can still occur. Make that visible in UI: "We don't save face photos. If your payment opens another page, we may ask you to select your photo again after payment. You will not be charged twice."
4. Backend webhook verifies the raw Stripe payload signature, `checkout.session.completed`/payment state as appropriate, and updates `orders.status = paid` idempotently. The browser must also **query the server** for status. Never trust client `?success=true` or Stripe return values alone.
5. After `paid`, if selected photo still exists in RAM call `POST /api/fulfill` with signed order session + multipart images + validated answer JSON. Otherwise show **"Reselect your photos to complete your paid report"** — no second charge.
6. Server atomically claims a fulfillment attempt, ensures 18+ consent/order ownership, validates image MIME/byte caps/quality, and processes face bytes **in RAM only**, calls analysis and image-edit providers, creates PDF in RAM, sends attachment using email provider, then returns limited JSON results/PDF bytes to the connected page if still available. Ensure runtime limits are tested; a persistent Node worker may be necessary.
7. Set `fulfilled` only after successful email provider acceptance and complete PDF. Distinguish `processing`, `generated_email_failed`, `delivered_to_provider`, `failed_retryable` and `needs_support`; provider acceptance is not proof of final inbox placement.
8. Client shows the paid result in volatile memory; downloads via Blob object URL; delete/revoke on exit. No permanent results link. On refresh after success, show "Check your email for your report" rather than requesting re-payment.

**Failure limits:** With a strict no-storage architecture, **we cannot guarantee automatic fulfillment after an interrupted browser upload or worker crash**. Implement a paid-order recovery page where the buyer can securely re-upload without repaying. If provider timed out after email may already have sent, avoid double delivery by checking the idempotent order status. For irrecoverable problems, human support or refund. No promises of 100% background recovery. If business later demands guaranteed asynchronous completion, it must explicitly approve an encrypted, access-restricted *temporary* storage TTL strategy, which is **out of scope**.

**Security rules:** use Stripe webhook verification over raw body; signed short-lived session and CSRF protection; rate limit by IP/order and constrain requests; authorize paid order server-side; serialize retries; ensure payment intent/session amount/currency/product matches approved SKU; one fulfillment per paid order; do not expose Stripe secret or email API key. Preserve minimal business/order data long enough for payment disputes and support under a disclosed retention schedule.

## 6. DATA CONTRACT AND BACKEND ENDPOINTS

**Minimal `orders` row** (metadata only): `id uuid`, `stripe_checkout_session_id`, `stripe_payment_intent_id?`, `email`, `currency`, `amount_minor`, `country_hint?`, `price_variant`, `status`, `consent_version`, `terms_version`, `created_at`, `paid_at?`, `fulfillment_attempts`, `email_provider_message_id?`, `last_failure_code?`, `fulfillment_version`, `completed_at?`. Optional `events` table stores anonymous funnel/event IDs and order changes; **never store images**, generated portraits, complete photo descriptions, raw images, image embeddings or biometric template data.

**Endpoints** (all POSTs have Zod validation, meaningful JSON errors, `Cache-Control: no-store`):

| Method | Route | Authentication | Data / response |
|---|---|---|---|
| POST | `/api/orders` | CSRF + per-IP rate limit | validated email, SKU; creates checkout session, order cookie; no photos |
| GET | `/api/orders/current` | signed session | safe paid/fulfillment status, no PII leakage |
| POST | `/api/stripe/webhook` | Stripe signature/raw bytes | idempotent payment and refund state transitions |
| POST | `/api/fulfill` | signed order + server verified `paid` | multipart: 1 required image + optional 2; structured preference payload; returns generated results after complete |
| POST | `/api/fulfill/retry` | order owner + retry eligibility | resets a retryable *state*, re-selection still necessary |
| POST | `/api/consent/withdraw` | session ownership | erase volatile client data, halt unstarted processing where feasible |
| GET | `/api/health` | public | no provider secrets |

**Server errors:** `PHOTO_REQUIRED`, `UNSUPPORTED_IMAGE_TYPE`, `PHOTO_TOO_LARGE`, `PHOTO_QUALITY_INSUFFICIENT`, `AGE_RESTRICTED`, `CONSENT_REQUIRED`, `ORDER_NOT_PAID`, `ORDER_SESSION_INVALID`, `ALREADY_PROCESSING`, `AI_PROVIDER_FAILED`, `SIMULATION_QUALITY_FAILED`, `PDF_GENERATION_FAILED`, `EMAIL_FAILED`, `RATE_LIMITED`, `SERVICE_UNAVAILABLE`. Frontend maps each to accessible next action.

**Photo validation:** accept `image/jpeg`, `image/png`, `image/webp` where providers support. HEIC on iOS may need *client-side* conversion via browser-safe library, verified locally and never persisted. Target max 8 MB/photo (configurable); max dimension cap for safe decoding; reject disguised MIME/extensions, decompression bombs and multiple faces where applicable. Strip EXIF metadata before provider transfer in memory. Ask only for front portrait; profiles optional, no promises of precise jaw metrics from smartphone photos. Never require a teeth close-up to unlock the product.

## 7. AI PIPELINE & EVIDENCE RESTRICTIONS

**Flow:** `PhotoValidator → VisualObservations → RecommendationPlanner → ImageEdit → IdentityQualityGate → PDFComposer → EmailSender`.

**VisualObservations** must return strict JSON validated by Zod. Observations only if visible with sufficient quality; each includes `confidence: high|medium|low`, `lightingLimitations` and selected user goals. No clinical detection of acne disorders, tooth disease, trauma, ethnicity, inferred medical conditions or "attractiveness score". Do not infer that someone's appearance predicts trustworthiness, success, desirability or social value.

**RecommendationPlanner** merges visual observations, goals, budget/time preferences and a curated evidence database; rank recommendations using documented factors (user relevance, safety, ease, cost, evidence). The model cannot fabricate peer-reviewed studies or add URLs outside the approved reference registry. Where source evidence is absent, tag `styling_opinion`. When in doubt state "cannot be assessed from this photo". Professional health advice must be phrased as "consider consulting a qualified professional about...", not diagnosis or treatment instructions.

**ImageEdit** uses the original user image rather than text-to-image from scratch. Candidate edit instructions:

```
Edit this portrait as a realistic, optional facial presentation concept for the same
adult person. Preserve their identity, age appearance, skin tone, unique features,
facial bone structure, nose, eye shape, jaw geometry, face proportions and expression.
Apply only requested low-risk, visually plausible changes: tasteful eyebrow grooming/
fill if selected, natural hairstyle or facial-hair grooming if selected, realistic skin
presentation improvements, natural smile presentation and clean consistent lighting.
No dramatic reshaping, artificial symmetry, beauty filters, extra facial features,
unrealistic skin, altered ethnicity or implied medical outcomes. Retain recognizable
likeness and original camera framing. This is a concept visualization, not a prediction.
```

**IdentityQualityGate:** human-readable automated checks for face still recognizable, no added person, reasonable edit, no broken teeth/eyes and no excluded changes. Can compare with vision checks, but don't use a face-recognition identity database/biometric embedding as V1 shortcut. If fails, retry with stricter prompt or surface recoverable error; never email distorted face as final deliverable.

**Report must contain:** cover with user's chosen goals (no portrait in email body), *paid AI concept image*, what was changed, visible observations with uncertainty, 5–8 prioritized suggestions, 7/30/90-day schedule, budget/effort estimates clearly labeled illustrative, "what photos cannot tell us", optional professional questions, references with full URLs, limitation and privacy note. The **same edited portrait** must appear on results screen and in the PDF. Avoid recommending medications, supplements, extreme exercise/diets, risky cosmetic procedures or unverified jaw/eye hacks.

## 8. EMAIL & PDF CONTRACT

- Deliver to validated email given before checkout; optionally confirm matching Stripe payer address or collect the delivery address explicitly.
- Subject: `Your personalized looksmaxxing report is ready` (brand dynamic).
- Attach a single PDF containing **image and report**, with filename `your-appearance-roadmap.pdf`; not a link to stored image. The branded PDF is included in the one-time price.
- Generate and hold PDF bytes in RAM; if using a service that requires attachment submission, understand the service necessarily processes/retains the email attachment per its own terms. This does not mean "no provider stores anything".
- Audit final PDF: embedded image present, citation URLs clickable, nonempty pages, no placeholders, no personal image in stdout/logs. Optimize image/PDF compression to meet verified email API and mailbox attachment size limits. Check provider-specific max sizes before implementation.
- Recipient may keep email/PDF indefinitely; retention is outside app control. Prominently describe that emailed files are permanent in a recipient's mailbox unless they delete them.
- Email failures: do not mark fulfilled; expose support/refund path and state transitions for retry without a second charge. Suppress duplicates.

## 9. PRIVACY, SECURITY, COMPLIANCE & RESTRICTED CASES

**Privacy policy must say precisely:** face photos are transmitted temporarily to the application's server and selected AI processors to generate the purchased service; no raw photo is intentionally written to application-controlled permanent storage; external processors have their own processing, safety review and retention schedules; recipient email provider stores/handles attached PDF; the operator retains minimal order/email metadata for fulfillment/accounting; browser progress does not persist original images; refund/data-contact address and retention schedule.

**Never claim:** "your photos never leave your device", "nothing is stored anywhere", "100% anonymous", "zero retention across every provider" or "FDA/medical accuracy". A person may be identifiable from face images even without explicit biometric identification; conduct a privacy review with GDPR/LGPD and applicable market counsel. Avoid generating face embeddings and facial recognition templates entirely. No third-party marketing pixels on photograph route until consent handling has been audited; never forward photo URLs/images or reports to Meta analytics.

**Eligibility:** age gate 18+; reject photos whose holder indicates a minor. Require self-photo and permission for edits; deny third-party submissions without adequate consent. Prevent sexualized or harassing transformations. Opt-out marketing separate. AI output must not rank races, suggest ethnic/skin-lightening goals or use degrading terms about natural features.

**Basic controls:** HTTPS, content-security policy, CSRF/signed cookies, cookie `HttpOnly; Secure; SameSite=Lax`, upload bounds, request timeout handling, WAF/rate limits, headers `Cache-Control: no-store`, disable CDN caching on sensitive endpoints, avoid tracing payload, redact errors, set least-privilege API scopes, no accidental crash dump storage. Include data access/deletion request instructions.

## 10. ANALYTICS & ATTRIBUTION

Track only aggregate/consented events: `landing_view`, `onboarding_start`, `onboarding_step_completed` (step ID only), `photo_ready` (boolean, never bytes), `checkout_started`, `payment_succeeded`, `fulfillment_started`, `email_provider_accepted`, `result_viewed`, `refund_requested`. Events need UTM campaign/cohort, coarse region, timestamp, pseudonymous session ID and explicit consent state. No raw answers on image insecurity, photo content, image hash, filenames, metadata or full report. Respect cookie/advertising consent obligations by jurisdiction; Meta Pixel and server-side conversion events require validated consent and deduplication.

Metrics: view-to-start, completion, photo-ready rate, checkout conversion, cost per paid order, payment decline rate, fulfillment success, image QC failure rate, email acceptance rate, refunds, customer feedback. Measure Brazil as a separate market cohort alongside US/CA/UK/AU and other locales; creative remains English.

## 11. FOLDER & SOURCE STRUCTURE

```text
src/
  app/
    (marketing)/page.tsx
    (onboarding)/start/page.tsx
    (onboarding)/onboarding/[step]/page.tsx
    checkout/page.tsx
    processing/page.tsx
    result/page.tsx
    privacy/page.tsx
    terms/page.tsx
    refunds/page.tsx
    help/page.tsx
    api/orders/route.ts
    api/orders/current/route.ts
    api/stripe/webhook/route.ts
    api/fulfill/route.ts
    api/fulfill/retry/route.ts
    api/health/route.ts
  components/
    onboarding/  photos/  checkout/  results/  common/
  features/
    onboarding/{schema,steps,store,navigation}.ts
    photos/{client-processor,memory-store,validator}.ts
    orders/{repository,states,authorization}.ts
    report/{schema,planner,references,pdf}.ts
  server/
    payment/{stripe,adapter}.ts
    ai/{vision-adapter,image-edit-adapter,prompts,identity-qc}.ts
    mail/{email-adapter}.ts
    security/{session,rate-limit,headers}.ts
  lib/config.ts
  data/evidence-sources.json
  types/
  __tests__/
public/  // ONLY public brand assets, never user photos
.env.example
README.md
```

Do not create a public uploads folder, image CDN integration, Supabase storage bucket, logged photo/base64 cache, or face image persistence. Architecture adapters can support swapping vendors without coupling AI prompts to pages.

## 12. BUILD PHASES & ACCEPTANCE CRITERIA

### Phase A — FIRST DELIVERABLE: onboarding/prototype (implement immediately)

- Complete responsive 16-step English onboarding + generic paywall (no real charging) + dev-only mock result flow using **local synthetic fixture photos**, never a real person's photo for testing.
- Typed Zod validation, accessible errors, progress bar, back navigation, refresh recovery of *non-image* answers only, and client-only volatile photos.
- Camera/library input works on iOS Safari and Android Chrome. Reject oversized and invalid images, manage object URLs, disclose refresh loss, and clear on exit.
- Mock summary shows sample content only; no personalized result before mocked payment. All screens usable at 320, 375, 768 and 1440 CSS px.
- Tested with Playwright: start-to-checkout, conditionals, invalid uploads, reload removes images, age gate, screen-reader roles, no data leak in storage or network before payment, mock result disabled in production.
- Deliver README, `.env.example`, component tree, test instructions, and tasks deferred to Phase B.

### Phase B — payment with explicit feature flag

- Stripe embedded Checkout Sessions + Payment Element, webhook verified in raw body, PostgreSQL order metadata, idempotent paid state, 3DS/redirect resilience, re-upload without second charge, taxes/local currency displayed correctly under configured account capabilities.
- Test card success/failure/webhook duplicate/redirect/rejected consent/expired checkout. Do not enable real payments until a report can be generated and emailed.

### Phase C — paid fulfillment

- Live image analysis, curated recommendations, identity-preserving edited portrait, validation, PDF attachment, email delivery, transient results display, retry/support/refund workflows.
- Test paid order with a consenting adult test face; verify client cannot access unpurchased outputs; multiple phones/email clients; provider denial, timeout, latency and crash cases.

### Phase D — operational launch

- English Meta campaign attribution with regional cohorts incl. Brazil, privacy/legal pages reviewed, consent-aware analytics, monitoring without sensitive data, cost caps and performance dashboards, support playbook, refund operation, documented incident and deletion procedures.

### Non-negotiable pass/fail test matrix

| Test | Required outcome |
|---|---|
| Refresh on photo step | Photos gone; typed non-image preferences may remain; clear reselect UI |
| Open payment authorization redirect | Paid entitlement confirmed by server; returning user may reselect, no second charge |
| Client fakes `paid=true` | Server refuses fulfillment |
| Duplicate Stripe webhook | Exactly one valid state progression |
| Request before purchase | `ORDER_NOT_PAID`, no generation |
| PDF email accepted | Correct recipient and attachment with edited image + sourced report |
| Browser closed before photo transfer | Paid order recoverable through authenticated reupload, not fake "sent" email |
| Provider edits face unrecognizably | Automatic QC retry then readable error/support, never deliver fake likeness |
| JS error logging | No photo bytes/base64, no raw face attributes |
| Underage declaration | Cannot upload or pay |
| No consent | Cannot upload/submit to third-party processor |
| Production flags | No simulated result, no mock paid order, no mock provider with real money |

## 13. BUSINESS COPY CONTRACT (ENGLISH)

Use restrained, high-intent language with a clear deliverable:

- Hero: **"Your face. A realistic next-step plan."**
- Support: **"Explore a personalized looksmaxxing roadmap and an AI concept portrait based on your own photos."**
- Photo step: **"Photos are used temporarily to create your report. They aren't saved in our photo database. External AI/email services handle data as explained in our Privacy Policy."**
- Checkout: **"One-time purchase: $29. Includes your AI concept image and full research-informed PDF report, delivered by email. No subscription. No results before payment."**
- Transition: **"Payment confirmed. Let's create your report."**
- Disclaimer: **"This AI-edited image is an illustrative concept, not a prediction or guarantee. Results depend on individual factors and personal choices."**
- Retry after redirect: **"Your payment is safe. Please reselect your photos so we can complete your report — there is no second charge."**

Avoid "you're ugly", "what is wrong with your face", "beautiful people are trustworthy", fake date-rejection causation, fictitious urgent scarcity, "hunter eyes guaranteed" or an alleged medical jaw-bone transformation. Keep all campaign/social copy off the engineering logic layer.

## 14. CLAUDE DELIVERY FORMAT

When implementation completes, return:

1. A running repository, not merely a plan; exact commands for setup, development, test and build.
2. `README.md` with completed phase, remaining phase gates, dependency and credential checklist.
3. `.env.example`, migration for metadata-only orders, source schema, API error contracts and mocked adapters.
4. Screenshot-free component tree and route map showing what belongs in top, content and bottom of each screen.
5. Playwright + unit/integration tests and summarized pass/fail results; include axe accessibility checks if available.
6. A privacy inspection checklist proving app does not persist user photos in browser storage or backend storage.
7. Production blockers explicitly marked — particularly payment fulfillment, email provider quotas, AI provider data retention, taxes and hosting timeouts.

## 15. SOURCE / API REFERENCES (verify at implementation time)

- Stripe Payment Element and current Checkout Sessions recommendation: https://docs.stripe.com/payments/payment-element
- Stripe webhooks, signature verification and event semantics: https://docs.stripe.com/webhooks
- Stripe Next.js/TS example: https://github.com/vercel/next.js/tree/canary/examples/with-stripe-typescript
- OpenAI image edit API: https://developers.openai.com/api/reference/typescript/resources/images/methods/edit
- Image prompting and identity preservation: https://developers.openai.com/api/docs/guides/image-prompting
- Image provider data controls: https://developers.openai.com/api/docs/guides/your-data
- Meta Ads standards (health/appearance & personal attributes): https://transparency.meta.com/policies/ad-standards/
- UK data authority biometric processing (review applicability): https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/lawful-basis/biometric-data-guidance/biometric-recognition/how-do-we-process-biometric-data-lawfully/

