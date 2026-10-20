"use client";

import { useId, useRef, useState } from "react";

export type AreaCard = { id: string; title: string; evidence: string; effort: string; cost: string; when: string; source: string };
export type AreaTab = { id: string; label: string; cards: AreaCard[] };

/** One tab per face area; each panel shows real recommendations from the report library. */
export function AreaTabs({ areas }: { areas: AreaTab[] }) {
  const [active, setActive] = useState(0);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const base = useId();
  const area = areas[active];

  function move(next: number) {
    const index = (next + areas.length) % areas.length;
    setActive(index);
    tabs.current[index]?.focus();
  }

  if (!area) return null;

  return (
    <div>
      {/* The strip scrolls sideways on phones: its right edge fades so the cut-off tab reads as "more". */}
      <div className="overflow-x-auto px-4 pb-1 [mask-image:linear-gradient(90deg,#000_calc(100%-48px),transparent)] [scrollbar-width:none] min-[768px]:px-8 min-[1100px]:[mask-image:none] [&::-webkit-scrollbar]:hidden">
        <div role="tablist" aria-label="Areas" className="inline-flex gap-1 rounded-full p-1 shadow-[inset_0_0_0_1px_var(--color-rule)]">
          {areas.map((item, index) => (
            <button
              key={item.id}
              ref={(element) => {
                tabs.current[index] = element;
              }}
              type="button"
              role="tab"
              id={`${base}-tab-${item.id}`}
              aria-selected={index === active}
              aria-controls={`${base}-panel`}
              tabIndex={index === active ? 0 : -1}
              onClick={() => setActive(index)}
              onKeyDown={(event) => {
                if (event.key === "ArrowRight") move(index + 1);
                if (event.key === "ArrowLeft") move(index - 1);
                if (event.key === "Home") move(0);
                if (event.key === "End") move(areas.length - 1);
              }}
              className={`min-h-11 whitespace-nowrap rounded-full px-4 text-[15px] transition-colors duration-200 ${
                index === active ? "bg-btn text-on-btn" : "text-ink-2 hover:text-ink"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>
      <div
        role="tabpanel"
        id={`${base}-panel`}
        aria-labelledby={`${base}-tab-${area.id}`}
        tabIndex={0}
        className="mt-6 grid gap-3 border-t border-rule p-3 min-[768px]:grid-cols-2 min-[768px]:p-4 min-[1100px]:grid-cols-4"
      >
        {area.cards.map((card) => (
          <article
            key={card.id}
            className="flex min-h-[190px] flex-col rounded-[16px] bg-raised p-5 shadow-[inset_0_0_0_1px_var(--color-rule)] min-[1100px]:min-h-[260px]"
          >
            <span className="ev mono self-start">{card.evidence}</span>
            <h3 className="t-card mt-4">{card.title}</h3>
            <p className="mono mt-3 text-ink-2">
              {card.effort} effort · {card.cost} · {card.when}
            </p>
            <p className="mt-auto pt-6 text-[15px] leading-[1.4] text-ink-2">{card.source}</p>
          </article>
        ))}
      </div>
    </div>
  );
}
