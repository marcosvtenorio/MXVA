import type { Metadata } from "next";
import Link from "next/link";
import { ProsePage } from "@/components/common/ProsePage";
import { supportEmail } from "@/server/config";

export const metadata: Metadata = { title: "Help" };

export default function HelpPage() {
  const email = supportEmail();
  return (
    <ProsePage title="Help." tail="Real people answer.">
      <p>
        Email <a href={`mailto:${email}`}>{email}</a> with the address you used at checkout. We never ask for your photos by email.
      </p>
      <h2>When does my report arrive?</h2>
      <p>After you pay and send your photo, your report waits its turn and is made on our server; the page tells you about how many minutes. It arrives by email, so you can close the page. If something goes wrong, we try again by ourselves, and if it still fails we email you a link to create it again. You won&apos;t pay twice.</p>
      <h2>My report didn&apos;t arrive</h2>
      <p>Check spam and promotions for “Your personalized looksmaxxing report is ready”. If it&apos;s lost, write to us. We don&apos;t keep your report, so we can&apos;t resend it. We&apos;ll offer a free redo (you add your photo again) or a refund.</p>
      <h2 id="expired-link">My “create it again” link doesn&apos;t work</h2>
      <p>The link in our email works for 7 days. If it has expired, write to us from the address you paid with and we&apos;ll send a new one or refund you. You won&apos;t pay twice.</p>
      <h2>The page asked me to add my photo again</h2>
      <p>Photos live only in your browser tab. If a payment page opened in between, or the tab reloaded, they were cleared. Add your front photo again on the same device. You won&apos;t pay twice.</p>
      <h2>Delete my data</h2>
      <p>Write to us from the email you used. We delete your order metadata unless the law requires us to keep it for accounting or a payment dispute. See the <Link href="/privacy">Privacy Policy</Link>.</p>
      <h2>Refunds</h2>
      <p>See the <Link href="/refunds">Refund Policy</Link>.</p>
    </ProsePage>
  );
}
