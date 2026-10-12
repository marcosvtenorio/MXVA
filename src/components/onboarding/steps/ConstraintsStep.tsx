"use client";

import "@/lib/zod-config";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, useWatch } from "react-hook-form";
import { z } from "zod";
import { CONSTRAINT_NOTE_MAX, noteSchema } from "@/features/onboarding/schema";
import { AVOID_OPTIONS_COPY, CONSTRAINT_NOTE_HINT, DAILY_MINUTES_OPTIONS } from "@/features/onboarding/steps";
import { useOnboardingStore } from "@/features/onboarding/store";
import { useStepNav } from "@/features/onboarding/use-flow";
import { OnboardingFrame } from "../OnboardingFrame";
import { ChoiceCards, ChoiceChips } from "../controls";
import { StepActions, StepBody } from "./StepBody";

const noteForm = z.object({ note: noteSchema.optional() });

export function ConstraintsStep() {
  const nav = useStepNav("constraints");
  const constraints = useOnboardingStore((state) => state.constraints);
  const setConstraints = useOnboardingStore((state) => state.setConstraints);
  const form = useForm<z.infer<typeof noteForm>>({
    resolver: zodResolver(noteForm),
    defaultValues: { note: constraints.note ?? "" },
  });
  const note = useWatch({ control: form.control, name: "note" }) ?? "";
  const noteError = form.formState.errors.note?.message;

  const submit = form.handleSubmit(({ note: value }) => {
    // The note stays in memory only; it is never written to browser storage.
    setConstraints({ note: value?.trim() ? value.trim() : undefined });
    nav.goNext();
  });

  return (
    <OnboardingFrame step="constraints" onBack={nav.goBack} action={<StepActions onContinue={() => void submit()} />}>
      <StepBody definition={nav.definition} error={nav.error}>
        <h2 className="text-[17px] font-semibold">Time you have</h2>
        <div className="mt-3">
          <ChoiceCards
            name="daily-minutes"
            legend="Time you have each day"
            options={DAILY_MINUTES_OPTIONS}
            value={constraints.dailyMinutes}
            onChange={(value) => {
              setConstraints({ dailyMinutes: value });
              nav.setError(undefined);
            }}
          />
        </div>
        <h2 className="mt-8 text-[17px] font-semibold">Anything to avoid?</h2>
        <div className="mt-3">
          <ChoiceChips legend="Things to avoid" options={AVOID_OPTIONS_COPY} values={constraints.avoid} onChange={(values) => setConstraints({ avoid: values })} />
        </div>
        <label htmlFor="constraints-note" className="mt-8 block text-[17px] font-semibold">
          Anything else? <span className="font-normal text-ink-2">Optional</span>
        </label>
        <textarea
          id="constraints-note"
          className="field mt-3 min-h-24 resize-none py-3 leading-[1.4]"
          maxLength={CONSTRAINT_NOTE_MAX}
          aria-invalid={Boolean(noteError)}
          aria-describedby="constraints-note-hint"
          {...form.register("note")}
        />
        <p id="constraints-note-hint" className="mt-2 flex justify-between gap-4 text-[13px] text-ink-2">
          <span>{noteError ?? CONSTRAINT_NOTE_HINT}</span>
          <span className="mono tabular-nums" aria-hidden="true">
            {note.length}/{CONSTRAINT_NOTE_MAX}
          </span>
        </p>
      </StepBody>
    </OnboardingFrame>
  );
}
