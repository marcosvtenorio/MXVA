import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { StepRouter } from "@/components/onboarding/StepRouter";
import { ONBOARDING_SLUGS, stepFromSlug } from "@/features/onboarding/navigation";

export function generateStaticParams() {
  return ONBOARDING_SLUGS.map((step) => ({ step }));
}

export async function generateMetadata({ params }: PageProps<"/onboarding/[step]">): Promise<Metadata> {
  const { step } = await params;
  const definition = stepFromSlug(step);
  return { title: definition ? `${definition.short} · Step ${definition.number} of 16` : "Not found", robots: { index: false, follow: false } };
}

export default async function OnboardingStepPage({ params }: PageProps<"/onboarding/[step]">) {
  const { step } = await params;
  const definition = stepFromSlug(step);
  if (!definition || definition.id === "start") notFound();
  return <StepRouter step={definition.id} />;
}
