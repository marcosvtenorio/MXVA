// Load test: N buyers park on the checkout page and then all pay at the same moment, so N reports are
// made at once on one server. A few buyers use a real Chrome through the interface; the rest make the
// same HTTP calls the browser makes (recorded from a real browser run), so one laptop can carry the
// load. OpenAI and Resend are replaced by e2e/stress/fake-providers.mjs (no credits, no real emails);
// payments are the dev simulator. Every buyer gets a photo with a unique code, and the run checks that
// each one's PDF, and the email sent to their address, carry their own photo and nobody else's.
//
//   node e2e/stress/run.mjs --users 100 [--browser-buyers 10] [--image-ms 100000 --vision-ms 15000 --qc-ms 10000 --jitter 0.2]
//        [--image-limit 20] [--database-url postgres://…] [--label name]
//
// Results: test-results/stress/<label>.json
import { spawn, execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import sharp from "sharp";
import { PDFDocument, PDFName, PDFRawStream } from "pdf-lib";
import { chromium, devices, request } from "@playwright/test";
import { startFakeProviders } from "./fake-providers.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const { values: args } = parseArgs({
  options: {
    users: { type: "string", default: "100" },
    "vision-ms": { type: "string", default: "0" },
    "image-ms": { type: "string", default: "0" },
    "qc-ms": { type: "string", default: "0" },
    jitter: { type: "string", default: "0" },
    "image-limit": { type: "string", default: "" },
    "database-url": { type: "string", default: "" },
    "browser-buyers": { type: "string", default: "10" },
    "setup-concurrency": { type: "string", default: "10" },
    "result-timeout-s": { type: "string", default: "900" },
    port: { type: "string", default: "3200" },
    "fake-port": { type: "string", default: "4010" },
    label: { type: "string", default: "" },
  },
});
const USERS = Number(args.users);
const PORT = Number(args.port);
const BASE = `http://localhost:${PORT}`;
const LABEL = args.label || `users${USERS}-image${args["image-ms"]}ms`;
const OUT = path.join(ROOT, "test-results", "stress");
const PHOTOS = path.join(os.tmpdir(), "mxva-stress-photos");
mkdirSync(OUT, { recursive: true });
mkdirSync(PHOTOS, { recursive: true });

const log = (line) => console.log(`[${new Date().toISOString().slice(11, 19)}] ${line}`);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// ─── A unique, machine-readable code on every buyer's photo ───
// Eight squares across the top of the 1200×1600 photo: seven bits of the buyer's number, then parity.
const CODE = { x0: 30, step: 145, size: 100, y: 20, bits: 7 };

function codeBits(n) {
  const bits = [];
  for (let i = CODE.bits - 1; i >= 0; i--) bits.push((n >> i) & 1);
  bits.push(bits.reduce((a, b) => a ^ b, 0));
  return bits;
}

async function makePhoto(n) {
  const file = path.join(PHOTOS, `buyer-${String(n).padStart(3, "0")}.jpg`);
  if (existsSync(file)) return file;
  const squares = codeBits(n)
    .map((bit, i) => `<rect x="${CODE.x0 + i * CODE.step}" y="${CODE.y}" width="${CODE.size}" height="${CODE.size}" fill="${bit ? "#ffffff" : "#000000"}"/>`)
    .join("");
  const svg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1600"><rect x="0" y="0" width="1200" height="${CODE.y * 2 + CODE.size}" fill="#808080"/>${squares}</svg>`);
  await sharp(path.join(ROOT, "e2e/fixtures/synthetic-front.jpg")).composite([{ input: svg, left: 0, top: 0 }]).jpeg({ quality: 90 }).toFile(file);
  return file;
}

/** Reads the code from an image whose given region is the buyer's photo, scaled to fill it. */
async function readCode(jpeg, region) {
  const { data, info } = await sharp(jpeg).greyscale().raw().toBuffer({ resolveWithObject: true });
  const sx = region.width / 1200;
  const sy = region.height / 1600;
  const bits = [];
  for (let i = 0; i <= CODE.bits; i++) {
    const cx = Math.round(region.left + (CODE.x0 + i * CODE.step + CODE.size / 2) * sx);
    const cy = Math.round(region.top + (CODE.y + CODE.size / 2) * sy);
    let sum = 0;
    let count = 0;
    for (let dy = -6; dy <= 6; dy++) {
      for (let dx = -6; dx <= 6; dx++) {
        sum += data[(cy + dy) * info.width + (cx + dx)];
        count++;
      }
    }
    bits.push(sum / count > 128 ? 1 : 0);
  }
  const parity = bits.slice(0, CODE.bits).reduce((a, b) => a ^ b, 0);
  if (parity !== bits[CODE.bits]) return null;
  return bits.slice(0, CODE.bits).reduce((n, bit) => (n << 1) | bit, 0);
}

/** The concept image inside a report PDF (the largest JPEG), and the buyer code on its "before" half. */
async function codeInPdf(bytes) {
  const doc = await PDFDocument.load(bytes);
  let best;
  for (const [, object] of doc.context.enumerateIndirectObjects()) {
    if (!(object instanceof PDFRawStream)) continue;
    if (object.dict.get(PDFName.of("Subtype")) !== PDFName.of("Image")) continue;
    if (object.dict.get(PDFName.of("Filter")) !== PDFName.of("DCTDecode")) continue;
    if (!best || object.contents.length > best.length) best = object.contents;
  }
  if (!best) return null;
  const meta = await sharp(Buffer.from(best)).metadata();
  return readCode(Buffer.from(best), { left: 0, top: 0, width: meta.width / 2, height: meta.height });
}

// ─── Server under test ───

function processTreeUsage(rootPid) {
  const rows = execFileSync("ps", ["-A", "-o", "pid=,ppid=,rss=,%cpu="], { encoding: "utf8" })
    .trim()
    .split("\n")
    .map((line) => line.trim().split(/\s+/).map(Number));
  const children = new Map();
  for (const [pid, ppid] of rows) children.set(ppid, [...(children.get(ppid) ?? []), pid]);
  const tree = new Set([rootPid]);
  const queue = [rootPid];
  while (queue.length) {
    for (const child of children.get(queue.shift()) ?? []) {
      if (tree.has(child)) continue;
      tree.add(child);
      queue.push(child);
    }
  }
  let rssKb = 0;
  let cpu = 0;
  for (const [pid, , rss, pcpu] of rows) {
    if (!tree.has(pid)) continue;
    rssKb += rss;
    cpu += pcpu;
  }
  return { rssMb: Math.round(rssKb / 1024), cpu: Math.round(cpu) };
}

async function startApp() {
  if (args["database-url"]) {
    execFileSync("node", ["scripts/migrate.mjs"], { cwd: ROOT, env: { ...process.env, DATABASE_URL: args["database-url"] }, stdio: "ignore" });
  }
  const fake = `http://127.0.0.1:${args["fake-port"]}`;
  const env = {
    ...process.env,
    NEXT_DIST_DIR: ".next-stress",
    NEXT_PUBLIC_APP_URL: BASE,
    NEXT_PUBLIC_ENABLE_REAL_PAYMENTS: "false",
    NEXT_PUBLIC_SHOW_DEV_PREVIEW: "true",
    // The real OpenAI and Resend code paths, pointed at the fake providers with fake keys.
    NEXT_PUBLIC_ENABLE_REAL_AI: "true",
    OPENAI_BASE_URL: `${fake}/v1`,
    RESEND_BASE_URL: fake,
    VISION_API_KEY: "sk-load-test-not-a-key",
    IMAGE_API_KEY: "sk-load-test-not-a-key",
    VISION_MODEL: "load-test-vision",
    IMAGE_EDIT_MODEL: "load-test-image",
    RESEND_API_KEY: "re_load_test_not_a_key",
    EMAIL_FROM: "MXVA <reports@example.com>",
    DATABASE_URL: args["database-url"],
    // Nothing leaves this machine.
    STRIPE_SECRET_KEY: "",
    ABACATEPAY_API_KEY: "",
    POSTHOG_PROJECT_API_KEY: "",
    META_PIXEL_ID: "",
    META_CAPI_ACCESS_TOKEN: "",
  };
  const child = spawn("npx", ["next", "dev", "--port", String(PORT)], { cwd: ROOT, env, detached: true, stdio: ["ignore", "pipe", "pipe"] });
  const serverLog = [];
  child.stdout.on("data", (chunk) => serverLog.push(String(chunk)));
  child.stderr.on("data", (chunk) => serverLog.push(String(chunk)));
  for (let i = 0; i < 180; i++) {
    try {
      const health = await (await fetch(`${BASE}/api/health`)).json();
      if (health.fulfillment !== "real") throw new Error(`fulfillment is ${health.fulfillment}, expected real (pointed at the fake providers)`);
      return { child, serverLog, health };
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("fulfillment is")) throw error;
      await sleep(1000);
    }
  }
  throw new Error("the app did not start in 180 s");
}

// ─── One buyer ───

async function onboard(page, user) {
  const cont = () => page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.goto(`${BASE}/start`);
  await page.getByRole("button", { name: "Start" }).click();
  await page.waitForURL("**/onboarding/photo-guide");
  await page.getByRole("button", { name: "Got it" }).click();
  await page.waitForURL("**/onboarding/photos");
  await page.locator('input[type="file"]').nth(1).setInputFiles(user.photo);
  await page.getByAltText("Your front photo").waitFor();
  await page.getByText("These are photos of me").click();
  await page.getByRole("button", { name: "Use these photos" }).click();
  await page.waitForURL("**/onboarding/constraints");
  await cont();
  await page.waitForURL("**/onboarding/delivery");
  await page.locator("#email").fill(user.email);
  await page.getByRole("checkbox", { name: /photos are sent/ }).check();
  await page.getByRole("checkbox", { name: /accept the Terms/ }).check();
  await cont();
  await page.waitForURL("**/onboarding/review");
  await page.getByRole("button", { name: "Continue to checkout" }).click();
  await page.waitForURL("**/checkout");
  await page.getByRole("button", { name: /Pay \$29 \(simulated\)/ }).waitFor({ timeout: 60_000 });
}

async function waitForResult(page, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (page.url().endsWith("/result")) {
      await page.getByRole("heading", { name: "Your concept and plan" }).waitFor({ timeout: 60_000 });
      return { ok: true };
    }
    const tryAgain = page.getByRole("button", { name: "Try again" });
    if (await tryAgain.isVisible().catch(() => false)) {
      const heading = await page.locator("h1").first().textContent().catch(() => "");
      const alert = await page.locator('[role="alert"]').first().textContent().catch(() => "");
      return { ok: false, error: `${heading?.trim()} | ${alert?.trim()}` };
    }
    await sleep(500);
  }
  const heading = await page.locator("h1").first().textContent().catch(() => "");
  return { ok: false, error: `timeout on ${new URL(page.url()).pathname}: ${heading?.trim()}` };
}

async function pool(items, limit, run) {
  const results = [];
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const index = next++;
        results[index] = await run(items[index], index);
      }
    }),
  );
  return results;
}

// ─── Buyers without a browser ───
// The same HTTP calls the checkout and processing pages make, recorded from the warm-up buyer's real
// browser and replayed with each buyer's own email and photo. They let one laptop put the full load on
// the server; the browser buyers show the interface keeps up.

function recordBrowserCalls(page) {
  const recorded = {};
  page.on("request", (request) => {
    if (request.method() !== "POST") return;
    const pathname = new URL(request.url()).pathname;
    if (pathname === "/api/orders") recorded.order = request.postDataJSON();
    if (pathname === "/api/fulfill") {
      const body = request.postDataBuffer()?.toString("latin1") ?? "";
      recorded.fulfillInput = /name="input"\r\n\r\n([^\r]*)\r\n/.exec(body)?.[1];
    }
  });
  return recorded;
}

async function protocolSetup(user, recorded) {
  const api = await request.newContext({ baseURL: BASE, extraHTTPHeaders: { "x-mxva-request": "1", origin: BASE, "sec-fetch-site": "same-origin" } });
  const options = await api.get("/api/checkout/options");
  if (!options.ok()) throw new Error(`checkout options ${options.status()}`);
  const order = await api.post("/api/orders", { data: { ...recorded.order, email: user.email } });
  if (!order.ok()) throw new Error(`create order ${order.status()} ${(await order.text()).slice(0, 120)}`);
  return api;
}

async function protocolPayAndFulfill(api, user, recorded, timeoutMs) {
  const pay = await api.post("/api/dev/mock-pay", { data: { outcome: "succeeded" } });
  if (!pay.ok()) return { ok: false, error: `pay ${pay.status()}` };
  const response = await api.post("/api/fulfill", {
    multipart: {
      front: { name: "front.jpg", mimeType: "image/jpeg", buffer: readFileSync(user.photo) },
      input: recorded.fulfillInput,
      faceProcessingConsent: "true",
    },
    timeout: timeoutMs,
  });
  if (!response.ok()) return { ok: false, error: `fulfill ${response.status()} ${(await response.text()).slice(0, 160)}` };
  const lines = (await response.text()).trim().split("\n").map((line) => JSON.parse(line));
  const last = lines.at(-1);
  if (last?.type === "error") return { ok: false, error: `${last.error.code}: ${last.error.message}` };
  if (last?.type !== "result") return { ok: false, error: "the stream ended without a result" };
  return { ok: true, emailNotice: last.emailDelivered, pdf: Buffer.from(last.pdf.base64, "base64"), phases: lines.filter((l) => l.type === "phase").map((l) => l.phase) };
}

// ─── Run ───

async function main() {
  const browserBuyers = Math.min(USERS, Number(args["browser-buyers"]));
  log(`stress run "${LABEL}": ${USERS} buyers (${browserBuyers} in Chrome, ${USERS - browserBuyers} over HTTP), AI latency vision=${args["vision-ms"]}ms image=${args["image-ms"]}ms qc=${args["qc-ms"]}ms jitter=${args.jitter}${args["image-limit"] ? `, image concurrency limit ${args["image-limit"]}` : ""}, database=${args["database-url"] ? "postgres" : "in-memory"}`);
  const fake = await startFakeProviders({
    port: Number(args["fake-port"]),
    visionMs: Number(args["vision-ms"]),
    imageMs: Number(args["image-ms"]),
    qcMs: Number(args["qc-ms"]),
    jitter: Number(args.jitter),
    imageConcurrencyLimit: args["image-limit"] ? Number(args["image-limit"]) : Infinity,
    log,
  });
  const app = await startApp();
  log(`app up on ${BASE} (health: payments=${app.health.payments}, fulfillment=${app.health.fulfillment})`);

  const users = await Promise.all(
    Array.from({ length: USERS + 1 }, async (_, i) => ({ n: i, email: `stress-${String(i).padStart(3, "0")}@example.com`, photo: await makePhoto(i) })),
  );
  const warmup = users.shift(); // buyer 0 compiles every route first; not measured
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const newPage = async () => {
    const context = await browser.newContext({ ...devices["Pixel 7"], locale: "en-US", timezoneId: "America/New_York", acceptDownloads: true });
    return { context, page: await context.newPage() };
  };

  try {
    log("warm-up buyer in Chrome (compiles the routes and records the calls a browser makes; not measured)");
    const w = await newPage();
    const recorded = recordBrowserCalls(w.page);
    await onboard(w.page, warmup);
    await w.page.getByRole("button", { name: /Pay \$29 \(simulated\)/ }).click();
    const warm = await waitForResult(w.page, 300_000);
    if (!warm.ok) throw new Error(`warm-up buyer failed: ${warm.error}`);
    await w.context.close();
    if (!recorded.order) throw new Error("could not record the browser's order call");
    // Chrome does not expose multipart bodies with files, so the report call's small JSON field is
    // rebuilt: what the browser sends when the buyer leaves the "what to avoid" step as it is.
    recorded.fulfillInput ??= JSON.stringify({ constraints: { avoid: [] }, timeZone: "America/New_York" });
    log(`recorded: order fields [${Object.keys(recorded.order).join(", ")}], report input ${recorded.fulfillInput}`);
    const baseline = { emails: fake.stats.emails.length, calls: { ...fake.stats.calls } };

    log(`setting up ${USERS} buyers (${args["setup-concurrency"]} at a time)`);
    const setupStart = Date.now();
    let parkedCount = 0;
    const sessions = await pool(users, Number(args["setup-concurrency"]), async (user, index) => {
      const kind = index < browserBuyers ? "browser" : "http";
      try {
        const session = kind === "browser" ? await newPage() : { api: await protocolSetup(user, recorded) };
        if (kind === "browser") await onboard(session.page, user);
        if (++parkedCount % 20 === 0) log(`${parkedCount} buyers on checkout`);
        return { ...session, kind, user, ready: true };
      } catch (error) {
        const setupError = error instanceof Error ? error.message.split("\n")[0] : String(error);
        log(`buyer ${user.n} (${kind}) setup failed: ${setupError}`);
        return { kind, user, ready: false, setupError };
      }
    });
    const ready = sessions.filter((s) => s.ready);
    log(`${ready.length}/${USERS} buyers on checkout after ${Math.round((Date.now() - setupStart) / 1000)} s`);

    // Sample the server while the burst runs.
    const samples = [];
    const sampler = setInterval(() => {
      try {
        samples.push({ t: Date.now(), ...processTreeUsage(app.child.pid), inFlight: { ...fake.stats.inFlight }, load: os.loadavg()[0] });
      } catch {
        // ps can fail transiently; skip the sample
      }
    }, 1000);

    const timeoutMs = Number(args["result-timeout-s"]) * 1000;
    log(`all ${ready.length} buyers pay now`);
    const t0 = Date.now();
    const outcomes = await Promise.all(
      ready.map(async (s) => {
        const clickedAt = Date.now();
        const outcome = { n: s.user.n, kind: s.kind, email: s.user.email, clickOffsetMs: clickedAt - t0 };
        if (s.kind === "http") {
          const result = await protocolPayAndFulfill(s.api, s.user, recorded, timeoutMs).catch((error) => ({ ok: false, error: String(error).split("\n")[0] }));
          Object.assign(outcome, { seconds: (Date.now() - clickedAt) / 1000, ok: result.ok, error: result.error, emailNotice: result.emailNotice, phases: result.phases });
          if (result.pdf) {
            outcome.pdfKb = Math.round(result.pdf.length / 1024);
            outcome.pdfCode = await codeInPdf(result.pdf).catch(() => null);
          }
          await s.api.dispose();
          return outcome;
        }
        await s.page.getByRole("button", { name: /Pay \$29 \(simulated\)/ }).click();
        const result = await waitForResult(s.page, timeoutMs);
        Object.assign(outcome, { seconds: (Date.now() - clickedAt) / 1000, ...result });
        if (!result.ok) {
          await s.page.screenshot({ path: path.join(OUT, `${LABEL}-buyer-${s.user.n}.png`) }).catch(() => undefined);
          return outcome;
        }
        outcome.emailNotice = await s.page.getByText("Also sent to your email").isVisible().catch(() => false);
        const link = s.page.getByRole("link", { name: /Download PDF/ });
        const [download] = await Promise.all([s.page.waitForEvent("download"), link.click()]);
        const bytes = readFileSync(await download.path());
        outcome.pdfKb = Math.round(bytes.length / 1024);
        outcome.pdfCode = bytes.subarray(0, 5).toString() === "%PDF-" ? await codeInPdf(bytes) : null;
        await s.context.close();
        return outcome;
      }),
    );
    const burstSeconds = (Date.now() - t0) / 1000;
    clearInterval(sampler);
    log(`burst finished in ${burstSeconds.toFixed(1)} s`);

    // Emails sent during the burst: exactly one per buyer, to their own address, with their own report.
    const burstEmails = fake.stats.emails.slice(baseline.emails);
    const byAddress = new Map();
    for (const mail of burstEmails) byAddress.set(mail.to, [...(byAddress.get(mail.to) ?? []), mail]);
    for (const outcome of outcomes) {
      const mails = byAddress.get(outcome.email) ?? [];
      outcome.emails = mails.length;
      outcome.emailCode = mails[0] ? await codeInPdf(mails[0].pdf).catch(() => null) : null;
    }

    const ok = outcomes.filter((o) => o.ok);
    const stats = (list) => {
      const times = list.map((o) => o.seconds).sort((a, b) => a - b);
      const pct = (p) => (times.length ? times[Math.min(times.length - 1, Math.floor((p / 100) * times.length))] : null);
      return { count: times.length, min: times[0] ?? null, p50: pct(50), p90: pct(90), p99: pct(99), max: times.at(-1) ?? null };
    };
    const summary = {
      label: LABEL,
      date: new Date().toISOString(),
      machine: `${os.cpus().length} CPU, ${Math.round(os.totalmem() / 2 ** 30)} GB RAM, ${os.platform()} ${os.release()}`,
      setup: "next dev (one Node process), fake OpenAI + Resend, simulated payment",
      database: args["database-url"] ? "PostgreSQL (local)" : "in-memory",
      latencyMs: { vision: Number(args["vision-ms"]), image: Number(args["image-ms"]), qc: Number(args["qc-ms"]), jitter: Number(args.jitter) },
      imageConcurrencyLimit: args["image-limit"] ? Number(args["image-limit"]) : null,
      buyers: USERS,
      browserBuyers,
      httpBuyers: USERS - browserBuyers,
      parked: ready.length,
      setupFailures: sessions.filter((s) => !s.ready).map((s) => ({ n: s.user.n, kind: s.kind, error: s.setupError })),
      clickSpreadMs: Math.max(...outcomes.map((o) => o.clickOffsetMs)),
      reportsDelivered: ok.length,
      reportsDeliveredInBrowser: ok.filter((o) => o.kind === "browser").length,
      failures: outcomes.filter((o) => !o.ok).map((o) => ({ n: o.n, kind: o.kind, error: o.error, seconds: o.seconds })),
      ownPhotoInPdf: ok.filter((o) => o.pdfCode === o.n).length,
      wrongPhotoInPdf: ok.filter((o) => o.pdfCode !== null && o.pdfCode !== o.n).map((o) => ({ n: o.n, found: o.pdfCode })),
      unreadablePdfCode: ok.filter((o) => o.pdfCode === null || o.pdfCode === undefined).map((o) => o.n),
      emailNoticeShown: ok.filter((o) => o.emailNotice).length,
      exactlyOneEmail: outcomes.filter((o) => o.emails === 1).length,
      duplicateEmails: outcomes.filter((o) => o.emails > 1).map((o) => ({ n: o.n, emails: o.emails })),
      ownPhotoInEmail: outcomes.filter((o) => o.emailCode === o.n).length,
      wrongPhotoInEmail: outcomes.filter((o) => o.emailCode !== null && o.emailCode !== undefined && o.emailCode !== o.n).map((o) => ({ n: o.n, found: o.emailCode })),
      strayEmails: burstEmails.filter((m) => !outcomes.some((o) => o.email === m.to)).length,
      secondsToReport: stats(ok),
      secondsToReportInBrowser: stats(ok.filter((o) => o.kind === "browser")),
      burstSeconds,
      providerCalls: Object.fromEntries(Object.entries(fake.stats.calls).map(([k, v]) => [k, v - (baseline.calls[k] ?? 0)])),
      rateLimitedImageCalls: fake.stats.rateLimited,
      maxConcurrentAiCalls: fake.stats.maxInFlight,
      server: {
        peakRssMb: Math.max(...samples.map((s) => s.rssMb)),
        peakCpuPercent: Math.max(...samples.map((s) => s.cpu)),
        avgCpuPercent: Math.round(samples.reduce((a, s) => a + s.cpu, 0) / Math.max(1, samples.length)),
        peakLoadAvg: Math.max(...samples.map((s) => s.load)),
      },
      serverErrors: app.serverLog.join("").split("\n").filter((line) => /error|unhandled|ECONN|timeout/i.test(line)).slice(0, 20),
    };
    writeFileSync(path.join(OUT, `${LABEL}.json`), JSON.stringify({ summary, outcomes, samples }, null, 2));
    writeFileSync(path.join(OUT, `${LABEL}-server.log`), app.serverLog.join(""));
    console.log(JSON.stringify(summary, null, 2));
  } finally {
    await browser.close().catch(() => undefined);
    try {
      process.kill(-app.child.pid, "SIGTERM");
    } catch {
      // already gone
    }
    await fake.close();
  }
}

main().then(
  () => process.exit(0),
  (error) => {
    console.error(error);
    process.exit(1);
  },
);
