import Link from "next/link";
import { publicConfig } from "@/lib/config";

export function SiteFooter() {
  return (
    <footer className="mx-auto w-full max-w-[1120px] px-5 pb-[max(32px,env(safe-area-inset-bottom))] pt-14">
      <div className="flex flex-wrap items-baseline justify-between gap-4 border-t border-rule pt-6">
        <span className="text-[15px] font-semibold tracking-[0.14em]">{publicConfig.brandName}</span>
        <nav aria-label="Footer" className="mono flex flex-wrap gap-x-6 text-ink-2 [&>a]:inline-flex [&>a]:min-h-11 [&>a]:items-center">
          <Link href="/sample-report">Sample report</Link>
          <Link href="/help">Help</Link>
          <Link href="/privacy">Privacy</Link>
          <Link href="/terms">Terms</Link>
          <Link href="/refunds">Refunds</Link>
        </nav>
      </div>
      <p className="mt-4 max-w-[620px] text-[15px] leading-[1.45] text-ink-2">
        {publicConfig.brandName} gives grooming and presentation guidance for adults. It is not medical, dermatological or dental advice.
      </p>
    </footer>
  );
}
