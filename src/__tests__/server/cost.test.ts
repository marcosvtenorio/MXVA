import { describe, expect, it } from "vitest";
import { CostMeter, formatUsd, imageCost, textCost } from "@/server/ai/cost";
import { ownerDeliveryReceipt, type CostSummary } from "@/server/mail/notices";

describe("OpenAI cost", () => {
  it("prices the main model's tokens, cached input at the cached rate, dated ids like their family", () => {
    // gpt-6-astra: $10 in, $1 cached, $50 out per 1M tokens.
    expect(textCost("gpt-6-astra", { input_tokens: 10_000, input_tokens_details: { cached_tokens: 2_000 }, output_tokens: 4_000 })).toBeCloseTo(0.08 + 0.002 + 0.2, 6);
    expect(textCost("gpt-5.5-2026-04-23", { input_tokens: 1_000_000, output_tokens: 0 })).toBeCloseTo(5, 6);
    // No cached price (pro models): cached tokens cost full input.
    expect(textCost("gpt-5.5-pro", { input_tokens: 1_000, input_tokens_details: { cached_tokens: 1_000 }, output_tokens: 0 })).toBeCloseTo(0.03, 6);
    expect(textCost("some-new-model", { input_tokens: 1, output_tokens: 1 })).toBeNull();
  });

  it("prices the image tool's own tokens: text and image input, image output", () => {
    // gpt-image-2.5-sunburst: $5 text in, $8 image in, $30 image out per 1M tokens.
    const usd = imageCost("gpt-image-2.5-sunburst", {
      input_tokens_details: { text_tokens: 1_000, image_tokens: 2_000 },
      output_tokens_details: { image_tokens: 10_000, text_tokens: 0 },
    });
    expect(usd).toBeCloseTo(0.005 + 0.016 + 0.3, 6);
  });

  it("adds every call of a report, and flags a total that misses a price", () => {
    const meter = new CostMeter();
    meter.addText("análise da foto", "gpt-6-astra", { input_tokens: 1_000, output_tokens: 1_000 });
    meter.addImage("imagem", "gpt-image-2.5-sunburst", { output_tokens_details: { image_tokens: 1_000 } });
    meter.addText("ignored", "gpt-6-astra", undefined);
    expect(meter.lines).toHaveLength(2);
    expect(meter.totalUsd).toBeCloseTo(0.01 + 0.05 + 0.03, 6);
    expect(meter.incomplete).toBe(false);
    meter.addText("outro", "unknown-model", { input_tokens: 1, output_tokens: 1 });
    expect(meter.incomplete).toBe(true);
    expect(formatUsd(0.8731)).toBe("US$ 0,873");
  });

  it("emails the owner the cost in Portuguese, with tokens and models but no images", () => {
    const meter = new CostMeter();
    meter.addText("consultoria escrita e pedido da imagem", "gpt-6-astra", { input_tokens: 3_200, output_tokens: 5_400 });
    meter.addImage("imagem antes/depois", "gpt-image-2.5-sunburst", { output_tokens_details: { image_tokens: 12_000 } });
    const cost: CostSummary = {
      lines: meter.lines,
      totalUsd: meter.totalUsd,
      incomplete: false,
      real: true,
      models: { text: "gpt-6-astra", image: "gpt-image-2.5-sunburst", imageQuality: "max" },
    };
    const email = ownerDeliveryReceipt({
      orderId: "0f3c2a1b-0000-4000-8000-000000000000",
      payment: { mode: "sandbox", amountMinor: 4799, currency: "brl", paidAt: "2026-10-16T12:00:00.000Z" },
      generationSeconds: 245,
      generationTries: 1,
      cost,
      server: { appUrl: "https://example.com", commit: "abc1234" },
    });
    expect(email.subject).toBe("[MXVA] Relatório entregue · pedido 0f3c2a1b · custo da IA US$ 0,66");
    expect(email.text).toContain("Custo da IA (OpenAI): US$ 0,662");
    expect(email.text).toContain("3.200 tokens de entrada, 5.400 de saída");
    expect(email.text).toContain("imagem gpt-image-2.5-sunburst (qualidade max)");
    expect(email.text).toContain("R$ 47,99");
    expect(email.text).toContain("4,1 min");
    expect(email.html).toContain("US$ 0,662");
    expect(email.text + email.html).not.toMatch(/data:image|base64/);
  });
});
