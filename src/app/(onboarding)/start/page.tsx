import type { Metadata } from "next";
import { StartStep } from "@/components/onboarding/steps/StartStep";

export const metadata: Metadata = { title: "Start", robots: { index: false, follow: false } };

export default function StartPage() {
  return <StartStep />;
}
