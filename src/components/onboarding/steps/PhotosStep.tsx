"use client";

import Link from "next/link";
import { InlineError } from "@/components/common/InlineError";
import { PhotoCapture } from "@/components/photos/PhotoCapture";
import { PHOTO_REQUIREMENTS, REFRESH_LOSS_NOTICE } from "@/features/onboarding/steps";
import { useOnboardingStore } from "@/features/onboarding/store";
import { frontPhotoReady, usePhotoStore } from "@/features/photos/memory-store";
import { EXAMPLE_BEFORE } from "@/lib/examples";
import { useStepNav } from "@/features/onboarding/use-flow";
import { OnboardingFrame, StepStage } from "../OnboardingFrame";
import { StepHeading } from "../StepHeading";
import { StepActions } from "./StepBody";

/** The four things that make a good front photo. `id` keeps the two copies (form, side column) apart. */
function PhotoGuide({ id, className = "" }: { id: string; className?: string }) {
  return (
    <section aria-labelledby={id} className={className}>
      <h2 id={id} className="mono text-ink-2">
        For a good photo
      </h2>
      <ol className="mt-3 grid gap-3">
        {PHOTO_REQUIREMENTS.map((requirement, index) => (
          <li key={requirement.title} className="grid grid-cols-[32px_1fr] gap-x-1">
            <span className="mono pt-1 text-ink-2">{String(index + 1).padStart(2, "0")}</span>
            <span className="text-[15px] font-semibold leading-snug">{requirement.title}</span>
            <span className="col-start-2 text-[15px] leading-[1.4] text-ink-2">{requirement.detail}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

/**
 * The side column from 1100px: the example good photo with the guide under it. Once the
 * buyer's own photo is in, the example steps back to a thumbnail.
 */
function PhotoGuideStage() {
  const hasPhoto = usePhotoStore((state) => Boolean(state.photos.front));
  return (
    <div>
      {hasPhoto ? (
        <figure className="flex items-end gap-4">
          <div className="stage aspect-[3/4] w-[200px] flex-none rounded-[20px]!" aria-hidden="true">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={EXAMPLE_BEFORE} alt="" className="absolute inset-0 h-full w-full object-cover" />
            <span className="capsule frost mono absolute bottom-3 left-3">Example</span>
          </div>
          <figcaption className="mono pb-1 text-ink-2">A good photo · fictional AI-generated person</figcaption>
        </figure>
      ) : (
        <StepStage
          src={EXAMPLE_BEFORE}
          readouts={["Eye level", "Arm's length", "Window light"]}
          caption="A good photo · fictional AI-generated person"
          className="h-[440px]"
        />
      )}
      <PhotoGuide id="photo-guide-side" className="mt-6" />
    </div>
  );
}

/** The first intake screen: the photo guide, the photo, and the 18+ confirmation (its checkbox). */
export function PhotosStep() {
  const nav = useStepNav("photos");
  const cleared = usePhotoStore((state) => state.clearedNotice);
  const hasPhoto = usePhotoStore((state) => Boolean(state.photos.front));
  // Looks inactive until the photo passes its checks and the 18+ box is ticked. Still tappable:
  // a tap says what is missing.
  const ready = usePhotoStore((state) => frontPhotoReady(state) && state.ownershipConfirmed);
  const ageRefused = useOnboardingStore((state) => state.ageRefused);
  const set = useOnboardingStore((state) => state.set);

  if (ageRefused) {
    return (
      <OnboardingFrame step="photos" onBack={nav.goBack} action={<Link href="/" className="btn btn-secondary">Back to home</Link>}>
        <div className="flex flex-1 flex-col px-5 pb-2 pt-8 min-[768px]:pt-12">
          <StepHeading tail="We can't create a report for anyone under 18.">MXVA is for adults only.</StepHeading>
          <p className="mt-4 text-[15px] leading-[1.4] text-ink-2">
            Nothing you entered was sent or kept. If you selected this by mistake, close this tab and open MXVA again.
          </p>
        </div>
      </OnboardingFrame>
    );
  }

  // Under the button, so on a computer the button stays on the first screen.
  const privacy = (
    <p className="text-[15px] leading-[1.4] text-ink-2">
      {nav.definition.description.replace(" Privacy Policy.", "")}{" "}
      <Link href="/privacy" target="_blank" className="underline underline-offset-2">
        Privacy Policy
      </Link>
      . {REFRESH_LOSS_NOTICE}
    </p>
  );

  function next() {
    // "These are photos of me, and I'm 18 or older" is the age confirmation the order needs.
    if (nav.goNext()) set({ adultConfirmed: true, photoGuideAcknowledged: true });
  }

  return (
    <OnboardingFrame
      step="photos"
      onBack={nav.goBack}
      action={
        <StepActions continueLabel={hasPhoto ? "Use these photos" : "Add a front photo"} inactive={!ready} busy={nav.pending} onContinue={next} />
      }
      stage={<PhotoGuideStage />}
      footnote={privacy}
    >
      <div className="px-5 pb-2 pt-8 min-[768px]:pt-12">
        <StepHeading tail="Side photos are optional.">{nav.definition.heading}.</StepHeading>
        <p className="mt-2 text-[15px] leading-[1.4] text-ink-2">Used temporarily to create your report.</p>
        {cleared ? (
          <p role="status" className="mt-4 rounded-[14px] bg-raised p-3.5 text-[15px] leading-[1.4] shadow-[inset_0_0_0_1px_var(--color-rule)]">
            Your photos were cleared when the page reloaded. Add them again. Your other answers are still here.
          </p>
        ) : null}
        <div className="mt-5">
          <PhotoCapture />
        </div>
        <InlineError id="photos-error">{nav.error}</InlineError>

        {/* From 1100px the guide sits beside the form, under the example. */}
        <PhotoGuide id="photo-guide" className="mt-6 border-t border-rule pt-4 min-[1100px]:hidden" />

      </div>
    </OnboardingFrame>
  );
}
