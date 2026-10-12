import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { StepRouter } from "@/components/onboarding/StepRouter";
import { ONBOARDING_SLUGS, stepFromSlug } from "@/features/onboarding/navigation";
import { TOTAL_STEPS } from "@/features/onboarding/steps";

export function generateStaticParams() {
  return ONBOARDING_SLUGS.map((step) => ({ step }));
}

export async function generateMetadata({ params }: PageProps<"/onboarding/[step]">): Promise<Metadata> {
  const { step } = await params;
  const definition = stepFromSlug(step);
  return { title: definition ? `${definition.short} · Step ${definition.number} of ${TOTAL_STEPS}` : "Not found", robots: { index: false, follow: false } };
}

async function Step({ params }: Pick<PageProps<"/onboarding/[step]">, "params">) {
  const { step } = await params;
  const definition = stepFromSlug(step);
  if (!definition || definition.id === "start") notFound();
  return <StepRouter step={definition.id} />;
}

// Params are read inside Suspense so navigations between steps stay instant.
export default function OnboardingStepPage({ params }: PageProps<"/onboarding/[step]">) {
  return (
    <Suspense fallback={<div className="washed min-h-dvh" aria-busy="true" />}>
      <Step params={params} />
    </Suspense>
  );
}
