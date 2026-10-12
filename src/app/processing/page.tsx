import type { Metadata } from "next";
import { ProcessingView } from "@/components/results/ProcessingView";

export const metadata: Metadata = { title: "Creating your report", robots: { index: false, follow: false } };

export default function ProcessingPage() {
  return <ProcessingView />;
}
