import type { Metadata } from "next";
import { ConsentBanner } from "@/components/common/ConsentBanner";
import { ArrowRight } from "@/components/common/icons";
import { CropMarks, PlasterHead } from "@/components/common/StudioArt";
import { SiteHeader } from "@/components/common/SiteHeader";
import { SiteFooter } from "@/components/marketing/SiteFooter";
import { TrackedLink } from "@/components/marketing/TrackedLink";
import { LIBRARY } from "@/features/report/library";
import { getSource } from "@/features/report/references";
import { CONCEPT_LABEL } from "@/features/report/schema";

export const metadata: Metadata = {
  title: "Sample report",
  description: "A generic, non-personalized excerpt of an MXVA report: what the concept image and the roadmap look like.",
};

const SAMPLE_IDS = ["skin-daily-spf", "brows-clean-strays", "jaw-camera-distance"] as const;
const EVIDENCE = { established: "Established", limited: "Limited evidence", styling_opinion: "Styling opinion" } as const;

export default function SampleReportPage() {
  const sample = SAMPLE_IDS.map((id) => LIBRARY.find((template) => template.id === id)!);
  const sources = [...new Set(sample.flatMap((template) => template.sourceIds))].map(getSource);
  return (
    <>
      <div className="mx-auto w-full max-w-[1120px]">
        <SiteHeader />
      </div>
      <main id="main" className="mx-auto w-full max-w-[680px] px-5 pt-4">
        <p className="mono text-ink-2">Sample · not personalized</p>
        <h1 className="display two-tone mt-3">
          A sample report. <span>Yours is made from your photo.</span>
        </h1>
        <div className="stage mt-6 h-[360px]">
          <PlasterHead className="absolute inset-x-0 bottom-0 h-[86%] w-full" />
          <CropMarks />
          <span className="capsule frost mono absolute left-4 top-4">{CONCEPT_LABEL}</span>
          <span className="capsule frost mono absolute bottom-12 left-4">Light test · a real report shows your own face</span>
        </div>
        <p className="mt-4 text-[15px] leading-[1.45] text-ink-2">
          Every report opens with your AI glow-up concept: your own front photo, upgraded where it shows room to grow, such as the haircut,
          skin, brows, beard and lighting. Then come 5 to 10 priorities like these, ranked by how well they fit your face, the strength of the
          evidence, the effort and the cost.
        </p>
        <ol className="mt-6 grid gap-5">
          {sample.map((template, index) => (
            <li key={template.id} className="border-t border-rule pt-4">
              <span className="ev mono">{EVIDENCE[template.evidenceLevel]}</span>
              <p className="mt-2 text-[17px] font-semibold">
                {String(index + 1).padStart(2, "0")} · {template.title}
              </p>
              <p className="mt-1.5 text-[15px] leading-[1.45]">{template.suggestion}</p>
              <p className="mt-1.5 text-[15px] leading-[1.45] text-ink-2">Why: {template.reason}</p>
            </li>
          ))}
        </ol>
        <div className="mt-8 border-t border-rule pt-5">
          <h2 className="mono text-ink-2">Sources in this sample</h2>
          <ol className="mt-3 grid gap-3 text-[13px] leading-[1.4]">
            {sources.map((source) => (
              <li key={source.id}>
                <a href={source.url} target="_blank" rel="noopener noreferrer" className="font-semibold underline underline-offset-2">
                  {source.title}
                </a>
                <span className="block text-ink-2">
                  {source.publisher}. {source.dateLabel}.
                </span>
              </li>
            ))}
          </ol>
        </div>
        <div className="mt-10 max-w-[420px]">
          <TrackedLink cta="hero_start" href="/start" className="btn btn-arrow">
            Start my report
            <span className="btn-arrow-dot">
              <ArrowRight size={18} />
            </span>
          </TrackedLink>
        </div>
      </main>
      <SiteFooter />
      <ConsentBanner />
    </>
  );
}
