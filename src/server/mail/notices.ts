import "server-only";
import { publicConfig } from "@/lib/config";
import type { ApiErrorCode } from "@/lib/api-errors";
import type { OrderStatus } from "@/features/orders/states";
import { supportEmail } from "../config";

/**
 * When a report can't be made after the queue's retries: a notice to the buyer (in English, like
 * the site) and an alert to the owner (in Portuguese, the owner's language). The owner's alert
 * carries order metadata and error details only: never the photo, the concept, the face
 * analysis or the report.
 */

export type BuyerNoticeKind =
  /** Something failed on our side: add the photo again from the link. */
  | "regenerate"
  /** The photo couldn't be used: add a different one from the link. */
  | "photo"
  /** A person reviews the order first (e.g. the photo may show a minor). No link. */
  | "review"
  /** Retries are used up or the problem needs a person. No link. */
  | "support";

type Content = { subject: string; text: string; html: string };

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

function buyerHtml(heading: string, paragraphs: string[], link?: { url: string; label: string }): string {
  const brand = escapeHtml(publicConfig.brandName);
  const support = escapeHtml(supportEmail());
  const button = link
    ? `<p style="margin:24px 0"><a href="${escapeHtml(link.url)}" style="display:inline-block;background:#111;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:600">${escapeHtml(link.label)}</a></p>
<p style="color:#555;font-size:13px">The link works for 7 days. If the button doesn't open, copy this address into your browser:<br>${escapeHtml(link.url)}</p>`
    : "";
  return `<!doctype html><html><body style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#111;line-height:1.5;max-width:560px;margin:0 auto;padding:24px">
<p style="font-size:13px;letter-spacing:.08em;text-transform:uppercase;margin:0 0 16px">${brand}</p>
<h1 style="font-size:22px;margin:0 0 12px">${escapeHtml(heading)}</h1>
${paragraphs.map((p) => `<p>${escapeHtml(p)}</p>`).join("\n")}
${button}
<p style="color:#555;font-size:14px">Questions? Write to <a href="mailto:${support}">${support}</a>.</p>
</body></html>`;
}

export function buyerFailureNotice(kind: BuyerNoticeKind, options: { resumeUrl?: string; reason?: string } = {}): Content {
  const support = supportEmail();
  const link = options.resumeUrl ? { url: options.resumeUrl, label: "Create my report again" } : undefined;
  let subject: string;
  let heading: string;
  let paragraphs: string[];
  switch (kind) {
    case "regenerate":
      subject = "We couldn't finish your report — create it again, no charge";
      heading = "Your report didn't finish";
      paragraphs = [
        "Your payment is safe. Something went wrong on our side while we were making your report, and our automatic retries didn't fix it. We're sorry.",
        "Open the link below and add your front photo again. We'll make your report and email it to you. There's no second charge.",
      ];
      break;
    case "photo":
      subject = "We couldn't use your photo — add another one, no charge";
      heading = "We need a different photo";
      paragraphs = [
        `Your payment is safe. ${options.reason ?? "We couldn't use the photo you sent."}`,
        "Open the link below and add another front photo: just you, facing the camera, in good light. There's no second charge.",
      ];
      break;
    case "review":
      subject = "We need to review your order";
      heading = "Your order needs a quick review";
      paragraphs = [
        "Before we make your report, our team needs to review your order. We'll email you soon. You won't be charged again.",
      ];
      break;
    case "support":
      subject = "We're looking into your report";
      heading = "Our team is on it";
      paragraphs = [
        "We couldn't make your report automatically, so a person will take it from here. We'll email you. You won't be charged again.",
        `If you'd rather have a refund, reply to this email or write to ${support}.`,
      ];
      break;
  }
  const text = [...paragraphs, ...(link ? ["", `${link.label}: ${link.url}`, "The link works for 7 days."] : []), "", `Questions? Write to ${support}.`].join("\n");
  return { subject, text, html: buyerHtml(heading, paragraphs, link) };
}

export type TimelineEntry = {
  at: string;
  step: string;
  outcome: "ok" | "error";
  code?: string;
  detail?: string;
  seconds?: number;
};

export type FailureAlert = {
  orderId: string;
  buyerEmail: string;
  code: ApiErrorCode;
  what: string;
  finalStatus: OrderStatus;
  buyerAttempt: number;
  maxAttempts: number;
  buyerNotice: BuyerNoticeKind;
  buyerNoticeSent: boolean;
  payment: { mode: string; amountMinor: number; currency: string; paidAt: string | null };
  timeline: TimelineEntry[];
  server: { appUrl: string; commit: string | null; mode: string; queueWaiting: number; queueRunning: number; concurrency: number; uptimeSeconds: number };
};

const NOTICE_PT: Record<BuyerNoticeKind, string> = {
  regenerate: "pedimos que gere de novo pelo link do email (sem nova cobrança)",
  photo: "pedimos uma foto diferente pelo link do email (sem nova cobrança)",
  review: "avisamos que o pedido passa por revisão e que você vai entrar em contato",
  support: "avisamos que a equipe vai entrar em contato (e que pode pedir reembolso)",
};

const ACTION_PT: Record<BuyerNoticeKind, string> = {
  regenerate: "Nada, se o cliente gerar de novo. Se o mesmo erro se repetir em vários pedidos, veja o código abaixo (créditos da OpenAI, chave, limite de uso).",
  photo: "Nada: o cliente envia outra foto pelo link.",
  review: "Revise o pedido e responda ao cliente. A IA indicou que a foto pode mostrar um menor de idade.",
  support: "Responda ao cliente: gere o relatório manualmente ou reembolse.",
};

export function ownerFailureAlert(alert: FailureAlert): Content {
  const short = alert.orderId.slice(0, 8);
  const subject = `[MXVA] Pedido ${short}: ${alert.what} (${alert.code})`;
  const money = alert.payment.currency === "brl" ? `R$ ${(alert.payment.amountMinor / 100).toFixed(2).replace(".", ",")}` : `US$ ${(alert.payment.amountMinor / 100).toFixed(2)}`;
  const rows: [string, string][] = [
    ["Pedido", alert.orderId],
    ["Email do comprador", alert.buyerEmail],
    ["Código do erro", alert.code],
    ["Situação do pedido agora", alert.finalStatus],
    ["Tentativa do comprador", `${alert.buyerAttempt} de ${alert.maxAttempts}`],
    ["Pagamento", `${money} · ${alert.payment.mode}${alert.payment.paidAt ? ` · pago em ${alert.payment.paidAt}` : ""}`],
    ["O que o comprador recebeu", `${NOTICE_PT[alert.buyerNotice]}${alert.buyerNoticeSent ? "" : " — ATENÇÃO: esse email NÃO foi enviado"}`],
  ];
  const server: [string, string][] = [
    ["Site", alert.server.appUrl],
    ["Versão (commit)", alert.server.commit ?? "desconhecida"],
    ["IA", alert.server.mode],
    ["Fila agora", `${alert.server.queueWaiting} aguardando, ${alert.server.queueRunning} em andamento, até ${alert.server.concurrency} ao mesmo tempo`],
    ["Servidor ligado há", `${Math.round(alert.server.uptimeSeconds / 60)} min`],
  ];
  const timelineText = alert.timeline.map(
    (t) => `- ${t.at}  ${t.step}  ${t.outcome === "ok" ? "ok" : "ERRO"}${t.code ? ` ${t.code}` : ""}${t.seconds !== undefined ? ` (${t.seconds.toFixed(1)} s)` : ""}${t.detail ? `\n    ${t.detail}` : ""}`,
  );
  const text = [
    `${alert.what}.`,
    `O que fazer: ${ACTION_PT[alert.buyerNotice]}`,
    "",
    ...rows.map(([k, v]) => `${k}: ${v}`),
    "",
    "Linha do tempo:",
    ...timelineText,
    "",
    ...server.map(([k, v]) => `${k}: ${v}`),
    "",
    "Privacidade: este alerta não contém a foto, a imagem gerada, a análise do rosto nem o relatório.",
  ].join("\n");
  const table = (pairs: [string, string][]) =>
    `<table style="border-collapse:collapse;width:100%;margin:0 0 16px">${pairs
      .map(([k, v]) => `<tr><td style="padding:6px 8px;border-bottom:1px solid #eee;color:#555;white-space:nowrap;vertical-align:top">${escapeHtml(k)}</td><td style="padding:6px 8px;border-bottom:1px solid #eee;word-break:break-word">${escapeHtml(v)}</td></tr>`)
      .join("")}</table>`;
  const timelineHtml = `<table style="border-collapse:collapse;width:100%;margin:0 0 16px;font-size:13px">${alert.timeline
    .map(
      (t) => `<tr><td style="padding:6px 8px;border-bottom:1px solid #eee;white-space:nowrap;vertical-align:top;color:#555">${escapeHtml(t.at.slice(11, 19))}</td><td style="padding:6px 8px;border-bottom:1px solid #eee;vertical-align:top">${escapeHtml(t.step)}${t.seconds !== undefined ? ` <span style="color:#555">(${t.seconds.toFixed(1)} s)</span>` : ""}</td><td style="padding:6px 8px;border-bottom:1px solid #eee;vertical-align:top;color:${t.outcome === "ok" ? "#1f7a4d" : "#b3261e"};font-weight:600">${t.outcome === "ok" ? "ok" : escapeHtml(t.code ?? "erro")}</td><td style="padding:6px 8px;border-bottom:1px solid #eee;vertical-align:top;font-family:ui-monospace,Menlo,monospace;word-break:break-word">${escapeHtml(t.detail ?? "")}</td></tr>`,
    )
    .join("")}</table>`;
  const html = `<!doctype html><html><body style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#111;line-height:1.5;max-width:680px;margin:0 auto;padding:24px">
<p style="font-size:13px;color:#555;margin:0 0 6px">MXVA · alerta automático</p>
<h1 style="font-size:20px;margin:0 0 10px">${escapeHtml(alert.what)}</h1>
<p style="background:#fff6e5;border-radius:8px;padding:10px 12px"><b>O que fazer:</b> ${escapeHtml(ACTION_PT[alert.buyerNotice])}</p>
${table(rows)}
<h2 style="font-size:16px;margin:20px 0 6px">Linha do tempo</h2>
${timelineHtml}
<h2 style="font-size:16px;margin:20px 0 6px">Servidor</h2>
${table(server)}
<p style="color:#555;font-size:13px">Privacidade: este alerta não contém a foto, a imagem gerada, a análise do rosto nem o relatório.</p>
</body></html>`;
  return { subject, text, html };
}
