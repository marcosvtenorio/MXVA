import { afterEach, describe, expect, it, vi } from "vitest";
import { ConnectionLostError, api } from "@/lib/api-client";

function streamOf(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
}

afterEach(() => vi.unstubAllGlobals());

describe("api client", () => {
  it("reads streamed phases split across chunks, then the result", async () => {
    const lines = [
      JSON.stringify({ type: "phase", phase: "analysing_photo" }),
      JSON.stringify({ type: "phase", phase: "preparing_image" }),
      JSON.stringify({ type: "result", report: { title: "x" }, image: { mime: "image/jpeg", base64: "AA==" }, pdf: { filename: "a.pdf", base64: "AA==" }, emailDelivered: true }),
    ].join("\n") + "\n";
    const chunks = [lines.slice(0, 17), lines.slice(17, 80), lines.slice(80)];
    vi.stubGlobal("fetch", vi.fn(async () => new Response(streamOf(chunks), { status: 200, headers: { "content-type": "application/x-ndjson" } })));
    const phases: string[] = [];
    const result = await api.fulfill(new FormData(), (phase) => phases.push(phase));
    expect(phases).toEqual(["analysing_photo", "preparing_image"]);
    expect(result.emailDelivered).toBe(true);
    expect(result.pdf.filename).toBe("a.pdf");
  });

  it("turns a streamed error into a typed error", async () => {
    const body = JSON.stringify({ type: "error", error: { code: "SIMULATION_QUALITY_FAILED", message: "nope", retryable: true } }) + "\n";
    vi.stubGlobal("fetch", vi.fn(async () => new Response(streamOf([body]), { status: 200 })));
    await expect(api.fulfill(new FormData(), () => undefined)).rejects.toMatchObject({ code: "SIMULATION_QUALITY_FAILED", retryable: true });
  });

  it("reports a dropped stream as a lost connection, not as a failed or finished report", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(streamOf([JSON.stringify({ type: "phase", phase: "building_report" }) + "\n"]), { status: 200 })));
    const error = await api.fulfill(new FormData(), () => undefined).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ConnectionLostError);
  });

  it("treats a stream that breaks mid-way (network error) as a lost connection too", async () => {
    const broken = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(JSON.stringify({ type: "phase", phase: "preparing_image" }) + "\n"));
        controller.error(new TypeError("network error"));
      },
    });
    vi.stubGlobal("fetch", vi.fn(async () => new Response(broken, { status: 200 })));
    const error = await api.fulfill(new FormData(), () => undefined).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ConnectionLostError);
  });

  it("maps JSON error bodies and sends the same-origin header", async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({ error: { code: "ORDER_NOT_PAID", message: "Not paid", retryable: true } }, { status: 402 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    await expect(api.currentOrder()).rejects.toMatchObject({ code: "ORDER_NOT_PAID", status: 402 });
    const init = (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect((init.headers as Record<string, string>)["x-mxva-request"]).toBe("1");
  });
});
