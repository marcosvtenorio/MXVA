import { ConsentBanner } from "@/components/common/ConsentBanner";
import { ArrowRight } from "@/components/common/icons";
import { CropMarks, PlasterHead } from "@/components/common/StudioArt";
import { SiteHeader } from "@/components/common/SiteHeader";
import { SiteFooter } from "@/components/marketing/SiteFooter";
import { TrackedLink } from "@/components/marketing/TrackedLink";
import { PriceTag } from "@/components/checkout/PriceTag";

const STEPS = [
  { title: "Answer 16 short questions", detail: "Your goals, your time and budget, what to avoid. About three minutes." },
  { title: "Add one front photo", detail: "It stays in your browser tab until you pay. Two side photos are optional." },
  { title: "Pay once, get your report", detail: "An AI concept portrait of you and a PDF roadmap, delivered by email." },
];

const INCLUDED = [
  "An AI concept portrait: your own photo, groomed and well lit. Same face, same framing.",
  "5 to 8 priorities ranked by fit, evidence, effort and cost, never by looks.",
  "A 7-day start, a 30-day plan and a 90-day plan.",
  "What a photo can't tell us, questions for a professional, and every source with its date.",
];

const WONT = ["Rate or score your face", "Diagnose skin, teeth or hair", "Suggest surgery or medication", "Promise bone or eye-shape changes"];

const FAQ = [
  {
    q: "Is this a face rating?",
    a: "No. MXVA never scores, ranks or rates faces. It suggests grooming, care and presentation steps, ordered by how much they fit your goals and how good the evidence is.",
  },
  {
    q: "Will the AI change my face?",
    a: "The concept keeps your identity, features, skin tone and proportions. It only shows realistic, low-risk changes you chose, like grooming, hair and lighting. It's an illustration, not a prediction.",
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

export default function LandingPage() {
  const price = <PriceTag />;
  return (
    <>
      <div className="mx-auto w-full max-w-[1120px]">
        <SiteHeader
          action={
            <TrackedLink cta="sample_report" href="/sample-report" className="pill-link mono">
              Sample report
            </TrackedLink>
          }
        />
      </div>
      <main id="main">
        <section className="mx-auto grid w-full max-w-[1120px] min-[960px]:grid-cols-[1fr_1.05fr] min-[960px]:items-center min-[960px]:gap-12 min-[960px]:px-5">
          <div className="order-2 px-5 pt-6 min-[960px]:order-1 min-[960px]:px-0 min-[960px]:pt-0">
            <h1 className="display two-tone min-[960px]:text-[56px]">
              Your face. <span>A realistic next&#8209;step plan.</span>
            </h1>
            <p className="mt-3.5 max-w-[440px] text-[17px] leading-[1.38] text-ink-2">
              Explore a personalized looksmaxxing roadmap and an AI concept portrait based on your own photos.
            </p>
            <div className="mt-6 max-w-[420px]">
              <TrackedLink cta="hero_start" href="/start" className="btn btn-arrow">
                Start
                <span className="btn-arrow-dot">
                  <ArrowRight size={18} />
                </span>
              </TrackedLink>
              <p className="mono mt-3 text-center text-ink-2 min-[960px]:text-left">{price} once · PDF by email · photos not kept</p>
            </div>
          </div>
          <div className="stage order-1 mx-3 h-[min(46dvh,520px)] min-h-[300px] min-[960px]:order-2 min-[960px]:mx-0 min-[960px]:h-[600px]">
            <PlasterHead className="absolute inset-x-0 bottom-0 h-[88%] w-full" />
            <CropMarks />
            <div className="readouts mono" aria-hidden="true">
              <span>Light soft · left</span>
              <span>Eye level</span>
              <span className="max-[700px]:hidden">1 front · 2 optional</span>
            </div>
            <span className="capsule frost mono absolute bottom-12 left-4">Light test · your photo replaces this</span>
          </div>
        </section>

        <section className="mx-auto mt-20 w-full max-w-[1120px] px-5" aria-labelledby="how">
          <h2 id="how" className="title-28 two-tone">
            How it works. <span>Three steps, no account.</span>
          </h2>
          <ol className="mt-6 grid gap-5 min-[760px]:grid-cols-3">
            {STEPS.map((step, index) => (
              <li key={step.title} className="border-t border-rule pt-4">
                <span className="mono text-ink-2">{String(index + 1).padStart(2, "0")}</span>
                <p className="mt-2 text-[17px] font-semibold">{step.title}</p>
                <p className="mt-1 text-[15px] leading-[1.4] text-ink-2">{step.detail}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="mx-auto mt-20 grid w-full max-w-[1120px] gap-8 px-5 min-[760px]:grid-cols-2" aria-labelledby="included">
          <div>
            <h2 id="included" className="title-28 two-tone">
              What you get. <span>One PDF, by email.</span>
            </h2>
            <ul className="mt-6 grid gap-3 text-[15px] leading-[1.45]">
              {INCLUDED.map((line) => (
                <li key={line} className="border-t border-rule pt-3">
                  {line}
                </li>
              ))}
            </ul>
            <TrackedLink cta="sample_report" href="/sample-report" className="btn btn-secondary mt-6 w-auto px-6">
              See a sample report
            </TrackedLink>
          </div>
          <div className="stage min-h-[320px]">
            <div className="absolute inset-0 grid place-items-center">
              <div className="grid w-[62%] max-w-[260px] rotate-2 content-start gap-2 rounded-md bg-[#FBFBFA] p-4 shadow-[0_18px_40px_rgba(40,55,62,.3)]" aria-hidden="true">
                <div className="stage h-28 rounded">
                  <PlasterHead className="h-full w-full" />
                </div>
                {[90, 72, 84, 60, 78, 66].map((width) => (
                  <i key={width} className="block h-1.5 rounded bg-[#D3D9DB]" style={{ width: `${width}%` }} />
                ))}
              </div>
            </div>
            <span className="capsule frost mono absolute left-4 top-4">Sample</span>
          </div>
        </section>

        <section className="mx-auto mt-20 grid w-full max-w-[1120px] gap-8 px-5 min-[760px]:grid-cols-2" aria-labelledby="privacy">
          <div>
            <h2 id="privacy" className="title-28 two-tone">
              Privacy, plainly. <span>Your photos aren&apos;t kept.</span>
            </h2>
            <p className="mt-4 text-[15px] leading-[1.45] text-ink-2">
              Photos stay in your browser until you pay. Then they go to our server and AI providers only to create your report, and they are
              not saved in our photo database. AI and email providers handle data under their own terms, which our Privacy Policy explains. We
              keep your email and payment record for support and accounting.
            </p>
          </div>
          <div>
            <h2 className="title-28 two-tone">
              What we won&apos;t do. <span>Ever.</span>
            </h2>
            <ul className="mt-4 grid gap-2 text-[15px]">
              {WONT.map((line) => (
                <li key={line} className="flex items-center gap-3 border-t border-rule pt-2.5">
                  <span aria-hidden="true" className="mono text-ink-2">No</span>
                  {line}
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="mx-auto mt-20 w-full max-w-[1120px] px-5" aria-labelledby="faq">
          <h2 id="faq" className="title-28">
            Questions
          </h2>
          <div className="mt-4 grid gap-0 min-[760px]:max-w-[720px]">
            {FAQ.map((item) => (
              <details key={item.q} className="group border-t border-rule py-4">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-[17px] font-semibold [&::-webkit-details-marker]:hidden">
                  {item.q}
                  <span aria-hidden="true" className="mono text-ink-2 group-open:hidden">More</span>
                  <span aria-hidden="true" className="mono hidden text-ink-2 group-open:inline">Less</span>
                </summary>
                <p className="mt-2 text-[15px] leading-[1.45] text-ink-2">{item.a}</p>
              </details>
            ))}
          </div>
        </section>

        <section className="mx-auto mt-16 w-full max-w-[1120px] px-5">
          <div className="max-w-[420px]">
            <p className="flex items-baseline gap-3">
              <span className="text-[56px] leading-none tracking-[-0.03em] tabular-nums">{price}</span>
              <span className="text-[15px] text-ink-2">one-time · no subscription</span>
            </p>
            <TrackedLink cta="footer_start" href="/start" className="btn btn-arrow mt-5">
              Start
              <span className="btn-arrow-dot">
                <ArrowRight size={18} />
              </span>
            </TrackedLink>
          </div>
        </section>
      </main>
      <SiteFooter />
      <ConsentBanner />
    </>
  );
}
