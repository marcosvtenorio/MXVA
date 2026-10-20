# MXVA: judge brief

Self-authored from the code, `design/DIRECTION.md` and the owner's decisions, 2026-10-20.
Mode: **Judge**. The owner keeps the current style for now and will change it a little later.
Rounds are compared in `JUDGE.md`.

## What and who

- MXVA sells one product: an AI glow-up concept of the buyer's own face plus a sourced
  step-by-step grooming plan (7, 30 and 90 days), as a PDF by email. One payment:
  R$ 47,99 by Pix in Brazil (card at the same price in reais), US$ 29 by card elsewhere.
- Buyers: adults 18+, mostly men 18 to 30, arriving **from Instagram**, on a phone,
  inside Instagram's in-app browser, many in Brazil. The site is in English.
- Core job: understand the offer in seconds, add one front photo, pay, get the report by
  email. Nobody waits on screen: the request is confirmed and the PDF arrives in minutes.

## The flow judged

Landing `/` (first visit, cookie choice open) → `/start` → photo guide → photos (empty,
then one photo added) → avoid (constraints) → delivery (email and consents) → review →
checkout (Pix first) → Pix code → processing → delivered. Also `/sample-report`, `/help`,
`/privacy` as the templates of the secondary pages.

## The direction as built

- Concept: "a portrait studio: a grey seamless backdrop under one softbox"
  (`design/DIRECTION.md`). Light, clinical, quiet; register taken from QOVES (layout lessons
  only, none of its content, images or fonts).
- Colour: bone ground `#F4F5F3`, white raised `#FFFFFF`, ink `#111417`, ink-2 `#56626B`,
  rule `#D9DEE0`, one slate accent `#3F5B6B` with one job (selection and progress).
  Primary actions are ink pills. Positive green and negative red are state only. Dark mode
  is its own palette (`prefers-color-scheme`).
- Type: Instrument Sans (display and UI, weights 400 and 600) and Fragment Mono (small
  uppercase labels, counters, prices in tables). Two-tone headlines (ink, then ink-2).
- Landing system (since 2026-10-20): framed column up to 1360px, breakpoints at 768 and
  1100px, section padding 56/16px on phones and 80/32px from 768px, thin "bands" between
  sections (0, 80, 120px), one type scale (hero 36/48/60, section 28/40/48, card 18/20/24,
  lead 15/16).
- Richness: the lit seamless backdrop, a real before/after example (owner-supplied),
  studio readouts and crop marks, the glow-up teaser on checkout.
- Signature: "Key light", the reveal of the concept. It now happens in the emailed PDF,
  not on screen (no report is shown in the browser by design), so the stills can only show
  its echoes (photo readouts, the before/after slider).

## Refused defaults (do not ask for them back)

- The looksmaxxing category look: black grounds, neon violet or acid green, face meshes,
  landmark dots, score dials ("7.8/10"), radar charts, rank badges, gamer slang. MXVA shows
  **no scores, no rankings, no attractiveness claims**.
- Showing the report or the concept image in the browser. Photos are never stored; the
  report lives in the buyer's email only.
- Accounts and logins. One-time purchase, no subscription.

## Not judged

- The **Development preview** / **Sandbox** panels on checkout ("Simulate Pix payment"):
  development builds only. They appear in the shots.
- The **drawn cartoon face** in the photo slots and on checkout ("Today"): it is the test
  fixture standing in for the buyer's own selfie, not design imagery.
- The masked test email `j•••@example.com` and the simulated Pix code.
- Real-network speed, real-device feel, motion timing (stills only; local dev server).

## Open decisions (the owner's)

- Legal wording: the FAQ says the AI "doesn't slim your face" while the example caption
  mentions a "leaner jawline". Waiting on the owner's legal review.
- Domain, support email and live payment keys are not set yet.
