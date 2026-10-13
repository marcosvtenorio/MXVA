import { expect, test } from "@playwright/test";

const ORDER = {
  sku: "mxva_report_v1",
  method: "card",
  email: "prod.check@example.com",
  adultConfirmed: true,
  faceProcessingConsentVersion: "2026-10-13.v1",
  termsVersion: "2026-10-11.v1",
  marketingOptIn: false,
};

test.describe("production build with default flags", () => {
  test("no mock payment, no mock result, checkout closed", async ({ request, baseURL }) => {
    const health = await (await request.get("/api/health")).json();
    expect(health).toMatchObject({ payments: "unavailable", fulfillment: "unavailable" });

    const headers = { origin: baseURL!, "x-mxva-request": "1", "content-type": "application/json" };
    const mockPay = await request.post("/api/dev/mock-pay", { headers, data: { outcome: "succeeded" } });
    expect(mockPay.status()).toBe(404);

    const pixSimulate = await request.post("/api/dev/pix-simulate", { headers });
    expect(pixSimulate.status()).toBe(404);

    // Neither card nor Pix is offered until live keys, real AI and email are configured.
    expect(await (await request.get("/api/checkout/options")).json()).toEqual({ offers: [] });
    for (const method of ["card", "pix"]) {
      const order = await request.post("/api/orders", { headers, data: { ...ORDER, method } });
      expect(order.status()).toBe(503);
      expect((await order.json()).error.code).toBe("SERVICE_UNAVAILABLE");
    }

    // Without COOKIE_SIGNING_SECRET and payments configured, paid endpoints fail closed.
    const fulfill = await request.post("/api/fulfill", { headers: { origin: baseURL!, "x-mxva-request": "1" }, multipart: { input: "{}" } });
    expect((await fulfill.json()).error.code).toBe("SERVICE_UNAVAILABLE");
  });

  test("security headers are present and private routes are not indexed", async ({ request }) => {
    const home = await request.get("/");
    expect(home.headers()["content-security-policy"]).toContain("frame-ancestors 'none'");
    expect(home.headers()["strict-transport-security"]).toBeTruthy();
    const start = await request.get("/start");
    expect(start.headers()["x-robots-tag"]).toContain("noindex");
  });

  test("the checkout page explains payments aren't open instead of simulating one", async ({ page }) => {
    await page.goto("/checkout");
    await expect(page.getByRole("button", { name: /simulated/ })).toHaveCount(0);
  });
});
