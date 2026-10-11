# MXVA — Design direction

## Brief (answered by the owner, 2026-10-11)

1. **What / who:** MXVA, a privacy-first, mobile-first web product. Adults 18+, mostly 18–30 and mostly men arriving from looksmaxxing content on Instagram (Brazil included); the design stays gender-neutral.
2. **Core action:** open the link from Instagram, understand the offer in seconds, start; then answer 16 short steps, add one front photo, pay once ($29), and receive an AI concept portrait plus a sourced 7/30/90-day roadmap by email.
3. **Feel:** minimalist, tech, clean. Reference: **QOVES.com** ("you can basically copy their style"). We follow its *register* — a light clinical page, misty slate studio colour, large light-weight grotesque with tight tracking, two-tone headlines, small mono capsule labels, white/ink pill buttons, frosted glass — without copying its assets, fonts, copy, scores or claims.
4. **Exists:** the name only. No logo, colours or fonts.
5. **Needs:** screens to look at, then a Next.js build (not SwiftUI).
6. **Imagery:** no image generator connected; the owner will pick real images later. Mockups use drawn, honest stand-ins (backdrop + silhouette) and say so.

Mobile web, not a native app: there is no tab bar (the product is a linear funnel); the "navigation layer" is a floating frosted top bar and a sticky bottom action.

## The traps (slop.md + this category)

- History (`~/.app-designer/history.md`): Amaro — place / colour-field / expanded / red / shape. The pick must differ on 3 of 5.
- **The category default we refuse.** Looksmaxxing apps (Umax, LooksMax-style "rate me" apps, PSL forums) share: near-black grounds, neon violet or acid-green accents, glowing face-mesh wireframes, score dials ("7.8 / 10", "potential 9.1"), radar charts, rank badges and gamer language ("mog", "ascend"). Even QOVES, our reference, leans on an "aesthetic score" radar and attractiveness benefits. **MXVA shows no scores, no meshes, no rankings, no attractiveness claims** — the spec forbids them and they are the category's cliché. The category's colour cliché is black + neon; we refuse it.

## Step 2 — three concepts

| | Concept sentence | Family | Ground | Type | Accent hue | Richness |
|---|---|---|---|---|---|---|
| A | MXVA is **a portrait studio: a grey seamless backdrop under one softbox**. | place | light | grotesque (Instrument Sans + Fragment Mono) | blue (slate) | colour-material (lit backdrop) |
| B | MXVA is **a darkroom: the print surfacing in the tray under a safelight**. | media | dark | condensed (Mona Sans Condensed + Martian Mono) | orange (safelight) | illustration (film, tray, light) |
| C | MXVA is **a chrome hand mirror on a barbershop's jade tiles**. | object | colour-field | serif (Instrument Serif + system sans) | green (jade) | 3d-object (chrome mirror) |

All three render the same core screen: the first viewport a visitor sees after tapping the Instagram link.

(Decision, losers and tokens follow after the exploration is shot.)

## Decision

**A — Studio wins.** It is the most *this product*: MXVA's deliverable is a portrait, and a portrait studio is where faces are lit, framed and made the best version of themselves without changing who they are. It also lands exactly on the owner's brief (minimal, tech, clean, QOVES's register). The richness is the **lit seamless backdrop** plus a **plaster light-test head** (the object photographers use to test light) standing in for the buyer's own photo until real imagery is chosen.

- **B lost:** dark + heavy condensed capitals reads like the category's loud, gym-supplement default; it fights "minimal, clean", and a darkroom implies waiting.
- **C lost:** the most memorable object, but jade tile + chrome + serif reads as a barbershop grooming brand, not tech; furthest from the owner's reference.
- **Kept from B:** the idea that the portrait *resolves* at the reveal — re-cast as the studio's key light coming on (the signature below).

**History check** vs Amaro (place / colour-field / expanded / red / shape): A is place / light / grotesque / blue / colour-material → differs on 4 of 5. OK.

## Tokens

### Colour (light)
| Role | Hex | Use |
|---|---|---|
| ground | `#F4F5F3` | page (cool bone, not cream, not white) |
| raised | `#FFFFFF` | option rows, inputs, sheets |
| ink | `#111417` | text, primary buttons |
| ink-2 | `#56626B` | secondary text, second half of two-tone headlines (5.9:1 on ground) |
| ink-3 | `#76818A` | tertiary ≥ 15px only, placeholders |
| rule | `#D9DEE0` | hairlines, field borders |
| accent | `#3F5B6B` | **one role: selection and progress** (selected options, the step meter, focus rings) |
| on-accent | `#FFFFFF` | |
| backdrop-hi / mid / lo | `#DCE3E6` / `#A9B7BE` / `#7F909A` | the lit seamless (material, not accent) |
| positive | `#2F6A50` | photo check passed, email sent (state only) |
| negative | `#A2392A` | validation errors (with icon + text, never colour alone) |

Primary actions are **ink** pills, not accent: the accent is a state colour, so the system tint (links, focus) follows ink, and the accent only marks "chosen" and "how far along".

### Colour (dark)
ground `#0D1012` · raised `#161A1D` · ink `#ECEFF0` · ink-2 `#A3AEB5` · ink-3 `#808B92` · rule `#262C30` · accent `#9CB5C3` (on-accent `#0D1012`) · backdrop `#3B474D` / `#242D32` / `#161C20` · positive `#7FC4A3` · negative `#F08C7C`. Primary button inverts to an ink-light pill (`#ECEFF0` on `#0D1012`).

### Type
- **Instrument Sans** (OFL) — display and UI. Its slightly condensed neo-grotesk proportions give the same calm, clinical voice as the reference without its licensed face. Two weights only: **400** (display, body) and **600** (buttons, option titles, wordmark).
- **Fragment Mono** (OFL) — labels, step counters, studio readouts, prices in tables. Uppercase at 11px, +6% tracking. A seasoning: never paragraphs.

| Role | Size / leading | Tracking |
|---|---|---|
| Display (landing, result) | 40 / 1.04 | −3.5% |
| Step title | 28 / 1.1 | −2.5% |
| Price figure | 56 / 1 | −3% (tabular) |
| Section heading | 20 / 1.2 | −1.5% |
| Body, options | 17 / 1.35 | −0.5% |
| Secondary | 15 / 1.4 | 0 |
| Meta | 13 / 1.35 | 0 |
| Mono label | 11 / 1.3 | +6%, uppercase |

### Space, shape
- Side margin **20**. Spacing scale 4 · 8 · 12 · 16 · 20 · 24 · 32 · 40 · 56.
- Radius family: **10** fields and chips · **24/30** panels and the stage (concentric with the screen) · **capsule** buttons.
- Touch targets ≥ 44px; primary action is a 54px capsule in the thumb zone; sticky on step screens.
- Desktop: the same column, max 440px for steps, a two-column landing (copy left, stage right) from 960px.

## Richness — art direction
- **The seamless:** a misty slate backdrop lit by one softbox from the upper left (radial highlight ~22% / 18%), falling off to deeper slate at the floor. A gradient here is a physical phenomenon (light falloff), so it stays smooth and single-directional.
- **The light-test head:** a matte plaster ovoid on a plinth, key light from the left, a soft cast shadow to the right, a faint rim light. One hand, used on landing, empty photo states and the sample report. It is replaced by the buyer's own photo wherever one exists.
- **Studio readouts:** small mono captions in white on the backdrop (LIGHT SOFT · LEFT / EYE LEVEL / FRAMING CENTERED) and thin crop marks at the stage corners. Information, not decoration: they become the real photo checks on the photo step.
- **Photography (when the owner picks images):** soft window or softbox light from one side, eye level, head-and-shoulders with headroom, plain grey-blue backdrop, cool neutral grade, no retouching, no before/after of strangers.
- Refused: face meshes, landmark dots, score dials, radar charts, neon, glow.

## Signature — "Key light"
The reveal of the paid concept portrait (result screen), born from the studio:
1. **Trigger:** the result arrives (or the buyer taps "Show concept" on a reload-safe state).
2. **0 ms:** the stage is dim (backdrop at 55% brightness), the buyer's photo sits in it, readouts show `LIGHT —`.
3. **0–650 ms:** the softbox highlight sweeps in from the left edge to its resting spot (spring-smooth); the concept image resolves under the light (blur 10 → 0, opacity 0 → 1) a beat behind it.
4. **650 ms:** readouts settle one by one, 90 ms apart: `CONCEPT` · `SAME FRAMING` · `SAME LIGHT`. Light haptic where the browser supports it (Android `vibrate(12)`).
5. **900 ms:** the compare handle fades in ("Today | Concept"); dragging it scrubs between the original and the concept, 1:1 with the finger, rubber-banding at the edges.
- **Processing is the same screen with the key light off:** the result layout (full-bleed stage over a raised sheet) with the stage dimmed and `LIGHT · OFF`; the sheet lists the five real server phases, the active one filled slate. When the result arrives, the light comes on in place.
- **Echo on the photo step:** when a photo passes the on-device checks, the same readouts tick in (LIGHT · FOCUS · FRAMING), one by one.
- **Reduced motion:** a 200 ms cross-fade; readouts appear together; no sweep.

## Content (Step 3) — every word on the designed screens
US English across the product (the spec writes "personalized").

**1 · Landing (core screen)** — time 21:14
- Bar: `MXVA` · pill `Sample report`
- Stage readouts: `LIGHT SOFT · LEFT` / `EYE LEVEL` / `1 FRONT · 2 OPTIONAL`; tag `Light test · your photo replaces this`
- Display: "Your face." + (ink-2) "A realistic next-step plan."
- Sub: "A personalized looksmaxxing roadmap and an AI concept portrait, built from your own photos."
- CTA: `Start` (→). Under it, mono: `$29 ONCE · PDF BY EMAIL · PHOTOS NOT KEPT`

**2 · Step 03 / 16 — Focus** (mid-use: 2 chosen)
- Header: back · `03 / 16` · meter of 16 ticks, 3 lit
- Title: "Which areas should your plan cover?"
- Description: "Choose 1 to 4. Your plan puts these first."
- Options: Skin (chosen) · Brows (chosen) · Eye area · Hair · Facial hair · Smile · Jawline presentation
- Counter: `2 OF 4 CHOSEN`
- CTA: `Continue`

**3 · Step 14 / 16 — Photos** (front added, checks passed, profiles empty)
- Title: "Add your photos"
- Privacy line: "Photos are used temporarily to create your report. They aren't saved in our photo database. External AI and email services handle data as our Privacy Policy explains."
- Front slot readouts: `LIGHT · OK` `FOCUS · SHARP` `FRAMING · CENTERED`; action `Retake`
- Profile slots: `Left profile` / `Right profile`, each "Optional" + `Add`
- Checkbox (checked): "These are photos of me, and I'm 18 or older."
- Notice: "Your photos only live in this tab. Reloading clears them."
- CTA: `Use these photos`

**4 · Checkout**
- Header: back · `CHECKOUT` · lock + `SECURE`
- Title: "One report, made after you pay."
- Included: [1] "AI concept portrait" — "Your own front photo, edited; same face, groomed and well lit." [2] "PDF roadmap" — "6 priorities, a 7, 30 and 90-day plan, and every source." [3] "Delivered by email" — "to m•••@gmail.com, usually within minutes."
- Price: `$29` + "one-time · no subscription" + mono `LOCAL CURRENCY SHOWN AT PAYMENT WHERE AVAILABLE`
- Payment: Card number `4242 4242 4242 4242` placeholder-style, `MM / YY`, `CVC`, Country `Brazil`
- Disclosure: "We don't save face photos. If your payment opens another page, we may ask you to select your photo again after payment. You won't be charged twice."
- CTA: `Pay $29` · links `Refunds` · `Help` · `Privacy`

**5 · Processing**
- Status: "Payment confirmed." + (ink-2) "Let's create your report."
- Phases: `01 Reading your photo` (done) · `02 Preparing image` (active) · `03 Checking likeness` · `04 Building report` · `05 Sending email`
- Guidance: "Keep this tab open until it finishes."
- Notice: `PHOTOS ARE PROCESSED IN MEMORY, NOT STORED`
- Help: "Something wrong? Contact support — you won't pay again."

**6 · Result**
- Disclosure capsule: `AI CONCEPT PREVIEW · NOT A GUARANTEED RESULT`
- Stage: the concept portrait; compare control `Today | Concept`
- Title: "Your concept and plan" · meta `11 OCT 2026 · REPORT SENT`
- Top three: 1 "Daily broad-spectrum SPF 30+" — `ESTABLISHED · LOW EFFORT · START NOW`; 2 "Clean up strays, keep your natural shape" — `STYLING OPINION · LOW EFFORT`; 3 "Take photos from further away" — `LIMITED EVIDENCE · FREE`
- Actions: `Download PDF` · status "Sent to m•••@gmail.com" · link `10 sources`
- Footer: "This page clears when you close it. Your email holds the permanent copy." · `Clear from this device`

**7 · Signature storyboard** — four frames of "Key light" (dim → sweep → landed → compare)

**8 · Landing, dark** — same content as 1

**Icon** — the plaster ovoid lit from the left on a slate field; no letters.


## Status
Design done (critique rounds 1–2, stop rule met; post-critique fixes in shots/r3). Latest sheet: `design/shots/r3/sheet.png`, small phone: `design/shots/r3-se/sheet.png`. History row appended.
