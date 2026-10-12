# Route map and component tree

Screenshot-free. "Top / content / bottom" describes where each part sits on a phone; desktop uses the same column (max 480px for funnel screens, two columns on the landing from 960px).

## Routes

| Route | Top | Content | Bottom | Notes |
|---|---|---|---|---|
| `/` | `SiteHeader` (wordmark, Sample report) | Stage (lit seamless + light-test head + readouts), two-tone hero, how it works, what you get, privacy, what we won't do, FAQ, price | Start CTA, `SiteFooter`, `ConsentBanner` | Static; the only page meant for sharing (Open Graph image) |
| `/start` (step 1 of 6) | Back, step count, meter | Hero copy, small stage, "By continuing, you confirm you're 18 or older…" with Terms and Privacy links | Start | — |
| `/onboarding/photo-guide`, `/photos`, `/constraints` (optional: anything to avoid), `/delivery`, `/review` | Back, step count, meter (`role=progressbar`) | No aesthetic questions: hair, skin, brows, facial hair, eyes, teeth and jawline are decided from the photo on the server (`src/features/report/derive.ts`) | Continue, sticky | Step guard sends deep links and reloads to the first incomplete step |
| `/onboarding/photos` (14) | as above | `PhotoCapture`: front stage (camera / library / retake, live checks), two profile tiles, ownership checkbox, privacy and reload notice | Use these photos | Photos in RAM only |
| `/onboarding/delivery` (15) | as above | Email, photo-processing consent, terms, separate marketing opt-in (RHF + Zod) | Continue | Email and consents never written to storage |
| `/onboarding/review` (16) | as above | Photo-ready indicator, goals summary with Edit links, included items, this visitor's price, no-storage note | Continue to checkout | No analysis before payment |
| `/checkout` | Back, `CHECKOUT`, Secure | Two-tone head, Sample panel with price, includes, payment: **Pix** (visitors in Brazil first: generate code → QR + Pix Copia e Cola → live status, real expiry time) or **card** (Stripe Payment Element; dev simulator without keys). The order is created here, once the method is known | "Pay by card instead" / "In Brazil? Pay with Pix", consent disclosure, Refunds · Help · Privacy | No countdowns, no locked portrait |
| `/processing` | Full-bleed stage, key light off, `LIGHT · OFF` | Raised sheet: status, the five real server phases, reselect-photo recovery | Keep-open guidance, support | Server-confirmed payment only |
| `/result` | Full-bleed `Today | Concept` compare (slider), disclaimer capsule, readouts | Raised sheet: priorities (evidence capsule first), 7/30/90 plan, what photos can't tell, professional questions, sources | Download PDF, email status, Clear from this device | Rendered from memory; reload → "check your email" |
| `/sample-report` | `SiteHeader` | Generic, non-personalized sample | Start CTA, footer | Pre-purchase value demo |
| `/help`, `/privacy`, `/terms`, `/refunds` | `SiteHeader` | `ProsePage` | footer | Legal pages are drafts pending review |

## Components

```
src/app/layout.tsx              fonts, metadata, ClientBootstrap, AnalyticsProvider (Suspense)
├── components/common
│   ├── SiteHeader, ProsePage, ConsentBanner, InlineError, icons
│   ├── StudioArt               PlasterHead, ProfileHead, CropMarks (per-instance gradient ids)
│   ├── ClientBootstrap         answer recovery + RAM lifecycle guards (pagehide)
│   └── AnalyticsProvider       page views, web vitals
├── components/onboarding
│   ├── OnboardingFrame         header + meter + main + sticky action (AppShell/OnboardingLayout)
│   ├── StepHeading             two-tone h1, focus on mount (StepHeading/StepDescription)
│   ├── controls                ChoiceCards (radio OptionCard), ChoiceChips (checkbox ChoiceChip)
│   ├── StepRouter              step id → screen
│   └── steps/                  Start, Goals, Focus, Timeline, Budget, Preference (skin/brows/eyes/smile/jaw),
│                               Hair, Constraints, PhotoGuide, Photos, Delivery, Review, StepBody/StepActions
├── components/photos/PhotoCapture   FrontSlot, ProfileTile, QualityList (PhotoQualityNotice)
├── components/checkout         CheckoutView (method choice), PixPayment + PixQrCode (QR drawn from the code), StripePaymentForm, PriceTag
├── components/results          ProcessingView (ProcessingStatus, reselect), ResultView (ResultHero, ReportSection,
│                               ResearchCitation, DownloadReport, ClearResults)
└── components/marketing        SiteFooter, TrackedLink
```

## Server

```
src/app/api/
  checkout/options  GET   payment methods on offer (Pix, card) with server prices
  orders            POST  create order + Pix charge or card session (no photos)
  orders/current    GET   server-confirmed status; asks AbacatePay / Stripe while pending
  stripe/webhook    POST  signature-verified payment facts
  abacatepay/webhook POST secret-checked; charge state re-read from AbacatePay
  fulfill           POST  multipart photos → NDJSON phases → result (paid orders only)
  fulfill/retry     POST  reset a retryable failure (no charge)
  consent/withdraw  POST  stop unstarted processing
  events            POST  allowlisted analytics intake
  dev/mock-pay      POST  development only; 404 in production
  dev/pix-simulate  POST  development + AbacatePay sandbox only; 404 in production
  health            GET   modes only, no secrets
src/server/
  config.ts           fail-closed env parsing, payment offers per method, fulfilment mode
  http.ts             error contract, size-capped body readers
  security/           headers (CSP etc.), session (HMAC cookie), csrf, rate-limit
  payment/            adapter (mock card + mock Pix), abacatepay (Pix: create/check/simulate, webhook),
                      stripe (Checkout Sessions, session check, expire, webhook → payment facts)
  ai/                 prompts, vision-adapter, image-edit-adapter, identity-qc (mock + OpenAI)
  mail/               email-adapter (mock + Resend), report email copy
  photos/validate.ts  sharp re-validation and re-encode
  fulfillment/        pipeline
  analytics/          PostHog + Meta CAPI sinks, server events
src/features/         onboarding, photos, orders, report (schema, library, planner, references, pdf), analytics, results, checkout
```
