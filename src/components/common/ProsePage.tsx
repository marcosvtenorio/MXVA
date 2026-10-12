import { SiteHeader } from "./SiteHeader";
import { SiteFooter } from "@/components/marketing/SiteFooter";

/** Shared layout for help and policy pages: one readable column, studio type. */
export function ProsePage({
  title,
  tail,
  updated,
  children,
}: {
  title: string;
  tail?: string;
  updated?: string;
  children: React.ReactNode;
}) {
  return (
    <>
      <div className="mx-auto w-full max-w-[1120px]">
        <SiteHeader />
      </div>
      <main id="main" className="mx-auto w-full max-w-[680px] px-5 pt-6">
        <h1 className="display two-tone">
          {title}
          {tail ? <span> {tail}</span> : null}
        </h1>
        {updated ? <p className="mono mt-4 text-ink-2">{updated}</p> : null}
        <div className="prose-studio mt-8">{children}</div>
      </main>
      <SiteFooter />
    </>
  );
}
