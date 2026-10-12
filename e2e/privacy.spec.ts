import { expect, test } from "@playwright/test";
import { TEST_EMAIL, runOnboarding } from "./support/flow";

test.describe("privacy before payment", () => {
  test("nothing personal or photographic is stored in the browser or sent before payment", async ({ page, context }) => {
    const requests: { url: string; method: string; body: string | null; type: string | null }[] = [];
    page.on("request", (request) => {
      requests.push({ url: request.url(), method: request.method(), body: request.postData(), type: request.headers()["content-type"] ?? null });
    });

    await runOnboarding(page); // ends on the checkout page, unpaid

    const storage = await page.evaluate(async () => {
      const dump = (store: Storage) => Array.from({ length: store.length }, (_, i) => `${store.key(i)}=${store.getItem(store.key(i)!)}`).join("\n");
      const databases = typeof indexedDB.databases === "function" ? await indexedDB.databases() : [];
      const caches = typeof window.caches !== "undefined" ? await window.caches.keys() : [];
      return { session: dump(sessionStorage), local: dump(localStorage), databases: databases.map((db) => db.name), caches, history: JSON.stringify(history.state) };
    });
    const cookies = (await context.cookies()).map((cookie) => `${cookie.name}=${cookie.value}`).join("\n");
    const everything = [storage.session, storage.local, cookies, storage.history].join("\n");

    expect(everything).not.toContain(TEST_EMAIL);
    expect(everything).not.toMatch(/data:image|base64|blob:/);
    expect(storage.local).toBe("");
    expect(storage.databases).toEqual([]);
    expect(storage.caches).toEqual([]);
    // Only allowlisted survey choices may survive a reload.
    expect(storage.session).toMatch(/mxva\.onboarding\.v1/);

    const apiCalls = requests.filter((request) => new URL(request.url).pathname.startsWith("/api/"));
    for (const call of apiCalls) {
      expect(call.type ?? "").not.toMatch(/multipart/);
      expect(call.body ?? "").not.toMatch(/data:image|base64|\/9j\//);
      expect(new URL(call.url).pathname).not.toBe("/api/fulfill");
    }
    // Analytics never carries the email or answer values.
    for (const call of apiCalls.filter((request) => request.url.endsWith("/api/events"))) {
      expect(call.body ?? "").not.toContain(TEST_EMAIL);
      expect(call.body ?? "").not.toMatch(/grooming|facial_hair|Sharper/);
    }
  });
});
