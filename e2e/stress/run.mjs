// Load test of the report queue: N buyers park on the checkout page and all pay at the same moment.
// Each request must be accepted at once (the page says "it arrives by email in about X minutes");
// the server's queue then makes the reports, at most --concurrency at a time, retries failures and
// emails every buyer: their report, or a link to create it again (and an alert to the owner).
// A few buyers use a real Chrome through the interface; the rest make the same HTTP calls the browser
// makes (recorded from a real browser run), so one laptop can carry the load. OpenAI and Resend are
// replaced by e2e/stress/fake-providers.mjs (no credits, no real emails); payments are the dev
// simulator. Every buyer's photo carries a unique code, and the run checks that each emailed PDF
// carries its own buyer's photo and nobody else's.
//
//   node e2e/stress/run.mjs --users 100 [--browser-buyers 10] [--concurrency 4]
//        [--vision-ms 15000 --image-ms 100000 --qc-ms 10000 --jitter 0.2]
//        [--image-limit 20 --retry-after-s 20] [--fail-rate 0.1] [--retry-delay-ms 2000]
//        [--database-url postgres://…] [--label name]
//
// Results: stress-results/<label>.json (kept out of test-results, which Playwright clears)
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
    concurrency: { type: "string", default: "4" },
    "retry-delay-ms": { type: "string", default: "2000" },
    "retry-after-s": { type: "string", default: "20" },
    "fail-rate": { type: "string", default: "0" },
    "complete-timeout-s": { type: "string", default: "3600" },
    "setup-concurrency": { type: "string", default: "10" },
    "accept-timeout-s": { type: "string", default: "120" },
    port: { type: "string", default: "3200" },
    "fake-port": { type: "string", default: "4010" },
    label: { type: "string", default: "" },
  },
});
const USERS = Number(args.users);
const PORT = Number(args.port);
const BASE = `http://localhost:${PORT}`;
const LABEL = args.label || `users${USERS}-image${args["image-ms"]}ms`;
const OUT = path.join(ROOT, "stress-results");
const PHOTOS = path.join(os.tmpdir(), "mxva-stress-photos");
mkdirSync(OUT, { recursive: true });
mkdirSync(PHOTOS, { recursive: true });

const OWNER = "owner@example.com";
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
    // The queue under test, and where its failure alerts go (the fake mail server).
    FULFILLMENT_CONCURRENCY: args.concurrency,
    FULFILLMENT_RETRY_DELAY_MS: args["retry-delay-ms"],
    OWNER_ALERT_EMAIL: OWNER,
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

/** Waits for the page to confirm the request ("Request received … in about X minutes"). */
async function waitForAccepted(page, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  const received = page.getByRole("heading", { name: /Request received/ });
  while (Date.now() < deadline) {
    if (await received.isVisible().catch(() => false)) {
      const text = (await received.textContent()) ?? "";
      const match = /about (a|\d+) minute/.exec(text);
      const etaMinutes = match ? (match[1] === "a" ? 1 : Number(match[1])) : null;
      const line = await page.getByText(/You're number \d+ in line/).textContent().catch(() => null);
      const position = line ? Number(/number (\d+)/.exec(line)?.[1]) : 0;
      return { ok: true, etaMinutes, position };
    }
    const failed = page.getByRole("heading", { name: /We couldn't send your photo|didn't finish|We need to help/ });
    if (await failed.isVisible().catch(() => false)) {
      const alert = await page.locator('[role="alert"]').first().textContent().catch(() => "");
      return { ok: false, error: `${(await failed.textContent())?.trim()} | ${alert?.trim()}` };
    }
    await sleep(250);
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

async function protocolPayAndRequest(api, user, recorded, timeoutMs) {
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
  if (response.status() !== 202) return { ok: false, error: `request ${response.status()} ${(await response.text()).slice(0, 160)}` };
  const { queue } = await response.json();
  return { ok: true, etaMinutes: queue.etaMinutes, position: queue.position };
}

// ─── Run ───

async function main() {
  const browserBuyers = Math.min(USERS, Number(args["browser-buyers"]));
  log(`stress run "${LABEL}": ${USERS} buyers (${browserBuyers} in Chrome, ${USERS - browserBuyers} over HTTP), queue concurrency ${args.concurrency}, fail rate ${args["fail-rate"]}, AI latency vision=${args["vision-ms"]}ms image=${args["image-ms"]}ms qc=${args["qc-ms"]}ms jitter=${args.jitter}${args["image-limit"] ? `, image concurrency limit ${args["image-limit"]}` : ""}, database=${args["database-url"] ? "postgres" : "in-memory"}`);
  const fake = await startFakeProviders({
    port: Number(args["fake-port"]),
    visionMs: Number(args["vision-ms"]),
    imageMs: Number(args["image-ms"]),
    qcMs: Number(args["qc-ms"]),
    jitter: Number(args.jitter),
    imageConcurrencyLimit: args["image-limit"] ? Number(args["image-limit"]) : Infinity,
    retryAfterSeconds: Number(args["retry-after-s"]),
    failRate: Number(args["fail-rate"]),
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
    const warm = await waitForAccepted(w.page, 120_000);
    if (!warm.ok) throw new Error(`warm-up buyer failed: ${warm.error}`);
    for (let i = 0; i < 600 && !fake.stats.emails.some((m) => m.to === warmup.email); i++) await sleep(1000);
    if (!fake.stats.emails.some((m) => m.to === warmup.email)) throw new Error("the warm-up buyer never got an email");
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

    // Sample the server while the burst and the queue run.
    const samples = [];
    const sampler = setInterval(() => {
      try {
        samples.push({ t: Date.now(), ...processTreeUsage(app.child.pid), inFlight: { ...fake.stats.inFlight }, load: os.loadavg()[0] });
      } catch {
        // ps can fail transiently; skip the sample
      }
    }, 1000);

    const acceptTimeout = Number(args["accept-timeout-s"]) * 1000;
    log(`all ${ready.length} buyers pay now`);
    const t0 = Date.now();
    const outcomes = await Promise.all(
      ready.map(async (s) => {
        const clickedAt = Date.now();
        const outcome = { n: s.user.n, kind: s.kind, email: s.user.email, clickOffsetMs: clickedAt - t0, clickedAt };
        let result;
        if (s.kind === "http") {
          result = await protocolPayAndRequest(s.api, s.user, recorded, acceptTimeout).catch((error) => ({ ok: false, error: String(error).split("\n")[0] }));
          await s.api.dispose();
        } else {
          await s.page.getByRole("button", { name: /Pay \$29 \(simulated\)/ }).click();
          result = await waitForAccepted(s.page, acceptTimeout);
          if (!result.ok) await s.page.screenshot({ path: path.join(OUT, `${LABEL}-buyer-${s.user.n}.png`) }).catch(() => undefined);
        }
        return Object.assign(outcome, { acceptSeconds: (Date.now() - clickedAt) / 1000, accepted: result.ok, acceptError: result.error, etaMinutes: result.etaMinutes, position: result.position });
      }),
    );
    const accepted = outcomes.filter((o) => o.accepted);
    log(`${accepted.length}/${outcomes.length} requests accepted; slowest answer ${Math.max(...outcomes.map((o) => o.acceptSeconds)).toFixed(1)} s`);

    // The queue works through them: wait until every accepted buyer has their report or a "create it again" email.
    const settled = (o) => fake.stats.emails.some((m) => m.to === o.email && m.at >= t0);
    const completeDeadline = Date.now() + Number(args["complete-timeout-s"]) * 1000;
    let lastLog = 0;
    while (Date.now() < completeDeadline && !accepted.every(settled)) {
      if (Date.now() - lastLog > 30_000) {
        lastLog = Date.now();
        log(`${accepted.filter(settled).length}/${accepted.length} buyers emailed; queue in flight: image ${fake.stats.inFlight.image}`);
      }
      await sleep(1000);
    }
    const queueSeconds = (Date.now() - t0) / 1000;
    clearInterval(sampler);
    log(`queue finished in ${queueSeconds.toFixed(1)} s`);

    // Browser buyers who kept the page open see that the email went out (or that it didn't finish).
    for (const s of ready.filter((r) => r.kind === "browser")) {
      const outcome = outcomes.find((o) => o.n === s.user.n);
      outcome.pageSaysEmailed = await s.page
        .getByRole("heading", { name: /Your report is in your email|didn't finish/ })
        .waitFor({ timeout: 20_000 })
        .then(() => true, () => false);
      await s.context.close();
    }

    // What each buyer received: exactly one email, with their own photo in the PDF, or a link to try again.
    const burstEmails = fake.stats.emails.filter((m) => m.at >= t0);
    for (const outcome of outcomes) {
      const mails = burstEmails.filter((m) => m.to === outcome.email);
      const reports = mails.filter((m) => m.pdf);
      const notices = mails.filter((m) => !m.pdf);
      outcome.reportEmails = reports.length;
      outcome.noticeEmails = notices.length;
      outcome.noticeHasLink = notices.some((m) => /\/resume\?t=/.test(m.text));
      outcome.emailCode = reports[0] ? await codeInPdf(reports[0].pdf).catch(() => null) : null;
      outcome.emailedAfterSeconds = mails[0] ? (mails[0].at - outcome.clickedAt) / 1000 : null;
    }
    const alerts = burstEmails.filter((m) => m.to === OWNER);
    const alertFor = (email) => alerts.filter((m) => m.text.includes(email));

    const reported = outcomes.filter((o) => o.reportEmails === 1 && o.noticeEmails === 0);
    const failedOver = outcomes.filter((o) => o.reportEmails === 0 && o.noticeEmails === 1);
    const stats = (values) => {
      const sorted = values.filter((v) => typeof v === "number").sort((a, b) => a - b);
      const pct = (p) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))] : null);
      return { count: sorted.length, min: sorted[0] ?? null, p50: pct(50), p90: pct(90), max: sorted.at(-1) ?? null };
    };
    const estimateError = reported
      .filter((o) => o.etaMinutes)
      .map((o) => ({ estimated: o.etaMinutes, actual: o.emailedAfterSeconds / 60 }));
    const summary = {
      label: LABEL,
      date: new Date().toISOString(),
      machine: `${os.cpus().length} CPU, ${Math.round(os.totalmem() / 2 ** 30)} GB RAM, ${os.platform()} ${os.release()}`,
      setup: "next dev (one Node process), fake OpenAI + Resend, simulated payment",
      database: args["database-url"] ? "PostgreSQL (local)" : "in-memory",
      concurrency: Number(args.concurrency),
      latencyMs: { vision: Number(args["vision-ms"]), image: Number(args["image-ms"]), qc: Number(args["qc-ms"]), jitter: Number(args.jitter) },
      imageConcurrencyLimit: args["image-limit"] ? Number(args["image-limit"]) : null,
      failRate: Number(args["fail-rate"]),
      buyers: USERS,
      browserBuyers,
      httpBuyers: USERS - browserBuyers,
      parked: ready.length,
      setupFailures: sessions.filter((s) => !s.ready).map((s) => ({ n: s.user.n, kind: s.kind, error: s.setupError })),
      clickSpreadMs: Math.max(...outcomes.map((o) => o.clickOffsetMs)),
      accepted: accepted.length,
      acceptFailures: outcomes.filter((o) => !o.accepted).map((o) => ({ n: o.n, kind: o.kind, error: o.acceptError })),
      acceptSeconds: stats(outcomes.map((o) => o.acceptSeconds)),
      positionsShown: stats(outcomes.map((o) => o.position)),
      reportsEmailed: reported.length,
      ownPhotoInEmail: reported.filter((o) => o.emailCode === o.n).length,
      wrongPhotoInEmail: reported.filter((o) => o.emailCode !== null && o.emailCode !== o.n).map((o) => ({ n: o.n, found: o.emailCode })),
      failedWithNotice: failedOver.length,
      noticesWithLink: failedOver.filter((o) => o.noticeHasLink).length,
      failedWithOwnerAlert: failedOver.filter((o) => alertFor(o.email).length === 1).length,
      leftWithoutEmail: outcomes.filter((o) => o.accepted && o.reportEmails + o.noticeEmails === 0).map((o) => o.n),
      duplicateEmails: outcomes.filter((o) => o.reportEmails + o.noticeEmails > 1).map((o) => ({ n: o.n, reports: o.reportEmails, notices: o.noticeEmails })),
      strayEmails: burstEmails.filter((m) => m.to !== OWNER && !outcomes.some((o) => o.email === m.to)).length,
      ownerAlerts: alerts.length,
      alertsWithImageData: alerts.filter((m) => /data:image|base64,|\/9j\/|[A-Za-z0-9+/]{200,}/.test(m.text + m.html)).length,
      alertSample: alerts[0] ? { subject: alerts[0].subject, text: alerts[0].text.slice(0, 1500) } : null,
      browserPagesSawOutcome: outcomes.filter((o) => o.kind === "browser" && o.pageSaysEmailed).length,
      minutesToEmail: stats(outcomes.map((o) => (o.emailedAfterSeconds === null ? null : o.emailedAfterSeconds / 60))),
      estimateVsActual: {
        underestimated: estimateError.filter((e) => e.actual > e.estimated + 1).length,
        withinOrEarly: estimateError.filter((e) => e.actual <= e.estimated + 1).length,
        samples: estimateError.filter((_, i) => i % Math.max(1, Math.floor(estimateError.length / 10)) === 0).map((e) => ({ estimated: e.estimated, actual: Number(e.actual.toFixed(1)) })),
      },
      queueSeconds,
      providerCalls: Object.fromEntries(Object.entries(fake.stats.calls).map(([k, v]) => [k, v - (baseline.calls[k] ?? 0)])),
      rateLimitedImageCalls: fake.stats.rateLimited,
      failedImageCalls: fake.stats.failed,
      maxConcurrentAiCalls: fake.stats.maxInFlight,
      server: {
        peakRssMb: Math.max(...samples.map((s) => s.rssMb)),
        peakCpuPercent: Math.max(...samples.map((s) => s.cpu)),
        avgCpuPercent: Math.round(samples.reduce((a, s) => a + s.cpu, 0) / Math.max(1, samples.length)),
        peakLoadAvg: Math.max(...samples.map((s) => s.load)),
      },
      serverErrors: app.serverLog.join("").split("\n").filter((line) => /error|unhandled|timeout/i.test(line) && !/aborted|ECONNRESET/.test(line)).slice(0, 20),
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
