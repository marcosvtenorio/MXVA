"use client";

import { Tick } from "@/components/common/icons";
import type { OptionCopy } from "@/features/onboarding/steps";

/** Single choice as native radios styled as option cards. */
export function ChoiceCards<T extends string>({
  name,
  legend,
  options,
  value,
  onChange,
  describedBy,
}: {
  name: string;
  legend: string;
  options: readonly OptionCopy<T>[];
  value: T | undefined;
  onChange: (value: T) => void;
  describedBy?: string;
}) {
  return (
    <fieldset className="grid gap-2.5" aria-describedby={describedBy}>
      <legend className="sr-only">{legend}</legend>
      {options.map((option) => (
        <label key={option.id} className="option">
          <span className="grid gap-0.5">
            <span className="text-[17px] font-semibold leading-snug">{option.label}</span>
            {option.hint ? <span className="text-[13px] text-ink-2">{option.hint}</span> : null}
          </span>
          <input
            type="radio"
            className="sr-only"
            name={name}
            value={option.id}
            checked={value === option.id}
            onChange={() => onChange(option.id)}
          />
          <span className="dot" aria-hidden="true" />
        </label>
      ))}
    </fieldset>
  );
}

/**
 * Multi choice as native checkboxes styled as chips. "none" (when present) is
 * exclusive; `max` disables further choices once reached.
 */
export function ChoiceChips<T extends string>({
  legend,
  options,
  values,
  onChange,
  max,
  describedBy,
}: {
  legend: string;
  options: readonly OptionCopy<T>[];
  values: readonly T[];
  onChange: (values: T[]) => void;
  max?: number;
  describedBy?: string;
}) {
  const toggle = (id: T) => {
    if (values.includes(id)) return onChange(values.filter((value) => value !== id));
    if (id === ("none" as T)) return onChange([id]);
    const next = values.filter((value) => value !== ("none" as T));
    if (max && next.length >= max) return;
    onChange([...next, id]);
  };
  const atMax = max !== undefined && values.length >= max;
  return (
    <fieldset className="flex flex-wrap gap-2.5" aria-describedby={describedBy}>
      <legend className="sr-only">{legend}</legend>
      {options.map((option) => {
        const checked = values.includes(option.id);
        return (
          <label key={option.id} className="chip">
            <input
              type="checkbox"
              className="sr-only"
              checked={checked}
              disabled={!checked && atMax}
              onChange={() => toggle(option.id)}
            />
            {checked ? <Tick size={16} /> : null}
            {option.label}
          </label>
        );
      })}
    </fieldset>
  );
}
