import type { Metadata } from "next";
import { ProsePage } from "@/components/common/ProsePage";
import { supportEmail } from "@/server/config";

export const metadata: Metadata = { title: "Refund Policy" };

export default function RefundsPage() {
  const email = supportEmail();
  return (
    <ProsePage title="Refunds." tail="No second charges, ever." updated="Last updated 11 Oct 2026 · draft pending legal review">
      <ul>
        <li><strong>We couldn&apos;t make or deliver your report:</strong> retry for free, or get a full refund.</li>
        <li><strong>Your payment went through but the page lost your photos:</strong> reselect them on the same device; you won&apos;t pay again.</li>
        <li><strong>You withdrew consent before processing started:</strong> full refund.</li>
        <li><strong>Anything else:</strong> write to us within 14 days of purchase and we&apos;ll look at it.</li>
      </ul>
      <p>
        Refund requests: <a href={`mailto:${email}`}>{email}</a>. Include the email address you used at checkout. Refunds go back to the
        original payment method; your bank decides how long that takes.
      </p>
    </ProsePage>
  );
}
