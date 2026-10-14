import "server-only";
import { randomUUID } from "node:crypto";
import { publicConfig } from "@/lib/config";
import { ConfigError, fulfillmentMode, serverEnv, supportEmail } from "../config";
import { ApiError } from "../http";

export const REPORT_FILENAME = "your-appearance-roadmap.pdf";

export type ReportEmail = {
  to: string;
  pdf: Buffer;
  /** Per order + attempt, so provider retries never send twice. */
  idempotencyKey: string;
};

/** A plain notice: "create your report again" to a buyer, or an alert to the owner. No attachments. */
export type NoticeEmail = {
  to: string;
  subject: string;
  text: string;
  html: string;
  idempotencyKey: string;
};

export interface EmailProvider {
  readonly simulated: boolean;
  sendReport(email: ReportEmail): Promise<{ messageId: string }>;
  sendNotice(email: NoticeEmail): Promise<{ messageId: string }>;
}

export function reportEmailContent(): { subject: string; text: string; html: string } {
  const brand = publicConfig.brandName;
  const support = supportEmail();
  const subject = `Your personalized looksmaxxing report is ready`;
  const text = [
    `Your ${brand} report is attached as a PDF (${REPORT_FILENAME}).`,
    "",
    "It contains your AI concept image and your prioritised 7, 30 and 90-day roadmap, with sources.",
    "",
    "This email is your permanent copy: we don't keep your photos or your report. Files in your inbox stay until you delete them.",
    "",
    `Questions or a problem with your report? Reply to ${support}.`,
  ].join("\n");
  // No portrait in the body: the image lives only inside the attached PDF.
  const html = `<!doctype html><html><body style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#111;line-height:1.5;max-width:560px;margin:0 auto;padding:24px">
<p style="font-size:13px;letter-spacing:.08em;text-transform:uppercase;margin:0 0 16px">${brand}</p>
<h1 style="font-size:22px;margin:0 0 12px">Your report is attached</h1>
<p>Your PDF (<strong>${REPORT_FILENAME}</strong>) contains your AI concept image and your prioritised 7, 30 and 90-day roadmap, with sources.</p>
<p>This email is your permanent copy: we don't keep your photos or your report. Files in your inbox stay until you delete them.</p>
<p style="color:#555;font-size:14px">Questions or a problem with your report? Write to <a href="mailto:${support}">${support}</a>.</p>
</body></html>`;
  return { subject, text, html };
}

export function maskEmail(email: string): string {
  const [name = "", domain = ""] = email.split("@");
  return `${name.slice(0, 1)}***@${domain}`;
}

/** What the development mailer would have sent: kinds and subjects only, never a PDF. */
export type MockSentEmail = { kind: "report" | "notice"; to: string; subject: string; text?: string };
const mockOutbox = globalThis as unknown as { __mxvaMockOutbox?: MockSentEmail[] };

/** Development and tests: the emails the mock mailer "sent", newest last. */
export function mockSentEmails(): MockSentEmail[] {
  return (mockOutbox.__mxvaMockOutbox ??= []);
}

function recordMock(email: MockSentEmail): void {
  const outbox = mockSentEmails();
  outbox.push(email);
  if (outbox.length > 500) outbox.splice(0, outbox.length - 500);
}

/** Development only: nothing is sent. Logs metadata, never content. */
class MockEmailProvider implements EmailProvider {
  readonly simulated = true;
  async sendReport(email: ReportEmail): Promise<{ messageId: string }> {
    if (serverEnv().MOCK_FORCE_FAILURE === "email") throw new ApiError("EMAIL_FAILED");
    console.info(`[mail:mock] report to ${maskEmail(email.to)} (${Math.round(email.pdf.length / 1024)} KB PDF) — not sent`);
    recordMock({ kind: "report", to: email.to, subject: reportEmailContent().subject });
    return { messageId: `mock_msg_${randomUUID()}` };
  }
  async sendNotice(email: NoticeEmail): Promise<{ messageId: string }> {
    console.info(`[mail:mock] "${email.subject}" to ${maskEmail(email.to)} — not sent`);
    recordMock({ kind: "notice", to: email.to, subject: email.subject, text: email.text });
    return { messageId: `mock_msg_${randomUUID()}` };
  }
}

/** Resend with the PDF as a binary attachment (Phase C). Check plan limits before launch. */
class ResendEmailProvider implements EmailProvider {
  readonly simulated = false;
  async sendReport(email: ReportEmail): Promise<{ messageId: string }> {
    const env = serverEnv();
    if (!env.RESEND_API_KEY || !env.EMAIL_FROM) throw new ConfigError("RESEND_API_KEY and EMAIL_FROM are required.");
    const { Resend } = await import("resend");
    const resend = new Resend(env.RESEND_API_KEY);
    const content = reportEmailContent();
    const { data, error } = await resend.emails.send(
      {
        from: env.EMAIL_FROM,
        to: email.to,
        replyTo: supportEmail(),
        subject: content.subject,
        text: content.text,
        html: content.html,
        attachments: [{ filename: REPORT_FILENAME, content: email.pdf, contentType: "application/pdf" }],
      },
      { idempotencyKey: email.idempotencyKey },
    );
    if (error || !data?.id) {
      // Error class only: Resend's messages can contain addresses.
      console.error(`[mail] resend rejected the report email: ${error?.name ?? "no_id"}`);
      throw new ApiError("EMAIL_FAILED");
    }
    return { messageId: data.id };
  }

  async sendNotice(email: NoticeEmail): Promise<{ messageId: string }> {
    const env = serverEnv();
    if (!env.RESEND_API_KEY || !env.EMAIL_FROM) throw new ConfigError("RESEND_API_KEY and EMAIL_FROM are required.");
    const { Resend } = await import("resend");
    const resend = new Resend(env.RESEND_API_KEY);
    const { data, error } = await resend.emails.send(
      { from: env.EMAIL_FROM, to: email.to, replyTo: supportEmail(), subject: email.subject, text: email.text, html: email.html },
      { idempotencyKey: email.idempotencyKey },
    );
    if (error || !data?.id) {
      console.error(`[mail] resend rejected a notice: ${error?.name ?? "no_id"}`);
      throw new ApiError("EMAIL_FAILED");
    }
    return { messageId: data.id };
  }
}

export function emailProvider(): EmailProvider {
  switch (fulfillmentMode()) {
    case "mock":
      return new MockEmailProvider();
    case "real":
      return new ResendEmailProvider();
    case "unavailable":
      throw new ApiError("SERVICE_UNAVAILABLE");
  }
}
