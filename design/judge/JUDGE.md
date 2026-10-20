# MXVA: UI/UX judge log

Web Judge skill (App Designer's judge adapted to the web): scan in `shots/rN/scan.md`, scores
from one fresh critic on the 16-line rubric. Rounds are appended, never rewritten; the trend
is the evidence. Brief: [BRIEF.md](BRIEF.md). Config: [judge.config.mjs](judge.config.mjs).

**How to rerun after a style change**

1. Start the simulated server; the command is at the top of `judge.config.mjs`. It never calls
   OpenAI, Stripe, AbacatePay or Resend.
2. Run `node ~/.claude/skills/web-judge/scripts/judge.mjs design/judge/judge.config.mjs --out design/judge/shots/r2 --prev design/judge/shots/r1`.
3. Give the critic the new shots, then append "Round 2" below.

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
