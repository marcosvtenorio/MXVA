import { Alert } from "./icons";

/** Accessible, non-shaming validation message: icon + text, never colour alone. */
export function InlineError({ id, children }: { id: string; children?: React.ReactNode }) {
  if (!children) return null;
  return (
    <p id={id} role="alert" className="mt-3 flex items-start gap-2 text-[15px] leading-[1.4] text-negative">
      <Alert size={18} className="mt-px flex-none" />
      <span>{children}</span>
    </p>
  );
}
