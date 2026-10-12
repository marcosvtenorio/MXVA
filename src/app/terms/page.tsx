import type { Metadata } from "next";
import Link from "next/link";
import { ProsePage } from "@/components/common/ProsePage";
import { publicConfig } from "@/lib/config";
import { supportEmail } from "@/server/config";

export const metadata: Metadata = { title: "Terms" };

export default function TermsPage() {
  const brand = publicConfig.brandName;
  return (
    <ProsePage title="Terms." tail="The short version first." updated="Last updated 11 Oct 2026 · draft pending legal review">
      <ul>
        <li>{brand} is for adults aged 18 or over, using photos of themselves only.</li>
        <li>You buy one report for a one-time price. There is no subscription.</li>
        <li>The AI concept image is an illustration, not a prediction or guarantee. Results depend on individual factors and your choices.</li>
        <li>{brand} gives grooming and presentation guidance. It is not medical, dermatological or dental advice and it doesn&apos;t diagnose anything. Consider consulting a qualified professional about health concerns.</li>
      </ul>
      <h2>Your use</h2>
      <p>You confirm that the photos are of you and that you have the right to use them. You won&apos;t use {brand} to create sexualized, harassing or misleading images, or images of other people.</p>
      <h2>Delivery</h2>
      <p>We create your report after payment and email it as a PDF. If we can&apos;t create or deliver it, you can retry without paying again, or ask for a refund under our <Link href="/refunds">Refund Policy</Link>.</p>
      <h2>Contact</h2>
      <p>
        <a href={`mailto:${supportEmail()}`}>{supportEmail()}</a>
      </p>
    </ProsePage>
  );
}
