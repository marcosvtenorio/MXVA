import Link from "next/link";
import { ConsentBanner } from "@/components/common/ConsentBanner";
import { ArrowRight, CreditCard, Lock, Plus, Tick } from "@/components/common/icons";
import { CropMarks, PlasterHead } from "@/components/common/StudioArt";
import { ExampleCompare } from "@/components/checkout/ExampleCompare";
import { PriceTag } from "@/components/checkout/PriceTag";
import { LandingFooter } from "@/components/marketing/LandingFooter";
import { TrackedLink } from "@/components/marketing/TrackedLink";
import { publicConfig } from "@/lib/config";

/*
 * Layout: one framed column, sections divided by hairline bands, an eyebrow capsule over
 * each light two-tone heading. Copy, palette, type and imagery are MXVA's own.
 */

const CONCEPT_CHANGES = [
  "A haircut and colour picked for your face shape",
  "Clearer, more even skin",
  "Brows cleaned up and shaped",
  "Beard, stubble or a clean shave, whichever fits",
  "The same face, pose and light, so you still recognise yourself",
];

const GUESSWORK = ["Copy a celebrity's haircut", "Buy whatever is trending", "Try ten products at once", "Give up after a week"];
const WITH_MXVA = ["Add one front photo", "See your concept portrait", "Follow a ranked plan", "Check in at 7, 30 and 90 days"];

const BUILT_AROUND = [
  { title: "Your own face", detail: "Shape, features, hair and skin, read from the photo you add." },
  { title: "What you won't change", detail: "Tell us what to leave alone, like your beard or your hair length." },
  { title: "Effort and cost", detail: "Every step is ranked by fit, evidence, effort and cost, never by looks." },
  { title: "Evidence", detail: "Each recommendation lists its sources, with dates." },
  { title: "Who to ask", detail: "Questions to take to a barber, dermatologist or dentist." },
];

const REPORT_PARTS = [
  "An AI glow-up concept: your photo with the cut, skin, brows and beard that suit you",
  "5 to 10 priorities, ordered by impact on your face",
  "A 7-day start, a 30-day plan and a 90-day plan",
  "Every source, with its date",
];

const STEPS = [
  { title: "Add one front photo", detail: "It stays in your browser tab until you pay. Two side photos are optional." },
  { title: "Answer a few short questions", detail: "Just what to avoid and where to send your report. Under a minute." },
  { title: "Pay once, get your report", detail: "An AI concept portrait of you and a PDF roadmap, delivered by email." },
];

const INCLUDED = [
  { title: "AI glow-up concept", detail: "Your own photo, upgraded, with every change labelled." },
  { title: "Ranked priorities", detail: "5 to 10 steps ordered by fit, evidence, effort and cost." },
  { title: "7, 30 and 90-day plans", detail: "What to do this week, this month and this season." },
  { title: "Questions for professionals", detail: "What to ask a barber, dermatologist or dentist." },
  { title: "Sources with dates", detail: "So you can check every claim yourself." },
];

const TRUST = [
  { icon: Lock, text: "Photos not kept after your report" },
  { icon: CreditCard, text: "Checkout by Stripe and AbacatePay" },
  { icon: Tick, text: "Free retry if delivery fails" },
];

const WONT = ["Rate or score your face", "Diagnose skin, teeth or hair", "Suggest surgery or medication", "Promise bone or eye-shape changes"];

const FAQ = [
  {
    q: "Is this a face rating?",
    a: "No. MXVA never scores, ranks or rates faces. It gives you the steps your photo calls for, ordered by impact on your face and by how strong the evidence is.",
  },
  {
    q: "Will the AI change my face?",
    a: "It shows your glow-up, not someone else: same features, skin tone, pose and light, with the changes a beauty consultant would make for your face: the haircut, colour and styling that suit you, brows, skin and natural makeup. It doesn't slim your face, shrink your nose or enlarge your eyes, and every change is annotated on your before and after.",
  },
  {
    q: "What happens to my photos?",
    a: "They stay in your browser until you pay, then go to our server and AI providers only to make your report. We don't keep them in a photo database. Your emailed PDF is your copy.",
  },
  {
    q: "What if something goes wrong?",
    a: "If we can't create or deliver your report, you can retry without paying again, or get a refund.",
  },
];

function Band() {
  return <div aria-hidden="true" className="band" />;
}

function StartButton({ cta, className = "" }: { cta: "hero_start" | "footer_start"; className?: string }) {
  return (
    <TrackedLink cta={cta} href="/start" className={`btn btn-arrow ${className}`}>
      Start
      <span className="btn-arrow-dot">
        <ArrowRight size={18} />
      </span>
    </TrackedLink>
  );
}

function PaperMock({ className = "" }: { className?: string }) {
  return (
    <div className={`grid content-start gap-2 rounded-md bg-[#FBFBFA] p-4 shadow-[0_18px_40px_rgba(40,55,62,.3)] ${className}`} aria-hidden="true">
      <div className="grid grid-cols-2 gap-1.5">
        <div className="stage h-24 rounded">
          <PlasterHead className="h-full w-full" dimmed />
        </div>
        <div className="stage h-24 rounded">
          <PlasterHead className="h-full w-full" />
        </div>
      </div>
      {[90, 72, 84, 60, 78, 66].map((width) => (
        <i key={width} className="block h-1.5 rounded bg-[#D3D9DB]" style={{ width: `${width}%` }} />
      ))}
    </div>
  );
}

export default function LandingPage() {
  const price = <PriceTag />;
  return (
    <>
      <div className="frost sticky top-0 z-30 border-b border-rule">
        <header className="mx-auto flex min-h-16 w-full max-w-[1240px] items-center justify-between gap-4 px-5 pb-2.5 pt-[max(10px,env(safe-area-inset-top))] min-[760px]:px-8">
          <Link href="/" className="text-[17px] font-semibold tracking-[0.14em]" aria-label={`${publicConfig.brandName} home`}>
            {publicConfig.brandName}
          </Link>
          <nav aria-label="Sections" className="mono hidden items-center gap-7 text-ink-2 min-[960px]:flex">
            <a href="#how">How it works</a>
            <a href="#report">The report</a>
            <a href="#pricing">Pricing</a>
            <a href="#faq">Questions</a>
          </nav>
          <div className="flex items-center gap-2">
            <TrackedLink cta="sample_report" href="/sample-report" className="pill-link mono">
              Sample report
            </TrackedLink>
            <TrackedLink cta="hero_start" href="/start" className="pill-link mono hidden bg-btn! text-on-btn shadow-none! min-[760px]:inline-flex">
              Start
            </TrackedLink>
          </div>
        </header>
      </div>

      <main id="main" className="frame">
        {/* Hero: headline and action left, the lit stage right. */}
        <section className="grid min-[960px]:grid-cols-[1fr_1.1fr] min-[960px]:items-stretch">
          <div className="order-2 flex flex-col justify-center px-5 pb-10 pt-8 min-[960px]:order-1 min-[960px]:px-8 min-[960px]:py-16">
            <span className="eyebrow mono self-start">Looksmaxxing report</span>
            <h1 className="display two-tone mt-5 min-[960px]:text-[60px]">
              Your face. <span>Your full glow&#8209;up.</span>
            </h1>
            <p className="mt-4 max-w-[440px] text-[17px] leading-[1.4] text-ink-2">
              Explore a personalized looksmaxxing roadmap and an AI concept portrait based on your own photos.
            </p>
            <div className="mt-7 max-w-[420px]">
              <StartButton cta="hero_start" />
              <p className="mono mt-3 text-center text-ink-2 min-[960px]:text-left">{price} once · PDF by email · photos not kept</p>
            </div>
          </div>
          <div className="order-1 p-3 min-[960px]:order-2 min-[960px]:border-l min-[960px]:border-rule min-[960px]:p-4">
            <div className="stage h-[min(48dvh,540px)] min-h-[300px] min-[960px]:h-[640px]">
              <PlasterHead className="absolute inset-x-0 bottom-0 h-[88%] w-full" />
              <CropMarks />
              <div className="readouts mono" aria-hidden="true">
                <span>Light soft · left</span>
                <span>Eye level</span>
                <span className="max-[700px]:hidden">1 front · 2 optional</span>
              </div>
              <span className="capsule frost mono absolute bottom-12 left-4">Light test · your photo replaces this</span>
            </div>
          </div>
        </section>

        <Band />

        {/* The concept: what changes, beside a real example on a fictional person. */}
        <section className="grid min-[860px]:grid-cols-[1fr_1fr]" aria-labelledby="concept">
          <div className="flex flex-col px-5 py-8 min-[960px]:px-8 min-[960px]:py-12">
            <span className="eyebrow mono self-start">The concept</span>
            <h2 id="concept" className="title-48 two-tone mt-5">
              Same face. <span>Upgraded.</span>
            </h2>
            <p className="mt-4 max-w-[420px] text-[15px] leading-[1.45] text-ink-2">
              Your report opens with a portrait of you after the changes that suit your face, so you can see the plan before you start it.
            </p>
            <ol className="mt-8 grid gap-0 min-[860px]:mt-auto min-[860px]:pt-10">
              {CONCEPT_CHANGES.map((line, index) => (
                <li key={line} className="flex gap-5 border-t border-rule py-3 text-[15px]">
                  <span className="mono w-6 shrink-0 pt-0.5 text-ink-2">[{index + 1}]</span>
                  {line}
                </li>
              ))}
            </ol>
          </div>
          <div className="px-5 pb-8 min-[860px]:border-l min-[860px]:border-rule min-[860px]:p-8">
            <div className="mx-auto max-w-[420px]">
              <ExampleCompare />
            </div>
          </div>
        </section>

        <Band />

        {/* Guesswork against the MXVA way, as two rows of steps. */}
        <section aria-labelledby="approach">
          <div className="px-5 py-10 text-center min-[960px]:py-14">
            <span className="eyebrow mono">The difference</span>
            <h2 id="approach" className="title-48 two-tone mt-5">
              Stop guessing. <span>Start with your face.</span>
            </h2>
            <p className="mx-auto mt-4 max-w-[520px] text-[15px] leading-[1.45] text-ink-2">
              Most glow-up advice is written for everyone. Yours starts from your photo and what you want to keep.
            </p>
          </div>
          <div className="grid gap-3 border-t border-rule p-3 min-[960px]:p-4">
            {[
              { label: "Guesswork", steps: GUESSWORK, lit: false },
              { label: "With MXVA", steps: WITH_MXVA, lit: true },
            ].map((row) => (
              <div
                key={row.label}
                className={`grid gap-5 rounded-[20px] p-5 min-[960px]:grid-cols-[180px_1fr] min-[960px]:items-end min-[960px]:p-7 ${
                  row.lit ? "field-lit" : "bg-raised shadow-[inset_0_0_0_1px_var(--color-rule)]"
                }`}
              >
                <p className="text-[20px] tracking-[-0.01em]">{row.label}</p>
                <ol className="grid gap-4 min-[640px]:grid-cols-2 min-[960px]:grid-cols-4">
                  {row.steps.map((step, index) => (
                    <li key={step}>
                      <div className="flex items-center gap-2" aria-hidden="true">
                        <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${row.lit ? "bg-current" : "bg-rule"}`} />
                        <span className={`h-px flex-1 ${row.lit ? "bg-current opacity-30" : "bg-rule"}`} />
                      </div>
                      <p className={`mono mt-3 ${row.lit ? "" : "text-ink-2"}`}>Step {index + 1}</p>
                      <p className="mt-1 text-[15px]">{step}</p>
                    </li>
                  ))}
                </ol>
              </div>
            ))}
          </div>
        </section>

        <Band />

        {/* What the plan is built around: a narrow centred list. */}
        <section aria-labelledby="built">
          <div className="px-5 py-10 text-center min-[960px]:py-14">
            <span className="eyebrow mono">Personal</span>
            <h2 id="built" className="title-48 two-tone mt-5">
              Built around <span>you.</span>
            </h2>
          </div>
          <ul className="mx-auto grid max-w-[620px] gap-3 border-t border-rule p-3 min-[620px]:border-x min-[960px]:p-4">
            {BUILT_AROUND.map((item, index) => (
              <li key={item.title} className="flex items-center gap-4 rounded-[16px] bg-raised p-3 shadow-[inset_0_0_0_1px_var(--color-rule)]">
                <span className="stage mono grid h-16 w-20 shrink-0 place-items-center rounded-[10px]! text-[13px] text-[var(--on-image)]" aria-hidden="true">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <span>
                  <span className="block text-[17px]">{item.title}</span>
                  <span className="mt-0.5 block text-[14px] leading-[1.4] text-ink-2">{item.detail}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>

        <Band />

        {/* The report, on the lit field. */}
        <section id="report" className="field-lit grid scroll-mt-20 min-[960px]:grid-cols-[1fr_1fr]" aria-labelledby="report-title">
          <div className="flex flex-col px-5 py-10 min-[960px]:px-8 min-[960px]:py-14">
            <span className="eyebrow mono frost self-start shadow-none!">Your report</span>
            <h2 id="report-title" className="title-48 two-tone mt-5">
              One PDF. <span>Everything in order.</span>
            </h2>
            <p className="mt-4 max-w-[420px] text-[15px] leading-[1.45] opacity-80">
              Your concept portrait first, then the plan, then the reasons behind it. It arrives by email and stays yours.
            </p>
            <ol className="mt-8 grid min-[960px]:mt-auto min-[960px]:pt-10">
              {REPORT_PARTS.map((line, index) => (
                <li key={line} className="flex gap-5 border-t border-current/20 py-3 text-[15px]">
                  <span className="mono w-6 shrink-0 pt-0.5 opacity-70">[{index + 1}]</span>
                  {line}
                </li>
              ))}
            </ol>
            <TrackedLink cta="sample_report" href="/sample-report" className="btn btn-secondary mt-6 w-auto self-start px-6">
              See a sample report
            </TrackedLink>
          </div>
          <div className="relative min-h-[380px] overflow-hidden min-[960px]:min-h-0">
            <div className="absolute inset-0 grid place-items-center">
              <div className="relative h-[300px] w-[78%] max-w-[420px] min-[960px]:h-[420px]">
                <PaperMock className="absolute left-0 top-6 w-[62%] -rotate-3" />
                <PaperMock className="absolute right-0 top-0 w-[62%] rotate-2" />
              </div>
            </div>
            <span className="capsule frost mono absolute bottom-4 left-4">Sample</span>
          </div>
        </section>

        <Band />

        {/* How it works: three cards with a picture on top. */}
        <section id="how" className="scroll-mt-20" aria-labelledby="how-title">
          <div className="px-5 py-10 text-center min-[960px]:py-14">
            <span className="eyebrow mono">How it works</span>
            <h2 id="how-title" className="title-48 two-tone mt-5">
              Three steps. <span>No account.</span>
            </h2>
            <p className="mx-auto mt-4 max-w-[480px] text-[15px] leading-[1.45] text-ink-2">From your phone, in a few minutes.</p>
          </div>
          <ol className="grid border-t border-rule min-[760px]:grid-cols-3">
            {STEPS.map((step, index) => (
              <li key={step.title} className="border-rule p-3 not-first:border-t min-[760px]:not-first:border-l min-[760px]:not-first:border-t-0 min-[960px]:p-4">
                <div className="stage relative h-48 rounded-[18px]!" aria-hidden="true">
                  {index === 0 && (
                    <>
                      <PlasterHead className="absolute inset-x-0 bottom-0 h-[86%] w-full" />
                      <CropMarks />
                      <span className="capsule frost mono absolute bottom-3 left-3">Front photo</span>
                    </>
                  )}
                  {index === 1 && (
                    <div className="absolute inset-0 grid content-center justify-center gap-2 px-6">
                      {["Keep my beard", "No hair dye", "Low budget"].map((chip, chipIndex) => (
                        <span key={chip} className={`capsule frost text-[14px] ${chipIndex === 0 ? "font-semibold" : ""}`}>
                          {chip}
                        </span>
                      ))}
                    </div>
                  )}
                  {index === 2 && (
                    <div className="absolute inset-0 grid place-items-center">
                      <PaperMock className="w-[46%] rotate-2" />
                    </div>
                  )}
                </div>
                <p className="mono mt-5 px-2 text-ink-2">{String(index + 1).padStart(2, "0")}</p>
                <h3 className="mt-2 px-2 text-[20px] tracking-[-0.01em]">{step.title}</h3>
                <p className="mt-1.5 px-2 pb-4 text-[15px] leading-[1.45] text-ink-2">{step.detail}</p>
              </li>
            ))}
          </ol>
        </section>

        <Band />

        {/* Pricing: what's included left, the price card right, a trust strip below. */}
        <section id="pricing" className="scroll-mt-20" aria-labelledby="pricing-title">
          <div className="px-5 py-10 text-center min-[960px]:py-14">
            <span className="eyebrow mono">Pricing</span>
            <h2 id="pricing-title" className="title-48 two-tone mt-5">
              One report. <span>{price}, once.</span>
            </h2>
            <p className="mx-auto mt-4 text-[15px] text-ink-2">No subscription. No account.</p>
          </div>
          <div className="grid grid-cols-[minmax(0,1fr)] border-t border-rule min-[860px]:grid-cols-2">
            <ul className="grid gap-5 px-5 py-8 min-[960px]:px-8 min-[960px]:py-10">
              {INCLUDED.map((item) => (
                <li key={item.title} className="flex gap-4">
                  <Tick size={18} className="mt-0.5 shrink-0 text-ink-2" />
                  <span>
                    <span className="block text-[17px]">{item.title}</span>
                    <span className="mt-0.5 block text-[14px] leading-[1.4] text-ink-2">{item.detail}</span>
                  </span>
                </li>
              ))}
            </ul>
            <div className="grid grid-cols-[minmax(0,1fr)] content-center gap-6 border-rule px-5 pb-10 min-[860px]:border-l min-[860px]:px-10 min-[860px]:py-10">
              <div className="field-lit relative mx-auto flex aspect-[1.6] w-full max-w-[400px] flex-col justify-between rounded-[18px] p-6 shadow-[0_24px_50px_rgba(40,55,62,.28)]">
                <p className="text-[22px] leading-[1.1] tracking-[-0.01em]">
                  {publicConfig.brandName}
                  <span className="block opacity-70">Glow-up report</span>
                </p>
                <p className="flex items-baseline justify-between gap-3">
                  <span className="text-[44px] leading-none tracking-[-0.03em] tabular-nums">{price}</span>
                  <span className="text-[13px] opacity-80">one-time</span>
                </p>
              </div>
              <div className="mx-auto grid w-full max-w-[400px] gap-3">
                <p className="mono text-center text-ink-2">Pix in Brazil · card · Apple Pay · Google Pay</p>
                <StartButton cta="footer_start" />
              </div>
            </div>
          </div>
          <ul className="grid border-t border-rule min-[760px]:grid-cols-3">
            {TRUST.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-center gap-3 border-rule px-5 py-4 text-[14px] text-ink-2 not-first:border-t min-[760px]:not-first:border-l min-[760px]:not-first:border-t-0 min-[960px]:px-8">
                <Icon size={18} className="shrink-0" />
                {text}
              </li>
            ))}
          </ul>
        </section>

        <Band />

        {/* Privacy and limits, side by side. */}
        <section className="grid min-[760px]:grid-cols-2" aria-labelledby="privacy">
          <div className="px-5 py-10 min-[960px]:px-8 min-[960px]:py-12">
            <span className="eyebrow mono">Privacy</span>
            <h2 id="privacy" className="title-48 two-tone mt-5">
              Plainly. <span>Your photos aren&apos;t kept.</span>
            </h2>
            <p className="mt-4 max-w-[480px] text-[15px] leading-[1.45] text-ink-2">
              Photos stay in your browser until you pay. Then they go to our server and AI providers only to create your report, and they are
              not saved in our photo database. AI and email providers handle data under their own terms, which our Privacy Policy explains. We
              keep your email and payment record for support and accounting.
            </p>
          </div>
          <div className="border-rule px-5 pb-10 min-[760px]:border-l min-[760px]:py-10 min-[960px]:px-8 min-[960px]:py-12">
            <span className="eyebrow mono">Limits</span>
            <h2 className="title-48 two-tone mt-5">
              What we won&apos;t do. <span>Ever.</span>
            </h2>
            <ul className="mt-6 grid text-[15px]">
              {WONT.map((line) => (
                <li key={line} className="flex items-center gap-4 border-t border-rule py-3">
                  <span aria-hidden="true" className="mono w-6 text-ink-2">No</span>
                  {line}
                </li>
              ))}
            </ul>
          </div>
        </section>

        <Band />

        {/* Questions: heading column left, accordion right. */}
        <section id="faq" className="grid scroll-mt-20 min-[860px]:grid-cols-[1fr_1.6fr]" aria-labelledby="faq-title">
          <div className="px-5 py-10 min-[960px]:px-8 min-[960px]:py-12">
            <span className="eyebrow mono">Questions</span>
            <h2 id="faq-title" className="title-48 two-tone mt-5">
              Asked <span>often.</span>
            </h2>
            <p className="mt-4 text-[15px] leading-[1.45] text-ink-2">
              More in{" "}
              <Link href="/help" className="text-ink underline underline-offset-2">
                Help
              </Link>
              .
            </p>
          </div>
          <div className="border-rule px-5 pb-8 min-[860px]:border-l min-[860px]:py-8 min-[960px]:px-8">
            {FAQ.map((item) => (
              <details key={item.q} className="border-b border-rule py-4 first:border-t min-[860px]:first:border-t-0">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-1 text-[17px] [&::-webkit-details-marker]:hidden">
                  {item.q}
                  <Plus size={18} className="faq-plus shrink-0 text-ink-2" />
                </summary>
                <p className="mt-2 max-w-[620px] text-[15px] leading-[1.45] text-ink-2">{item.a}</p>
              </details>
            ))}
          </div>
        </section>

        <Band />

        {/* Closing call to action on the lit field. */}
        <section className="field-lit px-5 py-14 text-center min-[960px]:py-20" aria-labelledby="closing">
          <h2 id="closing" className="title-48 two-tone">
            See your glow-up. <span>Then make it real.</span>
          </h2>
          <div className="mx-auto mt-7 max-w-[380px]">
            <StartButton cta="footer_start" />
            <p className="mono mt-3 opacity-80">{price} once · PDF by email</p>
          </div>
        </section>
      </main>
      <LandingFooter />
      <ConsentBanner />
    </>
  );
}
