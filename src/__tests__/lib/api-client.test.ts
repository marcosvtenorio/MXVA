import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "@/lib/api-client";

afterEach(() => vi.unstubAllGlobals());

describe("api client", () => {
  it("sends the photo as multipart and gets the queue ticket back at once", async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({ order: { status: "processing" }, queue: { position: 3, etaMinutes: 9 } }, { status: 202 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const form = new FormData();
    form.set("faceProcessingConsent", "true");
    const result = await api.fulfill(form);
    expect(result.queue).toEqual({ position: 3, etaMinutes: 9 });
    const [path, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(path).toBe("/api/fulfill");
    expect(init.body).toBe(form);
    // The browser sets the multipart boundary itself: no JSON content type.
    expect((init.headers as Record<string, string>)["content-type"]).toBeUndefined();
  });

  it("turns a refused report request into a typed error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ error: { code: "QUEUE_FULL", message: "busy", retryable: true } }, { status: 503 })),
    );
    await expect(api.fulfill(new FormData())).rejects.toMatchObject({ code: "QUEUE_FULL", retryable: true, status: 503 });
  });

  it("reports being offline as a retryable error, not a failed report", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new TypeError("network error"))));
    await expect(api.fulfill(new FormData())).rejects.toMatchObject({ code: "SERVICE_UNAVAILABLE", retryable: true, status: 0 });
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
