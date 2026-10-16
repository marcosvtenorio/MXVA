import "server-only";
import { publicConfig } from "@/lib/config";
import type { ApiErrorCode } from "@/lib/api-errors";
import type { OrderStatus } from "@/features/orders/states";
import { PRICES_CHECKED_ON, formatUsd, type CostLine } from "../ai/cost";
import { supportEmail } from "../config";

/**
 * When a report can't be made after the queue's retries: a notice to the buyer (in English, like
 * the site) and an alert to the owner (in Portuguese, the owner's language). When it is delivered,
 * a receipt to the owner with what the AI cost. The owner's emails carry order metadata, error
 * details and token counts only: never the photo, the concept, the face analysis or the report.
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
  /** What the OpenAI calls made before the failure cost. */
  cost?: CostSummary;
};

/** Every OpenAI call of one report, priced. */
export type CostSummary = {
  lines: CostLine[];
  totalUsd: number;
  /** A model missing from the price table: the total is too low. */
  incomplete: boolean;
  /** False when the AI is simulated (development and tests): nothing was spent. */
  real: boolean;
  models: { text: string; image: string; imageQuality: string };
};

type Payment = FailureAlert["payment"];

function formatMoney(payment: Payment): string {
  return payment.currency === "brl" ? `R$ ${(payment.amountMinor / 100).toFixed(2).replace(".", ",")}` : `US$ ${(payment.amountMinor / 100).toFixed(2)}`;
}

const count = (n: number) => n.toLocaleString("pt-BR");

const COST_HOW = `Como é calculado: os tokens que a OpenAI informou em cada resposta × o preço oficial por 1 milhão de tokens (tabela conferida em ${PRICES_CHECKED_ON}). Não inclui o email (Resend) nem o servidor (Railway).`;

function costText(cost: CostSummary): string[] {
  if (!cost.real) return ["Custo da IA: nenhum (IA simulada)."];
  return [
    `Custo da IA (OpenAI): ${formatUsd(cost.totalUsd)}${cost.incomplete ? " — INCOMPLETO: um modelo não está na tabela de preços" : ""}`,
    `Modelos: texto ${cost.models.text}; imagem ${cost.models.image} (qualidade ${cost.models.imageQuality})`,
    ...cost.lines.map(
      (line) => `- ${line.step} · ${line.model} · ${count(line.inputTokens)} tokens de entrada, ${count(line.outputTokens)} de saída · ${line.usd === null ? "preço desconhecido" : formatUsd(line.usd)}`,
    ),
    COST_HOW,
  ];
}

function costHtml(cost: CostSummary): string {
  if (!cost.real) return `<p>Custo da IA: nenhum (IA simulada).</p>`;
  const cell = "padding:6px 8px;border-bottom:1px solid #eee;vertical-align:top";
  const rows = cost.lines
    .map(
      (line) =>
        `<tr><td style="${cell}">${escapeHtml(line.step)}<br><span style="color:#555;font-family:ui-monospace,Menlo,monospace;font-size:12px">${escapeHtml(line.model)}</span></td><td style="${cell};text-align:right;white-space:nowrap">${count(line.inputTokens)}</td><td style="${cell};text-align:right;white-space:nowrap">${count(line.outputTokens)}</td><td style="${cell};text-align:right;white-space:nowrap">${line.usd === null ? "?" : escapeHtml(formatUsd(line.usd))}</td></tr>`,
    )
    .join("");
  return `<p style="font-size:28px;font-weight:700;margin:4px 0 2px">${escapeHtml(formatUsd(cost.totalUsd))}</p>
<p style="color:#555;margin:0 0 12px">Texto: ${escapeHtml(cost.models.text)} · imagem: ${escapeHtml(cost.models.image)} (qualidade ${escapeHtml(cost.models.imageQuality)})</p>
${cost.incomplete ? `<p style="background:#fff6e5;border-radius:8px;padding:10px 12px">Total incompleto: um modelo não está na tabela de preços.</p>` : ""}
<table style="border-collapse:collapse;width:100%;margin:0 0 8px;font-size:13px"><tr><th style="${cell};text-align:left">Etapa</th><th style="${cell};text-align:right">Tokens de entrada</th><th style="${cell};text-align:right">Tokens de saída</th><th style="${cell};text-align:right">Custo</th></tr>${rows}</table>
<p style="color:#555;font-size:13px">${escapeHtml(COST_HOW)}</p>`;
}

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
  const money = formatMoney(alert.payment);
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
    ...(alert.cost ? [...costText(alert.cost), ""] : []),
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
${alert.cost ? `<h2 style="font-size:16px;margin:20px 0 6px">Gasto com a IA até a falha</h2>\n${costHtml(alert.cost)}` : ""}
<h2 style="font-size:16px;margin:20px 0 6px">Servidor</h2>
${table(server)}
<p style="color:#555;font-size:13px">Privacidade: este alerta não contém a foto, a imagem gerada, a análise do rosto nem o relatório.</p>
</body></html>`;
  return { subject, text, html };
}

export type DeliveryReceipt = {
  orderId: string;
  payment: Payment;
  /** From the first try to the finished PDF, waits for retries included. */
  generationSeconds: number;
  generationTries: number;
  cost: CostSummary;
  server: { appUrl: string; commit: string | null };
};

/** To the owner when a report reaches the buyer: what it cost to make. */
export function ownerDeliveryReceipt(receipt: DeliveryReceipt): Content {
  const short = receipt.orderId.slice(0, 8);
  const total = receipt.cost.real ? formatUsd(receipt.cost.totalUsd, 2) : "zero (IA simulada)";
  const subject = `[MXVA] Relatório entregue · pedido ${short} · custo da IA ${total}`;
  const minutes = receipt.generationSeconds / 60;
  const rows: [string, string][] = [
    ["Pedido", receipt.orderId],
    ["Pagamento", `${formatMoney(receipt.payment)} · ${receipt.payment.mode}${receipt.payment.paidAt ? ` · pago em ${receipt.payment.paidAt}` : ""}`],
    ["Tempo de geração", minutes >= 1 ? `${minutes.toFixed(1).replace(".", ",")} min` : `${Math.round(receipt.generationSeconds)} s`],
    ["Tentativas", String(receipt.generationTries)],
    ["Site", receipt.server.appUrl],
    ["Versão (commit)", receipt.server.commit ?? "desconhecida"],
  ];
  const privacy = "Privacidade: este email não contém a foto, a imagem gerada, a análise do rosto nem o relatório.";
  const text = [
    "Relatório gerado e enviado ao comprador.",
    "",
    ...costText(receipt.cost),
    "",
    ...rows.map(([k, v]) => `${k}: ${v}`),
    "",
    privacy,
  ].join("\n");
  const table = `<table style="border-collapse:collapse;width:100%;margin:0 0 16px">${rows
    .map(([k, v]) => `<tr><td style="padding:6px 8px;border-bottom:1px solid #eee;color:#555;white-space:nowrap;vertical-align:top">${escapeHtml(k)}</td><td style="padding:6px 8px;border-bottom:1px solid #eee;word-break:break-word">${escapeHtml(v)}</td></tr>`)
    .join("")}</table>`;
  const html = `<!doctype html><html><body style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#111;line-height:1.5;max-width:680px;margin:0 auto;padding:24px">
<p style="font-size:13px;color:#555;margin:0 0 6px">MXVA · relatório entregue</p>
<h1 style="font-size:20px;margin:0 0 10px">Custo da geração</h1>
${costHtml(receipt.cost)}
<h2 style="font-size:16px;margin:20px 0 6px">Pedido</h2>
${table}
<p style="color:#555;font-size:13px">${escapeHtml(privacy)}</p>
</body></html>`;
  return { subject, text, html };
}
