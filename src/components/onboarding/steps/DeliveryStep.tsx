"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useForm, type Resolver } from "react-hook-form";
import { stepSchemas } from "@/features/onboarding/schema";
import { useOnboardingStore } from "@/features/onboarding/store";
import { useStepNav } from "@/features/onboarding/use-flow";
import { TYPICAL_DELIVERY } from "@/lib/config";
import { OnboardingFrame, StepStage } from "../OnboardingFrame";
import { StepActions, StepBody } from "./StepBody";

type Values = { email: string; faceProcessingConsent: boolean; termsAccepted: boolean; marketingOptIn: boolean };

function FieldError({ id, message }: { id: string; message?: string }) {
  return message ? (
    <p id={id} role="alert" className="mt-2 text-[13px] leading-[1.35] text-negative">
      {message}
    </p>
  ) : null;
}

export function DeliveryStep() {
  const nav = useStepNav("delivery");
  const state = useOnboardingStore();
  const form = useForm<Values>({
    resolver: zodResolver(stepSchemas.delivery) as unknown as Resolver<Values>,
    defaultValues: {
      email: state.email,
      faceProcessingConsent: state.faceProcessingConsent,
      termsAccepted: state.termsAccepted,
      marketingOptIn: state.marketingOptIn,
    },
  });
  const { errors } = form.formState;

  const submit = form.handleSubmit((values) => {
    // Memory only: email and consents are never written to browser storage.
    state.set({
      email: values.email.trim().toLowerCase(),
      faceProcessingConsent: values.faceProcessingConsent,
      termsAccepted: values.termsAccepted,
      marketingOptIn: values.marketingOptIn,
    });
    nav.goNext({ validate: false });
  });

  return (
    <OnboardingFrame
      step="delivery"
      onBack={nav.goBack}
      action={<StepActions busy={nav.pending} onContinue={() => void submit()} />}
      stage={<StepStage readouts={["PDF by email", `${TYPICAL_DELIVERY} after paying`]} caption="Your photo stays in this tab until you pay" />}
    >
      <StepBody definition={nav.definition}>
        <form noValidate onSubmit={(event) => { event.preventDefault(); void submit(); }}>
          <label htmlFor="email" className="block text-[13px] text-ink-2">
            Email
          </label>
          <input
            id="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="none"
            spellCheck={false}
            placeholder="you@example.com"
            className="field mt-1.5"
            aria-invalid={Boolean(errors.email)}
            aria-describedby={errors.email ? "email-error" : undefined}
            {...form.register("email")}
          />
          <FieldError id="email-error" message={errors.email?.message} />

          {/* Each row is a 44px tap target; the small gap keeps the visual rhythm. */}
          <div className="mt-4 grid gap-1">
            <label className="flex min-h-11 cursor-pointer items-start gap-3 py-2.5 text-[15px] leading-[1.4]">
              <input
                type="checkbox"
                className="checkbox"
                aria-invalid={Boolean(errors.faceProcessingConsent)}
                aria-describedby={errors.faceProcessingConsent ? "consent-error" : undefined}
                {...form.register("faceProcessingConsent")}
              />
              <span>
                I agree my photos go to MXVA&apos;s server and its AI providers only to make my report, emailed to me with my photo next to the
                concept (
                <Link href="/privacy" target="_blank" className="underline underline-offset-2">
                  Privacy Policy
                </Link>
                ).
              </span>
            </label>
            <FieldError id="consent-error" message={errors.faceProcessingConsent?.message} />
            <label className="flex min-h-11 cursor-pointer items-start gap-3 py-2.5 text-[15px] leading-[1.4]">
              <input
                type="checkbox"
                className="checkbox"
                aria-invalid={Boolean(errors.termsAccepted)}
                aria-describedby={errors.termsAccepted ? "terms-error" : undefined}
                {...form.register("termsAccepted")}
              />
              <span>
                I accept the{" "}
                <Link href="/terms" target="_blank" className="underline underline-offset-2">
                  Terms
                </Link>{" "}
                and the{" "}
                <Link href="/refunds" target="_blank" className="underline underline-offset-2">
                  Refund Policy
                </Link>
                .
              </span>
            </label>
            <FieldError id="terms-error" message={errors.termsAccepted?.message} />
            <label className="flex min-h-11 cursor-pointer items-start gap-3 py-2.5 text-[15px] leading-[1.4] text-ink-2">
              <input type="checkbox" className="checkbox" {...form.register("marketingOptIn")} />
              <span>Send me occasional tips and offers. Optional, unsubscribe any time.</span>
            </label>
          </div>
        </form>
      </StepBody>
    </OnboardingFrame>
  );
}
