import Link from "next/link";
import { publicConfig } from "@/lib/config";

export function SiteHeader({ action }: { action?: React.ReactNode }) {
  return (
    <header className="flex min-h-16 items-center justify-between px-5 pb-3.5 pt-[max(10px,env(safe-area-inset-top))]">
      <Link href="/" className="text-[17px] font-semibold tracking-[0.14em]" aria-label={`${publicConfig.brandName} home`}>
        {publicConfig.brandName}
      </Link>
      {action}
    </header>
  );
}
