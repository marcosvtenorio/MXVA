"use client";

/**
 * Next keeps recently visited pages in the DOM (hidden), so several `#main` elements can exist
 * and the plain anchor may land on a hidden one. Focus the main that is on screen instead.
 */
export function SkipLink() {
  return (
    <a
      href="#main"
      className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 pill-link"
      onClick={(event) => {
        const main = Array.from(document.querySelectorAll<HTMLElement>("main")).find((element) => element.getClientRects().length > 0);
        if (!main) return;
        event.preventDefault();
        if (!main.hasAttribute("tabindex")) main.setAttribute("tabindex", "-1");
        main.focus();
        main.scrollIntoView({ block: "start" });
      }}
    >
      Skip to content
    </a>
  );
}
