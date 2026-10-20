import Link from "next/link";
import { ConsentBanner } from "@/components/common/ConsentBanner";
import { ArrowRight, CreditCard, Lock, Plus, Tick } from "@/components/common/icons";
import { CropMarks, PlasterHead } from "@/components/common/StudioArt";
import { PriceTag } from "@/components/checkout/PriceTag";
import { AreaTabs, type AreaTab } from "@/components/marketing/AreaTabs";
import { AnnotatedConcept, HeroProof } from "@/components/marketing/HeroProof";
import { LandingFooter } from "@/components/marketing/LandingFooter";
import { TrackedLink } from "@/components/marketing/TrackedLink";
import { FOCUS_OPTIONS, PHOTO_REQUIREMENTS } from "@/features/onboarding/steps";
import { LIBRARY } from "@/features/report/library";
import { getSource } from "@/features/report/references";
import { TYPICAL_DELIVERY, publicConfig } from "@/lib/config";
import { EXAMPLE_AFTER, EXAMPLE_BEFORE } from "@/lib/examples";

/*
 * Layout: one framed column, sections divided by hairline bands, an eyebrow capsule over
 * each light two-tone heading. Breakpoints at 768px and 1100px (see .frame, .band, .sec and
 * the .t-* type scale in globals.css). Every figure below is read from the report library.
 */

const EVIDENCE_LABELS = { established: "Established guidance", limited: "Limited evidence", styling_opinion: "Styling opinion" } as const;
const COST_LABELS = { free: "Free", low: "Low cost", medium: "Medium cost", professional: "Professional" } as const;
const HORIZON_LABELS = { now: "Start now", "30d": "Within 30 days", "90d": "Within 90 days", professional: "Optional consult" } as const;
const EFFORT_LABELS = { low: "Low", medium: "Medium", high: "High" } as const;

const AREAS: AreaTab[] = FOCUS_OPTIONS.map((option) => ({
  id: option.id,
  label: option.label,
  // Everyday steps first; referrals only appear in reports when the buyer asks.
  cards: LIBRARY.filter((template) => template.area === option.id)
    .toSorted((a, b) => Number(Boolean(a.onlyIfAsked)) - Number(Boolean(b.onlyIfAsked)))
    .slice(0, 4)
    .map((template) => {
      // Styling opinions can stand without a study; the card says so instead of inventing one.
      const sourceId = template.sourceIds[0];
      const source = sourceId ? getSource(sourceId) : null;
      return {
        id: template.id,
        title: template.title,
        evidence: EVIDENCE_LABELS[template.evidenceLevel],
        effort: EFFORT_LABELS[template.effort],
        cost: COST_LABELS[template.costBand],
        when: HORIZON_LABELS[template.horizon],
        source: source ? `${source.publisher} · ${source.dateLabel}` : "No study cited: stylist practice",
      };
    }),
}));

const EVIDENCE_LEVELS = [
  { level: "established", detail: "Backed by trials or by professional bodies, like daily SPF." },
  { level: "limited", detail: "Some support, not settled. The report says so next to the step." },
  { level: "styling_opinion", detail: "Barber and stylist practice, labelled as opinion, never as science." },
] as const;

/** Example schedule lines, taken from real templates (a report picks the ones that fit you). */
function planLine(id: string, day: "day7" | "day30" | "day90") {
  const line = LIBRARY.find((template) => template.id === id)?.plan[day];
  if (!line) throw new Error(`Missing ${day} line for ${id}`);
  return line;
}

const SCHEDULE = [
  { day: "Day 7", title: "Start small", lines: [planLine("skin-daily-spf", "day7"), planLine("brows-clean-strays", "day7"), planLine("eyes-regular-sleep", "day7")] },
  {
    day: "Day 30",
    title: "Make it a habit",
    lines: [planLine("hair-cut-for-your-face", "day30"), planLine("eyes-regular-sleep", "day30"), planLine("skin-gentle-cleanse", "day30")],
  },
  { day: "Day 90", title: "Look back", lines: [planLine("skin-daily-spf", "day90"), planLine("eyes-regular-sleep", "day90"), planLine("beard-grow-out", "day90")] },
];

const CONCEPT_CHANGES = [
  "A haircut and colour picked for your face shape",
  "Clearer, more even skin",
  "Brows cleaned up and shaped",
  "Beard, stubble or a clean shave, whichever fits",
  "The same face, pose and light, so you still recognise yourself",
];

const GUESSWORK = ["Copy a celebrity's haircut", "Buy whatever is trending", "Try ten products at once", "Give up after a week"];
const WITH_MXVA = ["Add one front photo", "See your concept portrait", "Follow a ranked plan", "Check in at 7, 30 and 90 days"];

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

const AFTER_PAYING = [
  { title: "Request received", detail: "Confirmed on screen right away. You can close the page." },
  { title: "Report by email", detail: `Your PDF arrives in ${TYPICAL_DELIVERY}.` },
  { title: "Automatic retries", detail: "If a step fails, we try again without asking you." },
  { title: "Never charged twice", detail: "If it still fails, you get a link to try again, free." },
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
    q: "How long does it take?",
    a: `A few minutes to add your photo and answer the questions. After you pay, your PDF arrives by email in ${TYPICAL_DELIVERY}.`,
  },
  {
    q: "Do I need an account?",
    a: "No. You only give an email address, so we can send your report.",
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

function SectionHead({
  eyebrow,
  id,
  title,
  rest,
  lead,
  center = false,
  onField = false,
}: {
  eyebrow: string;
  id: string;
  title: string;
  rest: string;
  lead?: string;
  center?: boolean;
  onField?: boolean;
}) {
  return (
    <div className={center ? "text-center" : ""}>
      <span className={`eyebrow mono ${onField ? "frost shadow-none!" : ""}`}>{eyebrow}</span>
      <h2 id={id} className="t-section two-tone mt-5">
        {title} <span>{rest}</span>
      </h2>
      {lead && <p className={`t-lead mt-4 max-w-[520px] ${center ? "mx-auto" : ""} ${onField ? "opacity-80" : "text-ink-2"}`}>{lead}</p>}
    </div>
  );
}

function StartButton({ cta, className = "" }: { cta: "hero_start" | "footer_start"; className?: string }) {
  return (
    <TrackedLink cta={cta} href="/onboarding/photos" starts className={`btn btn-arrow ${className}`}>
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
        {[EXAMPLE_BEFORE, EXAMPLE_AFTER].map((src) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={src} src={src} alt="" className="h-24 w-full rounded object-cover object-top" loading="lazy" />
        ))}
      </div>
      {[90, 72, 84, 60, 78, 66].map((width) => (
        <i key={width} className="block h-1.5 rounded bg-[#D3D9DB]" style={{ width: `${width}%` }} />
      ))}
    </div>
  );
}

function NumberedList({ items, onField = false }: { items: readonly string[]; onField?: boolean }) {
  return (
    <ol className="grid">
      {items.map((line, index) => (
        <li key={line} className={`flex gap-5 border-t py-3 text-[15px] ${onField ? "border-current/20" : "border-rule"}`}>
          <span className={`mono w-6 shrink-0 pt-0.5 ${onField ? "" : "text-ink-2"}`}>[{index + 1}]</span>
          {line}
        </li>
      ))}
    </ol>
  );
}

export default function LandingPage() {
  const price = <PriceTag />;
  return (
    <>
      <div className="frost sticky top-0 z-30 border-b border-rule">
        <header className="mx-auto flex min-h-16 w-full max-w-[1360px] items-center justify-between gap-4 px-4 pb-2.5 pt-[max(10px,env(safe-area-inset-top))] min-[768px]:px-8">
          <Link href="/" className="text-[17px] font-semibold tracking-[0.14em]" aria-label={`${publicConfig.brandName} home`}>
            {publicConfig.brandName}
          </Link>
          <nav aria-label="Sections" className="mono hidden items-center gap-7 text-ink-2 min-[1100px]:flex">
            <a href="#areas">Areas</a>
            <a href="#how">How it works</a>
            <a href="#report">The report</a>
            <a href="#pricing">Pricing</a>
            <a href="#faq">Questions</a>
          </nav>
          <div className="flex items-center gap-2">
            <TrackedLink cta="sample_report" href="/sample-report" className="pill-link mono">
              Sample report
            </TrackedLink>
            <TrackedLink cta="hero_start" href="/onboarding/photos" starts className="pill-link mono hidden bg-btn! text-on-btn shadow-none! min-[768px]:inline-flex">
              Start
            </TrackedLink>
          </div>
        </header>
      </div>

      <main id="main" className="frame">
        {/* Hero: the proof (a real before and after) above the headline, the offer and Start. */}
        <section className="grid min-[1100px]:grid-cols-[1fr_1.1fr]">
          <div className="order-2 flex flex-col justify-center px-4 pb-14 pt-5 min-[768px]:px-8 min-[768px]:pt-8 min-[1100px]:order-1 min-[1100px]:py-20">
            <span className="eyebrow mono self-start">Looksmaxxing report</span>
            <h1 className="t-hero two-tone mt-4 min-[768px]:mt-5">
              Your face. <span>Your full glow&#8209;up.</span>
            </h1>
            <p className="t-lead mt-3 max-w-[460px] text-ink-2 min-[768px]:mt-4">
              A personalized looksmaxxing roadmap and an AI concept portrait, made from your own photo.
            </p>
            <div className="mt-5 max-w-[420px] min-[768px]:mt-7">
              <StartButton cta="hero_start" />
              <p className="mono mt-3 text-center text-ink-2 min-[1100px]:text-left">{price} once · PDF by email · photos not kept</p>
            </div>
          </div>
          <div className="order-1 p-3 min-[768px]:p-4 min-[1100px]:order-2 min-[1100px]:border-l min-[1100px]:border-rule">
            <HeroProof />
          </div>
        </section>

        <Band />

        {/* The concept: what changes, beside a real example on a fictional person. */}
        <section className="grid min-[1100px]:grid-cols-2" aria-labelledby="concept">
          <div className="sec flex flex-col">
            <SectionHead
              eyebrow="The concept"
              id="concept"
              title="Same face."
              rest="Upgraded."
              lead="Your report opens with a portrait of you after the changes that suit your face, so you can see the plan before you start it."
            />
            <div className="mt-8 min-[1100px]:mt-auto min-[1100px]:pt-10">
              <NumberedList items={CONCEPT_CHANGES} />
            </div>
          </div>
          <div className="px-4 pb-14 min-[768px]:px-8 min-[1100px]:border-l min-[1100px]:border-rule min-[1100px]:py-20">
            <div className="mx-auto max-w-[420px]">
              <AnnotatedConcept />
            </div>
          </div>
        </section>

        <Band />

        {/* Seven areas, each with real steps from the report library. */}
        <section id="areas" className="scroll-mt-20 pb-1" aria-labelledby="areas-title">
          <div className="sec pb-8! min-[768px]:pb-10!">
            <SectionHead
              eyebrow="What it covers"
              id="areas-title"
              title="Seven areas."
              rest="One plan."
              lead="A report picks 5 to 10 steps for your face from a library like this. Every step carries its evidence label, its effort, its cost and a dated source."
            />
          </div>
          <AreaTabs areas={AREAS} />
        </section>

        <Band />

        {/* Guesswork against the MXVA way, as two rows of steps. */}
        <section aria-labelledby="approach">
          <div className="sec">
            <SectionHead
              center
              eyebrow="The difference"
              id="approach"
              title="Stop guessing."
              rest="Start with your face."
              lead="Most glow-up advice is written for everyone. Yours starts from your photo and what you want to keep."
            />
          </div>
          <div className="grid gap-3 border-t border-rule p-3 min-[768px]:p-4">
            {[
              { label: "Guesswork", steps: GUESSWORK, lit: false },
              { label: "With MXVA", steps: WITH_MXVA, lit: true },
            ].map((row) => (
              <div
                key={row.label}
                className={`grid gap-5 rounded-[20px] p-5 min-[1100px]:grid-cols-[200px_1fr] min-[1100px]:items-end min-[1100px]:p-7 ${
                  row.lit ? "field-lit" : "bg-raised shadow-[inset_0_0_0_1px_var(--color-rule)]"
                }`}
              >
                <p className="t-card">{row.label}</p>
                <ol className="grid gap-4 min-[768px]:grid-cols-2 min-[1100px]:grid-cols-4">
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

        {/* What each evidence label means, with how many library steps carry it. */}
        <section aria-labelledby="evidence">
          <div className="sec">
            <SectionHead
              eyebrow="Evidence"
              id="evidence"
              title="Every step,"
              rest="labelled."
              lead="You always know whether a step is settled science, early evidence or a stylist's judgement."
            />
          </div>
          <ul className="grid border-t border-rule min-[768px]:grid-cols-3">
            {EVIDENCE_LEVELS.map((item) => (
              <li
                key={item.level}
                className="border-rule px-4 py-6 not-first:border-t min-[768px]:px-8 min-[768px]:py-8 min-[768px]:not-first:border-l min-[768px]:not-first:border-t-0"
              >
                <span className="ev mono">{EVIDENCE_LABELS[item.level]}</span>
                <p className="mt-3 text-[15px] leading-[1.45]">{item.detail}</p>
                <p className="mono mt-3 text-ink-2">{LIBRARY.filter((template) => template.evidenceLevel === item.level).length} steps in the library</p>
              </li>
            ))}
          </ul>
        </section>

        <Band />

        {/* The report, on the lit field. */}
        <section id="report" className="field-lit grid scroll-mt-20 min-[1100px]:grid-cols-2" aria-labelledby="report-title">
          <div className="sec flex flex-col">
            <SectionHead
              onField
              eyebrow="Your report"
              id="report-title"
              title="One PDF."
              rest="Everything in order."
              lead="Your concept portrait first, then the plan, then the reasons behind it. It arrives by email and stays yours."
            />
            <div className="mt-8 min-[1100px]:mt-auto min-[1100px]:pt-10">
              <NumberedList items={REPORT_PARTS} onField />
            </div>
            <TrackedLink cta="sample_report" href="/sample-report" className="btn btn-secondary mt-6 w-auto self-start px-6">
              See a sample report
            </TrackedLink>
          </div>
          <div className="relative min-h-[380px] overflow-hidden min-[1100px]:min-h-0">
            <div className="absolute inset-0 grid place-items-center">
              <div className="relative h-[300px] w-[78%] max-w-[440px] min-[1100px]:h-[440px]">
                <PaperMock className="absolute left-0 top-6 w-[62%] -rotate-3" />
                <PaperMock className="absolute right-0 top-0 w-[62%] rotate-2" />
              </div>
            </div>
            <span className="capsule frost mono absolute bottom-4 left-4">Sample</span>
          </div>
        </section>

        <Band />

        {/* The 7, 30 and 90-day plan, as three columns. */}
        <section aria-labelledby="schedule">
          <div className="sec">
            <SectionHead
              center
              eyebrow="Your 90 days"
              id="schedule"
              title="This week, this month,"
              rest="this season."
              lead="Example lines from real report templates. Yours are chosen for your photo and your answers."
            />
          </div>
          <ol className="grid border-t border-rule min-[768px]:grid-cols-3">
            {SCHEDULE.map((column) => (
              <li
                key={column.day}
                className="border-rule px-4 py-8 not-first:border-t min-[768px]:px-8 min-[768px]:not-first:border-l min-[768px]:not-first:border-t-0 min-[1100px]:py-10"
              >
                <p className="mono text-ink-2">{column.day}</p>
                <h3 className="t-card mt-2">{column.title}</h3>
                <ul className="mt-5 grid gap-3">
                  {column.lines.map((line) => (
                    <li key={line} className="flex gap-3 text-[15px] leading-[1.45]">
                      <Tick size={16} className="mt-1 shrink-0 text-ink-2" />
                      {line}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ol>
        </section>

        <Band />

        {/* A good photo: the lit stage beside the four requirements. */}
        <section className="grid min-[1100px]:grid-cols-2" aria-labelledby="photo">
          <div className="p-3 min-[768px]:p-4">
            <div className="stage h-[420px] min-[768px]:h-[520px] min-[1100px]:h-full min-[1100px]:min-h-[560px]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={EXAMPLE_BEFORE} alt="A good front photo: facing the camera at eye level, in soft window light" className="absolute inset-0 h-full w-full object-cover object-top" loading="lazy" />
              <CropMarks />
              <div className="readouts mono frost right-10 top-10 rounded-[14px] px-3 py-2.5" aria-hidden="true">
                <span>Window light</span>
                <span>Arm&apos;s length</span>
                <span>Eye level</span>
              </div>
              <span className="capsule frost mono absolute bottom-10 left-10">Fictional AI-generated person</span>
            </div>
          </div>
          <div className="sec flex flex-col min-[1100px]:border-l min-[1100px]:border-rule">
            <SectionHead
              eyebrow="Your photo"
              id="photo"
              title="A good photo."
              rest="Four simple things."
              lead="The report reads your face from this photo, so a clear one makes a better plan. It stays in your browser until you pay."
            />
            <ol className="mt-8 grid min-[1100px]:mt-auto min-[1100px]:pt-10">
              {PHOTO_REQUIREMENTS.map((item, index) => (
                <li key={item.title} className="flex gap-5 border-t border-rule py-4">
                  <span className="mono w-6 shrink-0 pt-1 text-ink-2">[{index + 1}]</span>
                  <span>
                    <span className="block text-[17px]">{item.title}</span>
                    <span className="mt-0.5 block text-[15px] leading-[1.4] text-ink-2">{item.detail}</span>
                  </span>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <Band />

        {/* How it works: three cards with a picture on top. */}
        <section id="how" className="scroll-mt-20" aria-labelledby="how-title">
          <div className="sec">
            <SectionHead center eyebrow="How it works" id="how-title" title="Three steps." rest="No account." lead="From your phone, in a few minutes." />
          </div>
          <ol className="grid border-t border-rule min-[768px]:grid-cols-3">
            {STEPS.map((step, index) => (
              <li key={step.title} className="border-rule p-3 not-first:border-t min-[768px]:p-4 min-[768px]:not-first:border-l min-[768px]:not-first:border-t-0">
                <div className="stage relative h-48 rounded-[18px]! min-[1100px]:h-56" aria-hidden="true">
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
                        <span key={chip} className={`capsule frost text-[15px] ${chipIndex === 0 ? "font-semibold" : ""}`}>
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
                <h3 className="t-card mt-2 px-2">{step.title}</h3>
                <p className="mt-1.5 px-2 pb-4 text-[15px] leading-[1.45] text-ink-2">{step.detail}</p>
              </li>
            ))}
          </ol>
        </section>

        <Band />

        {/* Pricing: what's included, the price card, a trust strip below. */}
        <section id="pricing" className="scroll-mt-20" aria-labelledby="pricing-title">
          <div className="sec text-center">
            <span className="eyebrow mono">Pricing</span>
            <h2 id="pricing-title" className="t-section two-tone mt-5">
              One report. <span>{price}, once.</span>
            </h2>
            <p className="t-lead mx-auto mt-4 text-ink-2">No subscription. No account.</p>
          </div>
          <div className="grid grid-cols-[minmax(0,1fr)] border-t border-rule min-[1100px]:grid-cols-2">
            <ul className="grid gap-5 px-4 py-8 min-[768px]:px-8 min-[768px]:py-10">
              {INCLUDED.map((item) => (
                <li key={item.title} className="flex gap-4">
                  <Tick size={18} className="mt-0.5 shrink-0 text-ink-2" />
                  <span>
                    <span className="block text-[17px]">{item.title}</span>
                    <span className="mt-0.5 block text-[15px] leading-[1.4] text-ink-2">{item.detail}</span>
                  </span>
                </li>
              ))}
            </ul>
            <div className="grid grid-cols-[minmax(0,1fr)] content-center gap-6 border-rule px-4 pb-10 min-[768px]:px-8 min-[1100px]:border-l min-[1100px]:px-10 min-[1100px]:py-10">
              <div className="field-lit relative mx-auto flex aspect-[1.6] w-full max-w-[400px] flex-col justify-between rounded-[18px] p-6 shadow-[0_24px_50px_rgba(40,55,62,.28)]">
                <p className="text-[22px] leading-[1.1] tracking-[-0.01em]">
                  {publicConfig.brandName}
                  <span className="block opacity-70">Glow-up report</span>
                </p>
                <p className="flex items-baseline justify-between gap-3">
                  <span className="text-[44px] leading-none tracking-[-0.03em] tabular-nums">{price}</span>
                  <span className="text-[15px]">one-time</span>
                </p>
              </div>
              <div className="mx-auto grid w-full max-w-[400px] gap-3">
                <p className="mono text-center text-ink-2">Pix in Brazil · card · Apple Pay · Google Pay</p>
                <StartButton cta="footer_start" />
              </div>
            </div>
          </div>
          <ul className="grid border-t border-rule min-[768px]:grid-cols-3">
            {TRUST.map(({ icon: Icon, text }) => (
              <li
                key={text}
                className="flex items-center gap-3 border-rule px-4 py-4 text-[15px] text-ink-2 not-first:border-t min-[768px]:px-8 min-[768px]:not-first:border-l min-[768px]:not-first:border-t-0"
              >
                <Icon size={18} className="shrink-0" />
                {text}
              </li>
            ))}
          </ul>
        </section>

        <Band />

        {/* After you pay: four steps joined by a line. */}
        <section aria-labelledby="delivery">
          <div className="sec">
            <SectionHead
              eyebrow="After you pay"
              id="delivery"
              title="Nobody waits on a screen."
              rest="It comes to you."
              lead="Your report is made in the background and sent by email. If anything goes wrong, it's on us, not you."
            />
          </div>
          <ol className="grid border-t border-rule min-[768px]:grid-cols-2 min-[1100px]:grid-cols-4">
            {AFTER_PAYING.map((step, index) => (
              <li
                key={step.title}
                className="border-rule px-4 py-6 not-first:border-t min-[768px]:px-8 min-[768px]:py-8 min-[768px]:[&:nth-child(2)]:border-t-0 min-[768px]:[&:nth-child(even)]:border-l min-[1100px]:not-first:border-l min-[1100px]:not-first:border-t-0"
              >
                <div className="flex items-center gap-2" aria-hidden="true">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-ink" />
                  <span className="h-px flex-1 bg-rule" />
                </div>
                <p className="mono mt-4 text-ink-2">{String(index + 1).padStart(2, "0")}</p>
                <h3 className="t-card mt-2">{step.title}</h3>
                <p className="mt-1.5 text-[15px] leading-[1.45] text-ink-2">{step.detail}</p>
              </li>
            ))}
          </ol>
        </section>

        <Band />

        {/* Privacy and limits, side by side. */}
        <section className="grid min-[768px]:grid-cols-2" aria-labelledby="privacy">
          <div className="sec">
            <SectionHead eyebrow="Privacy" id="privacy" title="Plainly." rest="Your photos aren't kept." />
            <p className="t-lead mt-4 max-w-[480px] text-ink-2">
              Photos stay in your browser until you pay. Then they go to our server and AI providers only to create your report, and they are
              not saved in our photo database. AI and email providers handle data under their own terms, which our Privacy Policy explains. We
              keep your email and payment record for support and accounting.
            </p>
          </div>
          <div className="sec border-rule pt-0! min-[768px]:border-l min-[768px]:pt-20!">
            <span className="eyebrow mono">Limits</span>
            <h2 className="t-section two-tone mt-5">
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

        {/* Questions: heading column, accordion beside it. */}
        <section id="faq" className="grid scroll-mt-20 min-[1100px]:grid-cols-[1fr_1.6fr]" aria-labelledby="faq-title">
          <div className="sec">
            <SectionHead eyebrow="Questions" id="faq-title" title="Asked" rest="often." />
            <p className="t-lead mt-4 text-ink-2">
              More in{" "}
              <Link href="/help" className="text-ink underline underline-offset-2">
                Help
              </Link>
              .
            </p>
          </div>
          <div className="border-rule px-4 pb-10 min-[768px]:px-8 min-[1100px]:border-l min-[1100px]:py-14">
            {FAQ.map((item) => (
              <details key={item.q} className="border-b border-rule py-4 first:border-t min-[1100px]:first:border-t-0">
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
        <section className="field-lit px-4 py-16 text-center min-[768px]:px-8 min-[1100px]:py-24" aria-labelledby="closing">
          <h2 id="closing" className="t-section two-tone">
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
