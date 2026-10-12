import type { Metadata } from "next";
import { ResultView } from "@/components/results/ResultView";

export const metadata: Metadata = { title: "Your concept and plan", robots: { index: false, follow: false } };

export default function ResultPage() {
  return <ResultView />;
}
