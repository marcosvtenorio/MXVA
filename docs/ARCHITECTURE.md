# Route map and component tree

Screenshot-free. "Top / content / bottom" describes where each part sits on a phone; desktop uses the same column (max 480px for funnel screens, two columns on the landing from 960px).

## Routes

| Route | Top | Content | Bottom | Notes |
|---|---|---|---|---|
| `/` | `SiteHeader` (wordmark, Sample report) | Stage (lit seamless + light-test head + readouts), two-tone hero, how it works, what you get, privacy, what we won't do, FAQ, price | Start CTA, `SiteFooter`, `ConsentBanner` | Static; the only page meant for sharing (Open Graph image) |
| `/start` (step 01) | Back, `01 / 16 · Start`, 16-tick meter | Hero copy, small stage, `AgeGate` (18+ / under 18) | Start | Under 18 → refusal, flow blocked for the tab |
| `/onboarding/goals` … `/onboarding/review` (steps 02–16) | Back, step count, 16-tick meter (`role=progressbar`) | Two-tone question anchored above the action; `ChoiceCards` / `ChoiceChips` / fields | Continue (+ Skip on 06–11), sticky | Step guard sends deep links and reloads to the first incomplete step |
| `/onboarding/photos` (14) | as above | `PhotoCapture`: front stage (camera / library / retake, live checks), two profile tiles, ownership checkbox, privacy and reload notice | Use these photos | Photos in RAM only |
| `/onboarding/delivery` (15) | as above | Email, photo-processing consent, terms, separate marketing opt-in (RHF + Zod) | Continue | Email and consents never written to storage |
| `/onboarding/review` (16) | as above | Photo-ready indicator, goals summary with Edit links, included items, price, no-storage note | Continue to checkout (creates the order) | No analysis before payment |
| `/checkout` | Back, `CHECKOUT`, Secure | Two-tone head, Sample panel with price, includes, payment (Stripe Payment Element, or the dev preview simulator) | Consent disclosure, Refunds · Help · Privacy | No countdowns, no locked portrait |
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
├── components/checkout         CheckoutView (CheckoutSummary + PaymentForm), StripePaymentForm (Phase B)
├── components/results          ProcessingView (ProcessingStatus, reselect), ResultView (ResultHero, ReportSection,
│                               ResearchCitation, DownloadReport, ClearResults)
└── components/marketing        SiteFooter, TrackedLink
```

## Server

```
src/app/api/
  orders            POST  create order + checkout session (no photos)
  orders/current    GET   server-confirmed public status
  stripe/webhook    POST  signature-verified payment facts (Phase B)
  fulfill           POST  multipart photos → NDJSON phases → result (paid orders only)
  fulfill/retry     POST  reset a retryable failure (no charge)
  consent/withdraw  POST  stop unstarted processing
  events            POST  allowlisted analytics intake
  dev/mock-pay      POST  development only; 404 in production
  health            GET   modes only, no secrets
src/server/
  config.ts           fail-closed env parsing, payment/fulfilment modes
  http.ts             error contract, size-capped body readers
  security/           headers (CSP etc.), session (HMAC cookie), csrf, rate-limit
  payment/            adapter (mock), stripe (Checkout Sessions, webhook → payment facts)
  ai/                 prompts, vision-adapter, image-edit-adapter, identity-qc (mock + OpenAI)
  mail/               email-adapter (mock + Resend), report email copy
  photos/validate.ts  sharp re-validation and re-encode
  fulfillment/        pipeline
  analytics/          PostHog + Meta CAPI sinks, server events
src/features/         onboarding, photos, orders, report (schema, library, planner, references, pdf), analytics, results, checkout
```
