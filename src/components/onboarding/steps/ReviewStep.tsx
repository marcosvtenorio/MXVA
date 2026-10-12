"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Tick } from "@/components/common/icons";
import { track } from "@/features/analytics/client";
import { useDisplayPrice } from "@/features/checkout/use-offers";
import { AVOID_OPTIONS_COPY, type OptionCopy } from "@/features/onboarding/steps";
import { useOnboardingStore } from "@/features/onboarding/store";
import { useStepNav } from "@/features/onboarding/use-flow";
import { usePhotoStore } from "@/features/photos/memory-store";
import { OnboardingFrame } from "../OnboardingFrame";
import { StepHeading } from "../StepHeading";
import { StepActions } from "./StepBody";

function labels<T extends string>(options: readonly OptionCopy<T>[], ids: readonly T[]): string {
  return ids.map((id) => options.find((option) => option.id === id)?.label ?? id).join(", ");
}

function Row({ title, value, href }: { title: string; value: string; href: string }) {
  return (
    <div className="grid grid-cols-[1fr_auto] items-start gap-x-4 gap-y-1 border-t border-rule py-3.5">
      <dt className="mono pt-0.5 text-ink-2">{title}</dt>
      <dd className="row-start-2 text-[16px] leading-snug">{value || "—"}</dd>
      <Link href={href} className="row-span-2 self-center text-[15px] font-semibold underline-offset-2 hover:underline" aria-label={`Edit ${title.toLowerCase()}`}>
        Edit
      </Link>
    </div>
  );
}

export function ReviewStep() {
  const nav = useStepNav("review");
  const router = useRouter();
  const state = useOnboardingStore();
  const front = usePhotoStore((s) => s.photos.front);
  const profiles = usePhotoStore((s) => Number(Boolean(s.photos.left)) + Number(Boolean(s.photos.right)));
  const price = useDisplayPrice();
  const [busy, setBusy] = useState(false);

  const avoid = labels(AVOID_OPTIONS_COPY, state.constraints.avoid.filter((value) => value !== "none"));

  // The order (and its Pix code or card session) is created at checkout, once the method is chosen.
  function continueToCheckout() {
    setBusy(true);
    track("cta_clicked", { cta: "continue_to_checkout" });
    track("onboarding_step_completed", { step: "review" });
    router.push("/checkout");
  }

  return (
    <OnboardingFrame
      step="review"
      onBack={nav.goBack}
      action={<StepActions continueLabel={busy ? "Opening checkout…" : "Continue to checkout"} busy={busy} onContinue={continueToCheckout} />}
    >
      <div className="px-5 pb-2 pt-6">
        <StepHeading size="title" tail="Nothing is analyzed until you pay.">
          Check everything before checkout.
        </StepHeading>

        <div className="mt-6 flex items-center gap-4 rounded-[20px] bg-raised p-3 shadow-[inset_0_0_0_1px_var(--color-rule)]">
          {front ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={front.previewUrl} alt="" className="h-16 w-16 flex-none rounded-[14px] object-cover" />
          ) : null}
          <div>
            <p className="flex items-center gap-1.5 text-[16px] font-semibold">
              <Tick size={16} className="text-positive" /> Front photo ready
            </p>
            <p className="text-[13px] text-ink-2">
              {profiles === 0 ? "No profile photos (optional)" : `${profiles} profile photo${profiles > 1 ? "s" : ""}`} · in this tab only
            </p>
          </div>
        </div>

        <dl className="mt-5">
          <Row title="Your plan covers" value="Everything your photo shows: hair, skin, brows, facial hair, eyes, smile and jawline" href="/onboarding/photos" />
          <Row title="Avoid" value={avoid || "Nothing"} href="/onboarding/constraints" />
          <Row title="Report goes to" value={state.email} href="/onboarding/delivery" />
        </dl>

        <div className="mt-6 border-t border-rule pt-5">
          <p className="mono text-ink-2">Included</p>
          <ul className="mt-3 grid gap-2 text-[15px] leading-[1.4]">
            <li className="flex gap-2"><Tick size={16} className="mt-0.5 flex-none text-ink-2" />An AI concept portrait from your own front photo</li>
            <li className="flex gap-2"><Tick size={16} className="mt-0.5 flex-none text-ink-2" />A PDF roadmap: 5 to 8 priorities, a 7, 30 and 90-day plan, every source</li>
            <li className="flex gap-2"><Tick size={16} className="mt-0.5 flex-none text-ink-2" />Delivered by email. The email is your permanent copy.</li>
          </ul>
          <p className="mt-4 flex items-baseline gap-3">
            <span className="text-[40px] leading-none tracking-[-0.03em] tabular-nums">{price}</span>
            <span className="text-[15px] text-ink-2">one-time · no subscription</span>
          </p>
          <p className="mt-3 text-[13px] leading-[1.4] text-ink-2">
            We don&apos;t keep your photos. They stay in this tab until payment, then go to our server and AI providers only to make your report.
          </p>
        </div>
      </div>
    </OnboardingFrame>
  );
}
