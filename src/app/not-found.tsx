import Link from "next/link";
import { CropMarks } from "@/components/common/StudioArt";

export default function NotFound() {
  return (
    <main id="main" className="washed flex min-h-dvh flex-col justify-end px-5 pb-[max(24px,env(safe-area-inset-bottom))]">
      <div className="mx-auto w-full max-w-[480px]">
        <div className="stage stage-off h-56" aria-hidden="true">
          <CropMarks />
          <div className="readouts mono text-[#EEF2F3]">
            <span>Light · off</span>
          </div>
        </div>
        <h1 className="title-28 two-tone mt-6">
          Nothing here. <span>The page moved or never existed.</span>
        </h1>
        <Link href="/" className="btn mt-6">
          Home
        </Link>
      </div>
    </main>
  );
}
