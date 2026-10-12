"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Compare, Download, Tick } from "@/components/common/icons";
import { track } from "@/features/analytics/client";
import { usePhotoStore } from "@/features/photos/memory-store";
import { CONCEPT_LABEL, type PaidReport } from "@/features/report/schema";
import { useResultStore } from "@/features/results/memory-store";
import { api } from "@/lib/api-client";

const EVIDENCE = { established: "Established", limited: "Limited evidence", styling_opinion: "Styling opinion" } as const;
const COST = { free: "Free", low: "Low cost", medium: "Medium cost", professional: "Professional" } as const;
const HORIZON = { now: "Start now", "30d": "Within 30 days", "90d": "Within 90 days", professional: "Optional consult" } as const;

/** Today | Concept, registered in one frame; drag or use arrow keys to compare. */
function CompareHero({ conceptUrl, originalUrl }: { conceptUrl: string; originalUrl?: string }) {
  const [split, setSplit] = useState(50);
  const frame = useRef<HTMLDivElement>(null);

  function fromPointer(clientX: number) {
    const rect = frame.current?.getBoundingClientRect();
    if (!rect) return;
    setSplit(Math.min(100, Math.max(0, ((clientX - rect.left) / rect.width) * 100)));
  }

  return (
    <div
      ref={frame}
      className="stage key-light-on absolute inset-0 rounded-none"
      onPointerDown={(event) => {
        if (!originalUrl) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        fromPointer(event.clientX);
      }}
      onPointerMove={(event) => {
        if (originalUrl && event.buttons > 0) fromPointer(event.clientX);
      }}
      style={{ touchAction: originalUrl ? "pan-y" : undefined }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- in-memory object URL, never a stored file */}
      <img src={conceptUrl} alt="Your AI concept portrait" className="resolve absolute inset-0 h-full w-full object-cover" draggable={false} />
      {originalUrl ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={originalUrl}
            alt="Your original photo"
            className="absolute inset-0 h-full w-full object-cover"
            style={{ clipPath: `inset(0 ${100 - split}% 0 0)` }}
            draggable={false}
          />
          <div className="appear-late pointer-events-none absolute bottom-0 top-[calc(env(safe-area-inset-top)+56px)] w-px bg-white/90" style={{ left: `${split}%` }} />
          <div
            role="slider"
            tabIndex={0}
            aria-label="Compare today and concept"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(split)}
            aria-valuetext={`${Math.round(split)}% today`}
            onKeyDown={(event) => {
              if (event.key === "ArrowLeft") setSplit((value) => Math.max(0, value - 5));
              if (event.key === "ArrowRight") setSplit((value) => Math.min(100, value + 5));
            }}
            className="frost appear-late absolute top-[56%] grid h-11 w-11 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full"
            style={{ left: `${split}%` }}
          >
            <Compare size={20} />
          </div>
          <span className="capsule frost mono appear-late absolute bottom-11 left-4">Today</span>
          <span className="capsule frost mono appear-late absolute bottom-11 right-4">Concept</span>
        </>
      ) : null}
      <div className="readouts mono frost right-4 rounded-[14px] px-3 py-2.5" style={{ top: "calc(env(safe-area-inset-top) + 56px)" }}>
        <span className="settle grid gap-1.5">
          <span>Same face</span>
          <span>Same framing</span>
          <span>Key left</span>
        </span>
      </div>
      <span className="capsule frost mono absolute left-4" style={{ top: "calc(env(safe-area-inset-top) + 12px)" }}>
        {CONCEPT_LABEL}
      </span>
    </div>
  );
}

function Recommendations({ report }: { report: PaidReport }) {
  const sourceNumber = new Map(report.usedSources.map((source, index) => [source.id, index + 1]));
  return (
    <ol className="mt-4 grid gap-3">
      {report.recommendations.map((rec) => (
        <li key={rec.id} className="border-t border-rule pt-3">
          <details className="group">
            <summary className="grid cursor-pointer list-none gap-1.5 [&::-webkit-details-marker]:hidden">
              <span className="ev mono justify-self-start">{EVIDENCE[rec.evidenceLevel]}</span>
              <span className="flex items-start justify-between gap-3 text-[16px] font-semibold leading-snug">
                {rec.title}
                <span className="mono mt-1 flex-none text-ink-2 group-open:hidden">More</span>
                <span className="mono mt-1 hidden flex-none text-ink-2 group-open:inline">Less</span>
              </span>
            </summary>
            <div className="mt-2 grid gap-2 text-[15px] leading-[1.45]">
              <p className="mono text-ink-2">
                {rec.effort} effort · {COST[rec.costBand]} · {HORIZON[rec.horizon]}
              </p>
              <p>{rec.suggestion}</p>
              <p className="text-ink-2">
                <span className="text-ink">Why: </span>
                {rec.reason} {rec.sourceIds.map((id) => `[${sourceNumber.get(id)}]`).join(" ")}
              </p>
              <p className="text-ink-2">
                <span className="text-ink">Seen: </span>
                {rec.observation}
              </p>
              <p className="text-[13px] text-ink-2">{rec.uncertainty}</p>
            </div>
          </details>
        </li>
      ))}
    </ol>
  );
}

function Plan({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <h3 className="mono text-ink-2">{title}</h3>
      <ul className="mt-2 grid gap-1.5 text-[15px] leading-[1.4]">
        {items.map((item) => (
          <li key={item} className="flex gap-2">
            <span aria-hidden="true" className="text-ink-2">·</span>
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

function NoResult() {
  const [message, setMessage] = useState("Looking for your report…");
  useEffect(() => {
    api
      .currentOrder()
      .then(({ order }) =>
        setMessage(
          order.deliveredToEmail
            ? "Your report is in your email — it's your permanent copy. This page doesn't keep it after a reload."
            : "Your report isn't ready in this tab. Continue where you left off.",
        ),
      )
      .catch(() => setMessage("There's no report in this tab. If you bought one, check your email."));
  }, []);
  return (
    <div className="washed flex min-h-dvh flex-col justify-end px-5 pb-[max(24px,env(safe-area-inset-bottom))]">
      <main id="main" className="mx-auto w-full max-w-[480px]">
        <h1 className="title-28">Check your email</h1>
        <p className="mt-3 text-[15px] leading-[1.4] text-ink-2">{message}</p>
        <div className="mt-6 grid gap-3">
          <Link href="/processing" className="btn">Continue</Link>
          <Link href="/" className="btn btn-secondary">Home</Link>
        </div>
      </main>
    </div>
  );
}

/** The paid result, rendered from memory only. The emailed PDF is the durable copy. */
export function ResultView() {
  const router = useRouter();
  const { report, imageUrl, pdfUrl, pdfFilename, emailDelivered, clear } = useResultStore();
  const originalUrl = usePhotoStore((s) => s.photos.front?.previewUrl);
  const clearPhotos = usePhotoStore((s) => s.clearAll);
  const viewed = useRef(false);

  useEffect(() => {
    if (report && !viewed.current) {
      viewed.current = true;
      track("result_viewed", {});
      if (typeof navigator.vibrate === "function") navigator.vibrate(12);
    }
  }, [report]);

  if (!report || !imageUrl || !pdfUrl) return <NoResult />;

  const date = new Date(report.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

  return (
    <div className="flex min-h-dvh flex-col bg-raised">
      <div className="relative h-[60dvh] min-h-[340px]">
        <CompareHero conceptUrl={imageUrl} originalUrl={originalUrl} />
      </div>
      <div className="sheet flex-1">
        <div className="grabber" aria-hidden="true" />
        <main id="main" className="mx-auto w-full max-w-[480px] px-5 pb-[max(24px,calc(env(safe-area-inset-bottom)+12px))] pt-4">
          <h1 className="title-28">Your concept and plan</h1>
          <p className="mono mt-1.5 text-ink-2">
            {date} · {report.recommendations.length} priorities · {report.usedSources.length} sources
          </p>
          {report.simulated ? (
            <p className="mt-3 rounded-[12px] bg-chip-fill p-3 text-[13px] text-ink-2">Development preview: produced by simulated providers, not a real AI edit.</p>
          ) : null}

          <Recommendations report={report} />

          <div className="mt-8 grid gap-5 border-t border-rule pt-5">
            <Plan title="Your 7 days" items={report.sevenDayPlan} />
            <Plan title="Your 30 days" items={report.thirtyDayPlan} />
            <Plan title="Your 90 days" items={report.ninetyDayPlan} />
            <p className="text-[13px] leading-[1.4] text-ink-2">{report.budgetNote}</p>
          </div>

          {report.professionalQuestions?.length ? (
            <div className="mt-8 border-t border-rule pt-5">
              <h2 className="mono text-ink-2">If you see a professional</h2>
              <ul className="mt-2 grid gap-1.5 text-[15px] leading-[1.4]">
                {report.professionalQuestions.map((question) => (
                  <li key={question}>{question}</li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="mt-8 border-t border-rule pt-5">
            <h2 className="mono text-ink-2">Sources</h2>
            <ol className="mt-2 grid gap-3 text-[13px] leading-[1.4]">
              {report.usedSources.map((source, index) => (
                <li key={source.id}>
                  <a href={source.url} target="_blank" rel="noopener noreferrer" className="font-semibold underline underline-offset-2">
                    [{index + 1}] {source.title}
                  </a>
                  <span className="block text-ink-2">
                    {source.publisher}. {source.dateLabel}. {source.limitations}
                  </span>
                </li>
              ))}
            </ol>
          </div>


          <div className="mt-6 grid gap-3">
            <a href={pdfUrl} download={pdfFilename} className="btn" onClick={() => track("report_downloaded", {})}>
              <Download size={18} /> Download PDF
            </a>
            <p className="flex items-center justify-center gap-2 text-[13px] text-ink-2" role="status">
              {emailDelivered ? (
                <>
                  <Tick size={14} className="text-positive" /> Also sent to your email
                </>
              ) : (
                "The email didn't go out yet. Download your PDF now; we'll retry and support can resend it."
              )}
            </p>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => {
                track("results_cleared", {});
                clear();
                clearPhotos();
                router.push("/");
              }}
            >
              Clear from this device
            </button>
            <p className="text-center text-[13px] text-ink-2">
              This page clears when you close it. Your email holds the permanent copy. <Link href="/help" className="underline underline-offset-2">Help</Link>
            </p>
          </div>
        </main>
      </div>
    </div>
  );
}
