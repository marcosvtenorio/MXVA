import { ChevronDown } from "@/components/common/icons";
import { TYPICAL_DELIVERY } from "@/lib/config";

const QUESTIONS: readonly (readonly [string, string])[] = [
  ["When do I get my report?", `By email, ${TYPICAL_DELIVERY} after you pay. You don't need to keep this page open.`],
  ["Is this a subscription?", "No. You pay once for one report. Nothing renews and there's nothing to cancel."],
  [
    "What if something goes wrong?",
    "If your report can't be made, we email you a link to try again at no cost, or you get a full refund. You never pay twice.",
  ],
  ["What happens to my photo?", "It's used only to make your report and isn't kept after it. Your report lives in your inbox, not on our servers."],
];

/** The questions people ask right before paying, answered in one line each. */
export function CheckoutFaq() {
  return (
    <section aria-labelledby="faq-heading" className="mt-8">
      <h2 id="faq-heading" className="mono text-ink-2">Questions</h2>
      <div className="mt-2 divide-y divide-rule border-y border-rule">
        {QUESTIONS.map(([question, answer]) => (
          <details key={question} className="group">
            <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 py-3 text-[15px] font-semibold [&::-webkit-details-marker]:hidden">
              {question}
              <ChevronDown size={18} className="flex-none text-ink-2 transition-transform group-open:rotate-180" />
            </summary>
            <p className="pb-3.5 pr-8 text-[15px] leading-[1.45] text-ink-2">{answer}</p>
          </details>
        ))}
      </div>
    </section>
  );
}
