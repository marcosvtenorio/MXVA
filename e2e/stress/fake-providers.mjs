// Stand-ins for OpenAI (Responses API) and Resend, for load tests. The app's real provider code runs
// unchanged and reaches this server through OPENAI_BASE_URL and RESEND_BASE_URL, so no test spends
// AI credits or sends a real email. Latency, jitter and an optional OpenAI-style rate limit are set
// per run, so a test can model how the real services behave under load.
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import sharp from "sharp";

const CONSULTATION = `## Your glow-up, explained

### Highest-impact changes

**1. Hair (cut and shape)**
- A **textured crop** with tidy, tapered sides, so the top carries the volume.
- Keeps your natural hairline and part.

**2. Brows**
- Clean up the strays under the arch and between the brows only.

**3. Skin**
- Even out the tone with a light moisturiser and SPF in the morning.

---

### Annotations on your before and after
- **Hair:** shorter sides, more texture on top.
- **Brows:** cleaner lines, same shape.
- **Skin:** more even tone, real texture kept.

These are styling changes only: your features stay the same.`;

const OBSERVATIONS = {
  imageQuality: { usable: true, faceCount: 1, lightingLimitations: "Load-test stand-in: no real model was called." },
  possibleMinor: false,
  glowUp: {
    facialHair: "sharpen_lines",
    skin: { blemishes: true, redness: false, unevenTone: true, shine: false },
    browsNeedGrooming: true,
    eyesLookTired: false,
    teethVisible: false,
    jawSoftTissue: "some_fullness",
  },
  observations: [
    { area: "skin", observation: "Load test: skin tone looks slightly uneven in this light.", confidence: "low" },
    { area: "brows", observation: "Load test: a few stray hairs at the inner edges of the brows.", confidence: "low" },
    { area: "hair", observation: "Load test: hair sits flat on the sides with more length on top.", confidence: "low" },
  ],
  cannotAssess: ["Load-test stand-in: nothing about this photo was analysed."],
};

const QC_VERDICT = {
  comparison: true,
  sameAdultPersonLikely: true,
  addedPeopleOrFeatures: false,
  brokenEyesOrTeeth: false,
  excludedChanges: false,
  notes: "Load-test stand-in.",
};

/**
 * @param {{ port?: number, visionMs?: number, imageMs?: number, qcMs?: number, jitter?: number,
 *           imageConcurrencyLimit?: number, log?: (line: string) => void }} options
 */
export function startFakeProviders(options = {}) {
  const { port = 4010, visionMs = 0, imageMs = 0, qcMs = 0, jitter = 0, imageConcurrencyLimit = Infinity } = options;
  const stats = {
    calls: { vision: 0, image: 0, qc: 0, email: 0, unknown: 0 },
    rateLimited: 0,
    inFlight: { vision: 0, image: 0, qc: 0 },
    maxInFlight: { vision: 0, image: 0, qc: 0 },
    /** Every email the app sent: recipient, idempotency key and the attached PDF. */
    emails: [],
  };

  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms * (1 + (Math.random() * 2 - 1) * jitter)));

  async function readJson(req) {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  }

  function send(res, status, body, headers = {}) {
    res.writeHead(status, { "content-type": "application/json", ...headers });
    res.end(JSON.stringify(body));
  }

  function inputImages(body) {
    const content = body.input?.[0]?.content ?? [];
    return content
      .filter((part) => part.type === "input_image")
      .map((part) => Buffer.from(String(part.image_url).replace(/^data:image\/\w+;base64,/, ""), "base64"));
  }

  /** An annotated before and after made from the buyer's own photo, like the real model's output. */
  async function comparisonImage(front) {
    const half = { width: 768, height: 1024 };
    const before = await sharp(front).rotate().resize({ ...half, fit: "fill" }).toBuffer();
    const after = await sharp(front).rotate().resize({ ...half, fit: "fill" }).modulate({ brightness: 1.04, saturation: 1.08 }).toBuffer();
    const labels = Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="1536" height="1024">
        <rect x="0" y="940" width="1536" height="84" fill="rgba(0,0,0,0.6)"/>
        <text x="384" y="995" font-family="Helvetica" font-size="40" fill="#fff" text-anchor="middle">BEFORE</text>
        <text x="1152" y="995" font-family="Helvetica" font-size="40" fill="#fff" text-anchor="middle">AFTER (load test)</text>
      </svg>`,
    );
    return sharp({ create: { width: 1536, height: 1024, channels: 3, background: "#222" } })
      .composite([
        { input: before, left: 0, top: 0 },
        { input: after, left: 768, top: 0 },
        { input: labels, left: 0, top: 0 },
      ])
      .jpeg({ quality: 85 })
      .toBuffer();
  }

  function response(model, output) {
    return {
      id: `resp_${randomUUID()}`,
      object: "response",
      created_at: Math.floor(Date.now() / 1000),
      status: "completed",
      model,
      output,
      parallel_tool_calls: true,
      tool_choice: "auto",
      tools: [],
      usage: { input_tokens: 1000, output_tokens: 500, total_tokens: 1500 },
    };
  }

  const message = (text) => ({
    id: `msg_${randomUUID()}`,
    type: "message",
    role: "assistant",
    status: "completed",
    content: [{ type: "output_text", text, annotations: [] }],
  });

  async function handleResponses(req, res) {
    const body = await readJson(req);
    const isImage = (body.tools ?? []).some((tool) => tool.type === "image_generation");
    const format = body.text?.format?.name;
    const kind = isImage ? "image" : format === "visual_observations" ? "vision" : format === "identity_qc" ? "qc" : "unknown";
    stats.calls[kind]++;
    if (kind === "unknown") return send(res, 400, { error: { message: "unknown request", type: "invalid_request_error" } });

    if (kind === "image" && stats.inFlight.image >= imageConcurrencyLimit) {
      stats.rateLimited++;
      return send(
        res,
        429,
        { error: { message: "Rate limit reached for images (load-test stand-in).", type: "requests", code: "rate_limit_exceeded" } },
        { "retry-after": "20" },
      );
    }

    stats.inFlight[kind]++;
    stats.maxInFlight[kind] = Math.max(stats.maxInFlight[kind], stats.inFlight[kind]);
    try {
      if (kind === "vision") {
        await wait(visionMs);
        return send(res, 200, response(body.model, [message(JSON.stringify(OBSERVATIONS))]));
      }
      if (kind === "qc") {
        await wait(qcMs);
        return send(res, 200, response(body.model, [message(JSON.stringify(QC_VERDICT))]));
      }
      const [front] = inputImages(body);
      const [image] = await Promise.all([comparisonImage(front), wait(imageMs)]);
      return send(
        res,
        200,
        response(body.model, [
          { id: `ig_${randomUUID()}`, type: "image_generation_call", status: "completed", result: image.toString("base64") },
          message(CONSULTATION),
        ]),
      );
    } finally {
      stats.inFlight[kind]--;
    }
  }

  async function handleEmail(req, res) {
    const body = await readJson(req);
    stats.calls.email++;
    const attachment = body.attachments?.[0];
    const content = attachment?.content;
    const pdf =
      typeof content === "string"
        ? Buffer.from(content, "base64")
        : content?.type === "Buffer"
          ? Buffer.from(content.data)
          : Array.isArray(content)
            ? Buffer.from(content)
            : Buffer.alloc(0);
    const to = Array.isArray(body.to) ? body.to[0] : body.to;
    stats.emails.push({ to, idempotencyKey: req.headers["idempotency-key"] ?? null, pdf });
    send(res, 200, { id: `fake_email_${randomUUID()}` });
  }

  const server = createServer((req, res) => {
    const route = req.method === "POST" && req.url?.startsWith("/v1/responses") ? handleResponses : req.method === "POST" && req.url?.startsWith("/emails") ? handleEmail : null;
    if (!route) return send(res, 404, { error: { message: "not found" } });
    route(req, res).catch((error) => {
      options.log?.(`[fake-providers] ${error instanceof Error ? error.message : String(error)}`);
      if (!res.headersSent) send(res, 500, { error: { message: "fake provider failure", type: "server_error" } });
    });
  });
  server.keepAliveTimeout = 120_000;
  server.requestTimeout = 0;

  return new Promise((resolve) => {
    server.listen(port, "127.0.0.1", () => resolve({ stats, close: () => new Promise((done) => server.close(() => done())) }));
  });
}
