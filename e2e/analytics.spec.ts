import { expect, test } from "@playwright/test";

test.describe("first-party analytics", () => {
  test("records the landing visit with campaign data, first-party only, no ad cookies without consent", async ({
    page,
    context,
    baseURL,
  }) => {
    const origin = new URL(baseURL!).origin;
    const foreign: string[] = [];
    page.on("request", (request) => {
      const url = new URL(request.url());
      if (url.origin !== origin && !url.protocol.startsWith("data") && !url.protocol.startsWith("blob")) foreign.push(url.href);
    });

    const beacon = page.waitForRequest((request) => request.url().endsWith("/api/events") && request.method() === "POST");
    await page.goto("/?utm_source=instagram&utm_campaign=launch_test&fbclid=IwAR_secret_click_id");
    const request = await beacon;
    const payload = JSON.parse(request.postData() ?? "{}");

    expect(payload.events.map((event: { name: string }) => event.name)).toEqual(
      expect.arrayContaining(["page_view", "landing_view"]),
    );
    expect(payload.context.attribution).toMatchObject({ utmSource: "instagram", utmCampaign: "launch_test", adClick: "meta" });
    expect(request.postData()).not.toContain("IwAR_secret_click_id");

    const response = await request.response();
    expect(response?.status()).toBe(204);

    const cookies = await context.cookies();
    expect(cookies.map((cookie) => cookie.name)).not.toEqual(expect.arrayContaining(["_fbc"]));
    expect(cookies.map((cookie) => cookie.name)).not.toEqual(expect.arrayContaining(["_fbp"]));
    expect(await page.evaluate(() => sessionStorage.getItem("mxva.sid"))).toBeNull();
    expect(foreign).toEqual([]);
  });
});
