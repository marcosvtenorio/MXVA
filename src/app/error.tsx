"use client";

import Link from "next/link";
import { useEffect } from "react";
import { track } from "@/features/analytics/client";

/** Error boundary for every route. Logs only that an error happened, never its payload. */
export default function RouteError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    track("client_error", { code: "SERVICE_UNAVAILABLE" });
  }, []);
  return (
    <main id="main" className="washed flex min-h-dvh flex-col justify-end px-5 pb-[max(24px,env(safe-area-inset-bottom))]">
      <div className="mx-auto w-full max-w-[480px]">
        <h1 className="title-28 two-tone">
          Something broke on our side. <span>Nothing was charged twice.</span>
        </h1>
        <div className="mt-6 grid gap-3">
          <button type="button" className="btn" onClick={reset}>
            Try again
          </button>
          <Link href="/help" className="btn btn-secondary">
            Get help
          </Link>
        </div>
      </div>
    </main>
  );
}
