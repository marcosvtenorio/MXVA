# MXVA: UI/UX judge log

Web Judge skill (App Designer's judge adapted to the web): scan in `shots/rN/scan.md`, scores
from one fresh critic on the 16-line rubric. Rounds are appended, never rewritten; the trend
is the evidence. Brief: [BRIEF.md](BRIEF.md). Config: [judge.config.mjs](judge.config.mjs).

**How to rerun after a style change**

1. Start the simulated server; the command is at the top of `judge.config.mjs`. It never calls
   OpenAI, Stripe, AbacatePay or Resend.
2. Run `node ~/.claude/skills/web-judge/scripts/judge.mjs design/judge/judge.config.mjs --out design/judge/shots/r4 --prev design/judge/shots/r3`
   (next round: r4 against r3). Keep the server's output outside the project folder: a log
   file inside it makes the dev server rebuild and reload pages in a loop.
3. Give the critic the new shots, then append the round below.

Shots are gitignored and regenerated each run.

---

## Round 1: 2026-10-20 (Judge mode, current style kept)

- Site judged: commit `72f8457`.
  - Local dev server on :3400 with simulated payments, AI and email.
  - Brazil visitor (America/Sao_Paulo, pt-BR, Pix first), Instagram iPhone user agent on phones.
- Widths: 390, 768 and 1440, plus dark mode at 390 for landing, photos-added, checkout and delivered.
- 15 pages: landing (first visit, cookie choice open), sample-report, help, privacy, start, photo-guide, photos, photos-added, constraints, delivery, review, checkout, pix-code, processing, delivered.
- Brief written from the code and design docs, not by the owner.

### Scan: 11 FAIL, 74 warn

| page | 390 | 768 | 1440 | 390 dark |
|---|---|---|---|---|
| landing | 1F 8w | 1F 5w | 1F 4w | 0F 8w |
| sample-report | 0F 2w | 0F 0w | 0F 0w | |
| help | 0F 3w | 0F 1w | 0F 1w | |
| privacy | 0F 2w | 0F 0w | 0F 0w | |
| start | 0F 0w | 0F 0w | 0F 0w | |
| photo-guide | 0F 0w | 0F 0w | 0F 0w | |
| photos | 0F 4w | 0F 2w | 0F 2w | |
| photos-added | 0F 4w | 0F 2w | 0F 2w | 0F 4w |
| constraints | 0F 0w | 0F 0w | 0F 0w | |
| delivery | 0F 1w | 0F 0w | 0F 0w | |
| review | 0F 2w | 0F 0w | 0F 0w | |
| checkout | 0F 4w | 0F 2w | 0F 2w | 0F 4w |
| pix-code | 0F 2w | 1F 0w | 1F 0w | |
| processing | 1F 1w | 1F 1w | 1F 1w | |
| delivered | 1F 0w | 1F 0w | 1F 0w | 0F 0w |

FAILs. Every contrast figure was measured on the rendered pixels.

- **delivered**, all widths: the readout "Sent" is 1.84:1 (11px, on the lit backdrop).
- **processing**, all widths: the readout "Light · off" is 3.97:1 (11px).
- **landing**, all widths: the price note "one-time" is 4.41 to 4.45:1 (13px). At 1440 the report labels "[1]" to "[4]" are 3.88 to 4.49:1 (11px).
- **pix-code**, 768 and 1440: a box inside a box (the code well inside the payment panel).

Warnings that matter. The rest are listed in `shots/r1/scan.md`.

- **landing**, 390 and 768: the cookie banner covers the Start button on a first visit (`fold-cta`), and focus can land under the banner.
- **Small tap targets on phones:**
  - the review "Edit" links (28x19);
  - the footer links (14px tall);
  - the landing area tabs (36px);
  - checkbox rows (23px).
- **Reading text under 15px on phones:**
  - the footer disclaimer (13px);
  - the photo privacy note (13px);
  - the landing source lines (12px).
- **landing:** 12 to 13 text sizes on one page, 20 gradients and 17 drop shadows.
- **checkout:** two console errors, `401 /api/orders/current`, raised before an order exists.
- **checkout:** focused FAQ rows can sit under the sticky pay bar. The scanner flagged this in an earlier pass but not in the final one. The code confirms it: `StickyPayBar` has no `scroll-padding`.
- **Em dashes** in visible copy on landing, help, photos and processing.

The scanner was corrected during this round:

- **Contrast is now measured on pixels.** Three contrast FAILs were wrong, and "Sent" and "Light · off" had been missed.
- **Slices are now taken by really scrolling the page.** A full-page screenshot had flipped the phone Pix layout to the desktop one.
- **Radio tiles are no longer counted as cards.**
- **The call-to-action check now looks for "Start" by name.**

### Scores (critic, round 1)

| # | Line | Score | Evidence |
|---|---|---|---|
| 1 | Concept on the pixel | 4 | Backdrop, crop marks and readouts run from the landing hero to the photo check, processing ("Light · off") and delivered ("Sent"). Help, privacy, delivery and review carry only the faint top gradient. |
| 2 | Not the category average | 3 | None of the category's black, neon and scores, but every landing section repeats one skeleton: mono capsule eyebrow, two-tone 48px heading, grey lead, hairline list. |
| 3 | Not the anti-slop average | 3 | Flow controls speak the studio, but the landing has long stretches of grey ground, mono labels and hairline rows ([1] to [5], NO, 01 to 04, DAY 7, STEP 1). |
| 4 | Hierarchy | 3 | Step screens are clean. On the phone landing, a blank 405px head lands first, then the cookie banner's ink "Accept"; Start is not visible. At 768 and 1440, step screens open on an empty top third. |
| 5 | Typography | 4 | Instrument Sans, tight and two-tone, with disciplined Fragment Mono has a voice. Held back by 12 to 13 sizes on the landing and a three-line 40px title on review. |
| 6 | Colour | 4 | A nameable palette (bone, slate, ink); slate only for selection and progress; dark mode is its own charcoal studio. The amber glow on the checkout teaser is the one stray note. |
| 7 | Richness | 3 | Good fold, real before/after, slate report band. But the same plaster head appears on 9 screens, and about 10 of 18 phone landing viewports are only text, rules and white cards. |
| 8 | Rhythm and space | 3 | Tight groups and slate bands give beats. But: empty framed spacer rows at 1440; the phone landing is 14,791px long; 768 and 1440 steps sit under about 350px of dead space; "SAMPLE" is stranded in a slate field at 768. |
| 9 | Craft details | 3 | Concentric corners, one thin icon set and honestly dated sources. But: the sample-report capsule wraps and hits the crop mark; the readout glass sits on the crop mark (photos-added); "Sent" is about 2:1; "Facial hai" is cut off in the tab strip. |
| 10 | Responsive fluency | 3 | The phone is designed first and the 1440 landing is composed. But the 768 landing is the stacked phone with the cookie banner on Start, and all ten flow screens at 768 and 1440 are a 440px phone column in a void. |
| 11 | Signature | 3 | Echoes are visible (dim head and "Light · off", lit head and "Sent", readouts, slider), but dim to lit is a subtle grey-to-grey change, and the before/after sits a third of the way down the page. |
| 12 | Five-second clarity | **2** | The phone fold shows "Looksmaxxing report. Your face. Your full glow-up." and nothing else: the sub-line, price and Start are under the cookie banner. |
| 13 | Flow and friction | 3 | Meter, back button, pinned pill, Pix default and "you can close this page" are right. But there are seven screens before paying; /start repeats the hero; 18+ and the terms are each confirmed twice; delivery stacks three checkboxes, one of them five lines long. |
| 14 | Trust and honesty | 4 | Price, one-time, no subscription, the money-back promise and "own bank app" are right at the decision; consents are unticked; the example is labelled fictional. Cracks: "about a minute" (processing) against "about 3 minutes" (landing), and the "leaner jawline" caption. |
| 15 | Accessibility in practice | 3 | Visible labels and large core pills. But "Sent" and "Light · off" fail contrast, small targets (Edit, footer, 36px tabs), and focus hidden under the cookie banner and the pay bar. |
| 16 | The feature test | 3 | Handsome and well-mannered, but it reads as the QOVES register. The one frame a buyer would screenshot, the before/after, is not in the first viewport. |

**Total: 51 / 80.** 4 of 16 lines at 4 or above; lowest is 12 (five-second clarity, 2).
Not done by the stop rule, which needs no line below 3 and at least 12 of 16 at 4 or above. The stop rule only matters in Iterate mode.

Critic's verdict: "MXVA is calm, coherent and unusually honest for its category, and its flow screens and checkout are close to what a top studio would ship. What holds it back is the phone landing's first viewport, where a placeholder head and a cookie banner sit where the offer and Start belong, along with long text-and-hairline runs and tablet/desktop flow screens that are a phone column in a void."

### Five asks (not applied: Judge mode)

All five keep the current style; they only resize, reorder or reuse what is already there.

1. **Put the offer in the phone's first viewport** (landing, 390 and 768).
   - Make the hero stage a 3:2 crop of about 358x240.
   - Show the H1, the sub-line, the 54px Start pill and the mono "R$ 47,99 ONCE · PDF BY EMAIL · PHOTOS NOT KEPT" by about y=640.
   - Make the cookie choice a bottom bar no taller than 120px, with both buttons in the outline style, so Start is the only ink pill.
   - Add bottom padding the height of the bar so it never covers Start.
2. **Lead with proof, not the placeholder** (landing, all widths).
   - Put the owner's before/after slider in the hero stage, with its crop marks, a readout and the "fictional AI-generated person" caption.
   - Keep the plaster head for empty and waiting states only.
   - Cut the "Built around you" list and the 25/20/7/3 strip. The phone page goes from about 14,800px to 12,500px.
3. **Compose the flow screens for 768 and 1440.**
   - Top-align content 48px under the step meter.
   - From 1100px, use two columns: the 440px form on the left, a 520px studio stage on the right with that step's readout.
4. **Craft and contrast pass.**
   - "Sent" and "Light · off" to at least 4.5:1.
   - The sample-report capsule on one line, inset 16px from the crop marks.
   - The photo readout glass inset 24px.
   - A right-edge fade on the tab strip, with 44px chips.
   - 44px hit areas on the Edit links and the footer links.
   - One delivery time everywhere.
   - "one-time" on the landing price to ink `#111417`; the desktop [1] to [4] labels to ink-2 `#56626B` or darker.
   - Pix code screen: once the code is issued, the sticky "Get my glow-up" bar becomes "Copy Pix code" or hides. Either way, reserve its height at the bottom of the page so it never covers the last FAQ row (390/14-pix-code-s03).
5. **Five screens before paying instead of seven.**
   - Drop /start: the landing's Start goes straight to photos.
   - Fold the photo guide into the photos screen.
   - Ask for 18+ once.
   - Shorten the processing consent.
   - Move terms acceptance under the Pay button. This needs the owner's legal review.

### Critic recheck after the scanner corrections

No score changes; 51 / 80 stands.

- The new phone Pix slices clear the "two layouts" defect. The phone layout is right: Copy first, QR behind a tap, the wait explained.
- One new snag came out of the re-shoot: the sticky pay bar stays up after the code is issued and covers the FAQ.
- The three items added to ask 4 above come from this recheck.

### Could not judge

- Motion: key light, readouts, slider drag, banner entrance, reduced motion.
- Real network speed and Pix polling.
- Instagram's real in-app browser bars.
- Validation and error states, and the card path.
- The emailed PDF, where the signature now lives.
- Hover states.
- Dark mode beyond 4 pages.
- Real selfies.

---

## Round 2: 2026-10-20 (the five round-1 asks applied, current style kept)

- Owner's request: "apply all five and deploy". Same server, widths, Brazil visitor and
  Instagram user agent as round 1. The flow is now landing → photos (guide inside) → avoid
  → delivery → review → checkout → Pix code → processing → delivered.
- New critic: the round-1 critic was no longer available. It scored against round 1 as the
  baseline and said where it differs.

### What changed

1. **Offer in the phone fold.** The hero is a 3:2 before/after above the H1. At 390 the H1,
   sub-line, Start and the price line sit above the cookie bar. The cookie bar is about 115px,
   with two outline buttons, and reserves its height at the page bottom and in scroll-padding.
2. **Proof first.** The owner's before/after (fictional AI-generated person) leads: side by
   side on phone and tablet, the slider from 1100px. The plaster head is kept for empty and
   waiting states only. "Built around you" and the stats strip are cut. The concept section
   shows the after image with numbered markers; the photo section, report mock and sample
   report use the real example.
3. **Flow screens composed.** From 768px content is top-aligned under the meter. From
   1100px a 480px form sits beside a 520px studio stage with the step's readouts. Checkout
   is two columns from 1100px, without the sticky pay bar.
4. **Craft.** "Sent" and "Light · off" on frost glass; overlays inset from the crop marks;
   44px tabs with a right-edge fade; 44px Edit, footer and consent-row targets; one delivery
   time before paying ("about 3 minutes"); "one-time" and the report labels in ink; the pay
   bar hides once a Pix code is out and reserves scroll-padding; the Pix code well is
   hairlines; em dashes removed; phone reading text at 15px.
5. **Five screens before paying.** /start removed (Start opens the photo step; old links
   redirect), the photo guide folded into the photo step, 18+ asked once (the photo
   checkbox, which now sets the age confirmation the order needs), the processing consent
   shortened (consent version bumped to `2026-10-20.v2`).

**Not done:** moving the Terms acceptance under the Pay button. It changes the legal
acceptance gate, so it waits for the owner's decision and legal review; the Terms checkbox
stays on the delivery step. The critic accepted this and won't ask again.

### Scan: 0 FAIL, 24 warn (round 1: 11 FAIL, 74 warn)

| page | 390 | 768 | 1440 | 390 dark |
|---|---|---|---|---|
| landing | 0F 1w | 0F 2w | 0F 2w | 0F 1w |
| sample-report | 0F 0w | 0F 0w | 0F 0w | |
| help | 0F 0w | 0F 0w | 0F 0w | |
| privacy | 0F 0w | 0F 0w | 0F 0w | |
| photos | 0F 1w | 0F 1w | 0F 1w | |
| photos-added | 0F 1w | 0F 1w | 0F 1w | 0F 1w |
| constraints | 0F 0w | 0F 0w | 0F 0w | |
| delivery | 0F 0w | 0F 0w | 0F 0w | |
| review | 0F 0w | 0F 0w | 0F 0w | |
| checkout | 0F 3w | 0F 3w | 0F 2w | 0F 2w |
| pix-code | 0F 1w | 0F 0w | 0F 0w | |
| processing | 0F 0w | 0F 0w | 0F 0w | |
| delivered | 0F 0w | 0F 0w | 0F 0w | 0F 0w |

Warnings left, each answered:

- `gradients` (landing, photos): the lit softbox is the concept's material, not
  decoration. The critic agrees.
- `shadows` 13 at 768 and 1440 (landing): kept for now. Raised paper mocks, price card and
  pills.
- `console-error` 401 `/api/orders/current` on checkout: real, not visual, still to fix.
- `small-reading` 12px Pix code string: a machine string under a 54px Copy button. Kept.

The scanner was corrected during this round:

- **Retry after a dev reload.** It now waits and walks the page again once when the dev
  server reloads it.
- **Inner scroll restored.** Its contrast probe scrolled an overflow:hidden box (the 768 hero
  photos were 28px taller than their frame). That moved the crop marks in the shots, and
  the critic saw it. The probe now restores those offsets before shooting, and the photos
  now fit their frame.

### Scores (critic, round 2)

| # | Line | R1 | R2 | Evidence |
|---|---|---|---|---|
| 1 | Concept on the pixel | 4 | 4 | Crop marks, frost capsules and readouts run from the hero through every 1440 step stage, processing and delivered. Help and privacy are still plain. |
| 2 | Not the category average | 3 | 3 | No black, neon or scores, but a side-by-side before/after is the category's own hero, and every section opens the same way. |
| 3 | Not the anti-slop average | 3 | 3 | Real images break up the top half. From pricing to the footer it is still check rows, dot rows, "NO" rows and FAQ hairlines. |
| 4 | Hierarchy | 3 | **4** | Phone fold: before/after, then H1, then Start, the only ink pill. At 1440 photos-added the example stage outweighs the buyer's photo. |
| 5 | Typography | 4 | 4 | 8 sizes on the phone landing (was 12 to 13). Flow titles jump between 28 and 40px; the review H1 is three lines at 390. |
| 6 | Colour | 4 | 4 | Bone, slate, ink; slate for meter and selection; dark mode its own studio. Stray notes: the amber teaser glow, the skin-tinted markers. |
| 7 | Richness | 3 | **4** | The real example is in the hero, concept, report mock, photo section and both sliders; 1440 steps have a stage. It is the same face 6 to 8 times. |
| 8 | Rhythm and space | 3 | 3 | Phone landing 13,968px (was 14,791; asked 12,500). Empty 120px bands at 1440; dead gap in the 1440 concept column; empty band above the 390 delivery H1. |
| 9 | Craft details | 3 | 3 | Round 1's list is fixed. New slips: 768 crop marks, 1440 disclosure under the cookie card, translucent markers, readout over the eyes, "profile" vs "side". |
| 10 | Responsive fluency | 3 | **4** | 1440 steps and checkout composed, cookie bar slim. 768 is still mostly the stacked phone; pinned pills sit over text at 1440. |
| 11 | Signature | 3 | 3 | The before/after leads with "same face, same pose, same light", but a slider is the category's device, and dim to lit is still subtle. |
| 12 | Five-second clarity | 2 | **4** | Phone fold, above the cookie bar: proof, category, H1, sub-line, Start, price. The price is 11px grey mono and reads as fine print. |
| 13 | Flow and friction | 3 | **4** | Four steps plus checkout, 18+ once, guide inside the photo step, Pix default. Delivery still stacks three checkboxes; the empty photo step's button looks enabled. |
| 14 | Trust and honesty | 4 | 4 | One delivery time, price, one-time and money-back at Pay, consents unticked. Cracks: "leaner jawline" (legal pending), the 1440 disclosure half-covered. |
| 15 | Accessibility in practice | 3 | **4** | 0 FAIL, contrast fixed, 44px targets, nothing covers focus. Still many 11px mono labels; markers low contrast. |
| 16 | The feature test | 3 | 3 | The 1440 hero and the photo-step stage are portfolio-grade; the scroll below is one section template a dozen times. |

**Total: 58 / 80** (round 1: 51, +7). 10 of 16 lines at 4 or above (round 1: 4). None below 3.
Not done by the stop rule (needs 12 of 16 at 4 or above).

Critic's verdict: "Round 2 fixed what cost the most. The phone fold now sells (proof, offer,
price, Start, nothing covering it), the funnel is five screens, and the desktop steps are
composed studio scenes. What holds it below done is a long templated scroll, a handful of
new slips, and a signature that is still the category's before/after rather than something
only MXVA does."

Round-1 asks: 1 landed; 2 landed (the page shrank less than asked); 3 landed; 4 landed;
5 partly landed (Terms move declined pending legal review).

### Fixed after scoring (verified by re-shoot in `shots/r2-fixes`, not rescored)

The slips in line 9 were introduced this round and fixed before deploying:

- 768 hero: the photos fit their frame; all four crop marks show, with a faint edge so they
  read on a light wall; Before/After sit on the marks' baseline.
- 1440 hero: the disclosure is inside the stage ("Same face, pose and light · fictional
  AI-generated person"), clear of the cookie bar.
- Concept markers: solid bone discs with an ink numeral and a hairline ring.
- Photo check readout: in the top-right corner, above the eyes.
- Review: "No side photos (optional)".

### Critic's next five asks

Ask 1 (registration) is done: it is the "Fixed after scoring" list above. Asks 2 to 5 are
not applied yet; they are for round 3.

2. **Rhythm: subtract.**
   - Delete "The difference" section; it repeats How it works. This brings the phone page
     to about 12,500px.
   - Bands at 768 and 1440: 48px, no side rails.
   - 1440 concept: the list 40px under the lead.
   - 390 delivery: content top-aligned 32px under the meter.
3. **Break the section skeleton.**
   - Eyebrow capsules on 4 sections only: Concept, Your report, Pricing, Questions.
   - In "Seven areas", a 3:2 before/after detail crop of the example per tab.
4. **Make the readout the signature.**
   - The hero's after side carries a readout glass: "[1] CUT · [2] SKIN · [3] BROWS ·
     [4] BEARD".
   - Dim to lit readable in a still: processing backdrop about `#4A5560`, delivered with a
     brighter softbox and a firm key shadow.
5. **One flow title size and a calmer desktop photo step.**
   - Flow H1s at 32px on phones and 40px from 1100px.
   - Review H1 on two lines.
   - 1440 photos: the guide under the example; the example shrinks to a 200px thumbnail
     once a photo is in.
   - Static pill at the end of the column from 1100px.
   - A disabled "Add a front photo" pill until a photo and 18+ are set.

### Could not judge

- Motion: slider drag, readouts, the light sweep on the checkout "Today" tile, cookie
  entrance, reduced motion.
- Instagram's real in-app browser bars and safe areas.
- A real selfie under the readout glass.
- Focus rings and hover states.
- Validation and error states, and the card path.
- Real Pix polling and network speed.
- The emailed PDF.
- The 1100px breakpoint itself, landscape phones, and dark mode beyond 4 pages.

---

## Round 3: 2026-10-21 (round-2 asks 2 to 5 applied, current style kept)

- Owner's request: "apply the next 4 improvements too". Same server, widths, visitor and
  user agent as rounds 1 and 2.
- New critic again (the round-2 critic could not be resumed). It scored against round 2 as
  the baseline.

### What changed

2. **Rhythm.**
   - "The difference" section is deleted.
   - From 768px the bands are 48px and break the frame's side rails.
   - At 1440 the concept and photo lists sit 40px under their lead.
   - Phone steps start 32px under the meter.
   - Phone landing: 12,837px (round 2: 13,968).
3. **Section skeleton.**
   - Eyebrows only on Concept, Your report, Pricing and Questions.
   - "Seven areas" opens each tab with a before/after close-up of the example, with a short
     note of what the plan does there.
4. **Signature.**
   - The hero's after side reads out "After · cut · skin · brows · beard": a glass from
     768px, a line under the photos on phones (markers on the 179px photo hid the brow and
     chin, so they were removed).
   - Processing is clearly dim and delivered clearly lit (darker backdrop, brighter softbox,
     firmer key shadow).
5. **Flow.**
   - One title size (32px on phones, 40px from 1100px) on steps, checkout and processing.
   - The review title is on two lines.
   - Desktop photo step: the guide sits under the example, which shrinks to a 200px
     thumbnail once a photo is in; the privacy note sits under the button.
   - From 1100px the button sits at the end of the form.
   - The empty photo step shows a dimmed "Add a front photo". It still answers a tap with
     what is missing.

### Scan: 0 FAIL, 20 warn (round 2: 0 FAIL, 24 warn)

The warnings left are the same as in round 2: the softbox gradients, the 401 console
errors on checkout, and the 12px Pix code string.

The scanner was corrected during this round:

- **Shadows.** It no longer counts transparent zero-size shadow layers (added by Tailwind
  next to hairline rings) as cast shadows.
- **Wider than the screen.** It now flags a page wider than the device even when the phone
  browser zooms out to fit it. A caption whose separators could not wrap made the phone
  landing 30% wider than the screen; the scanner only showed it indirectly, as contrast
  readings of 1.02:1.

### Scores (critic, round 3)

| # | Line | R2 | R3 | Evidence |
|---|---|---|---|---|
| 1 | Concept on the pixel | 4 | 4 | Crop marks, frost readouts and the seamless run from the hero's AFTER glass through every step stage to processing and delivered. Help and Privacy are plain. |
| 2 | Not the category average | 3 | 3 | No black, neon or scores, but the hero is still the category's side-by-side before/after, and the register stays close to QOVES. |
| 3 | Not the anti-slop average | 3 | 3 | "Seven areas" now opens on an image and eyebrows are down to four, but the 390 tail from pricing to the footer is about four screens of rows with no image. |
| 4 | Hierarchy | 4 | 4 | Phone fold reads photos, H1, Start, price. At 1440 the buyer's photo outweighs the example thumbnail. |
| 5 | Typography | 4 | 4 | Flow titles are one class and the review H1 is two lines. Held back by 40px H1s on Help, Privacy and Sample, and long lines there at 768 and 1440. |
| 6 | Colour | 4 | 4 | Bone, slate, ink and a designed dark mode. Stray notes: the amber glow on checkout's locked tile, green ticks in "What you get". |
| 7 | Richness | 4 | 4 | Images reach the middle of the page and the end screens. The same face appears about 12 times on the phone landing, and the tail has no image. |
| 8 | Rhythm and space | 3 | **4** | 48px bands that stop at the rails, lists under their leads, top-aligned steps, a shorter page. Left: the long text tail and the stacked footer at 390. |
| 9 | Craft details | 3 | 3 | Round 2's slips are fixed, but new ones show. See "Fixed after scoring" below. |
| 10 | Responsive fluency | 4 | 4 | The 1440 photo step is recomposed. 768 still stacks like the phone, and the 1440 review button fell below the first screen. |
| 11 | Signature | 3 | 3 | Dim to lit reads in a still, but it plays only after payment, and the hero glass's numbers pointed at nothing. |
| 12 | Five-second clarity | 4 | 4 | Proof, category, H1, sub-line, Start and price above the cookie bar. The price is still 11px grey mono. |
| 13 | Flow and friction | 4 | 4 | Four steps plus checkout, 18+ once, Pix default, the dimmed "Add a front photo". Delivery still stacks three checkboxes. |
| 14 | Trust and honesty | 4 | 4 | Price, one-time and money-back at Pay; consents unticked. Checkout's "Photos never stored" overstated (the report is emailed with your photo). |
| 15 | Accessibility in practice | 4 | 4 | 0 FAIL, 44px targets, focus never covered. The dimmed button's label was about 2.5:1. |
| 16 | The feature test | 3 | 3 | The 1440 hero and the processing-to-delivered pair are portfolio-grade. The phone scroll repeats the face, then four screens of rows; the report mock shows grey bars. |

**Total: 59 / 80** (round 2: 58, +1). 11 of 16 lines at 4 or above (round 2: 10). None
below 3. Not done by the stop rule: one line short (needs 12 of 16 at 4 or above).

Critic's verdict: "Round 3 landed what it was asked. The rhythm is clean, the flow speaks
one title size, the desktop photo step is calm and dim to lit finally reads, so MXVA is a
well-made, honest funnel one line short of done. What holds five lines at 3 is a phone scroll
that repeats itself in its second half with one face about a dozen times, a signature that
only plays after payment, and a new set of small slips."

Round-2 asks: 2 landed; 3 landed as written, partly in effect (the tail is unchanged);
4 partly landed (dim to lit yes; the hero glass is a legend and the phone gets a caption);
5 landed, with one regression (the 1440 review button).

### Fixed after scoring (verified by re-shoot in `shots/r3-fixes`, not rescored)

The slips this round introduced:

- **1440 review:** the button is back on the first screen. The "Included" list is gone
  (checkout's "What you get" repeats it) and the privacy note sits under the button.
- **One spelling:** "Nothing analysed yet" on the review stage is replaced; checkout's
  "analysed" becomes "analyzed".
- **Hero caption on phones:** two complete lines, "After · cut · skin · brows · beard" and
  "Fictional AI-generated person". The glass at 768 and 1440 has no index numbers.
- **Example thumbnail caption:** two balanced lines.
- **Area close-ups:** drawn at 200% instead of 300%, so the 720px source is never stretched
  past its size.
- **Dimmed button:** a rule-grey fill with an ink-2 label (about 4.6:1) instead of 38%
  opacity.
- **Photo claims:** checkout's "Photos never stored" is now "Photos not kept", and its FAQ
  says the photo "isn't kept after" the report, matching the landing.

### Critic's next five asks (round 4, not applied)

1. **Cut the repeated tail.**
   - Delete the landing's "A good photo" section; the photo step carries the same tips.
   - Pricing: one line instead of the five-item list.
   - Footer at 390: two columns.
   - Targets: 390 landing at or under 11,000px, 1440 at or under 8,200px.
2. **Show the key light before payment.**
   - "Nobody waits on a screen": two tiles, light off and sent, instead of the four rows.
   - Checkout's locked tile: the light-off stage instead of the amber blur.
3. **Show the product, not skeleton bars.** The report mock uses an image of the real
   sample report.
4. **Craft pass.**
   - US spelling site-wide (colour, recognise, moisturiser and others).
   - Close-ups and cards on the text column.
   - A fade above the phone's pinned buttons, so no line is cut mid-glyph.
   - Help, Privacy and Sample: the landing header and the flow title size.
   - No grab handle on processing; ink-2 ticks on checkout.
5. **Make the decision points exact.** The hero price "R$ 47,99" in 15px semibold ink,
   then the mono line.

### Could not judge

- Motion: slider drag, the glass's entrance, the light change, the light sweep on
  checkout's "Today" tile, reduced motion.
- Six of the seven area tabs (only Skin is in the stills).
- What a tap on the dimmed button says.
- Focus rings and hover states.
- Instagram's in-app browser bars, real-device feel and speed.
- Validation and error states, and the card path.
- The emailed PDF.
- Real Pix polling.
- The 1100px breakpoint itself and landscape phones.
- Dark mode beyond four pages.
