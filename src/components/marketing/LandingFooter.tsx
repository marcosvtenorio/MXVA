import Link from "next/link";
import { publicConfig } from "@/lib/config";

const COLUMNS = [
  { title: "Product", links: [{ href: "/start", label: "Start" }, { href: "/sample-report", label: "Sample report" }] },
  { title: "Help", links: [{ href: "/help", label: "Help" }, { href: "/refunds", label: "Refunds" }] },
  { title: "Legal", links: [{ href: "/privacy", label: "Privacy" }, { href: "/terms", label: "Terms" }] },
];

/** The landing page footer: link columns over an oversized wordmark, inside the framed column. */
export function LandingFooter() {
  return (
    <footer className="frame overflow-hidden border-t border-rule">
      <div className="grid gap-8 px-4 pb-6 pt-10 min-[768px]:grid-cols-4 min-[768px]:px-8">
        {COLUMNS.map((column) => (
          <nav key={column.title} aria-label={column.title}>
            <p className="mono text-ink-2">{column.title}</p>
            <ul className="mt-3 grid gap-2 text-[15px]">
              {column.links.map((link) => (
                <li key={link.href}>
                  <Link href={link.href}>{link.label}</Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}
        <p className="text-[13px] leading-[1.45] text-ink-2">
          {publicConfig.brandName} gives grooming and presentation guidance for adults. It is not medical, dermatological or dental advice.
        </p>
      </div>
      {/* Decorative wordmark, drawn as SVG so it scales to the column and isn't read as body text. */}
      <svg
        aria-hidden="true"
        focusable="false"
        viewBox="0 0 1000 230"
        className="block w-full select-none px-3 pb-[max(12px,env(safe-area-inset-bottom))] text-wash"
      >
        <text x="500" y="222" textAnchor="middle" textLength="980" lengthAdjust="spacingAndGlyphs" fontSize="290" fontWeight="600" fill="currentColor">
          {publicConfig.brandName}
        </text>
      </svg>
    </footer>
  );
}
