import type { Metadata } from "next";
import { ProsePage } from "@/components/common/ProsePage";
import { publicConfig } from "@/lib/config";
import { supportEmail } from "@/server/config";

export const metadata: Metadata = { title: "Privacy Policy" };

export default function PrivacyPage() {
  const brand = publicConfig.brandName;
  const email = supportEmail();
  return (
    <ProsePage title="Privacy Policy." tail="What happens to your photos and data." updated="Last updated 11 Oct 2026 · draft pending legal review">
      <h2>Your photos</h2>
      <ul>
        <li>Before you pay, your photos stay in your browser tab. They are not uploaded, and they are not saved to cookies, local storage or any other browser storage. Reloading or closing the tab clears them.</li>
        <li>After payment, your photos are transmitted temporarily to {brand}&apos;s server and to the AI providers we use, only to create the report you bought.</li>
        <li>No raw photo is intentionally written to storage controlled by {brand}. Photos are processed in memory and discarded when your report is done.</li>
        <li>Our AI and email providers process data under their own terms, including their own safety review and retention schedules. We choose providers and settings that limit retention where they offer it, but their retention is outside our direct control.</li>
        <li>We don&apos;t create face embeddings, facial-recognition templates or any biometric identifier. A person can still be identifiable from a face photo, so we treat your photos as sensitive.</li>
      </ul>
      <h2>Your report</h2>
      <ul>
        <li>Your report is emailed to you as a PDF attachment. It shows your front photo next to your AI concept image (before and after), and your roadmap. Our email provider handles that message and its attachment to deliver it.</li>
        <li>Once delivered, the email and PDF stay in your mailbox until you delete them. That is outside our control.</li>
        <li>The results page shows your report only while the tab is open. We don&apos;t keep a copy or a link to it.</li>
      </ul>
      <h2>What we keep</h2>
      <ul>
        <li>Order metadata: your email address, payment and delivery status, the consent and terms versions you accepted, a coarse country hint, and timestamps. We keep it for support, refunds, disputes and accounting.</li>
        <li>We never store your photos, generated portraits, face descriptions or your survey answers with your order.</li>
        <li>Your survey choices (not photos, email or notes) may be kept in your browser tab for up to two hours so a reload doesn&apos;t lose your progress.</li>
      </ul>
      <h2>Analytics and cookies</h2>
      <ul>
        <li>Without your OK, we count visits and funnel steps anonymously, without cookies or ad identifiers.</li>
        <li>With your OK, we use a session identifier for steadier statistics, and we measure our Meta ads through Meta&apos;s Conversions API with cookies Meta can read. You can change this choice at any time by clearing cookies for this site.</li>
        <li>We never send photos, answers about your appearance, report contents or filenames to analytics or advertising providers.</li>
      </ul>
      <h2>Your rights</h2>
      <p>
        You can ask us to access, correct or delete the order data we hold, or withdraw consent before processing starts. Write to{" "}
        <a href={`mailto:${email}`}>{email}</a>. Depending on where you live, laws such as the GDPR (EU/UK) or LGPD (Brazil) give you
        these rights; this policy is pending review by counsel for each market.
      </p>
      <h2>Adults only</h2>
      <p>{brand} is only for people aged 18 or over. Don&apos;t upload photos of anyone else.</p>
    </ProsePage>
  );
}
