// Generates SYNTHETIC test photos (vector-drawn faces, never a real person) and
// malformed files for upload tests. Run: node scripts/generate-fixtures.mjs
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const out = fileURLToPath(new URL("../e2e/fixtures/", import.meta.url));
await mkdir(out, { recursive: true });

const W = 1200;
const H = 1600;

function face({ turn = 0, light = 1 }) {
  // turn: -1 left profile … 0 front … 1 right profile (a simple horizontal offset)
  const cx = 600 + turn * 120;
  const eyeShift = turn * 60;
  const skin = `rgb(${Math.round(196 * light)},${Math.round(150 * light)},${Math.round(120 * light)})`;
  const skinShade = `rgb(${Math.round(160 * light)},${Math.round(116 * light)},${Math.round(92 * light)})`;
  const bg1 = `rgb(${Math.round(120 * light)},${Math.round(132 * light)},${Math.round(140 * light)})`;
  const bg2 = `rgb(${Math.round(70 * light)},${Math.round(78 * light)},${Math.round(86 * light)})`;
  const hair = `rgb(${Math.round(48 * light)},${Math.round(36 * light)},${Math.round(30 * light)})`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${bg1}"/><stop offset="1" stop-color="${bg2}"/></linearGradient>
    <radialGradient id="skin" cx="0.45" cy="0.4" r="0.7"><stop offset="0" stop-color="${skin}"/><stop offset="1" stop-color="${skinShade}"/></radialGradient>
    <filter id="grain"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="7"/><feColorMatrix type="saturate" values="0"/><feComponentTransfer><feFuncA type="table" tableValues="0 ${(0.18 * light).toFixed(3)}"/></feComponentTransfer></filter>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <path d="M${cx - 330} 1600 C ${cx - 300} 1250, ${cx + 300} 1250, ${cx + 330} 1600 Z" fill="rgb(${Math.round(52 * light)},${Math.round(64 * light)},${Math.round(80 * light)})"/>
  <rect x="${cx - 90}" y="1020" width="180" height="200" rx="60" fill="${skinShade}"/>
  <ellipse cx="${cx}" cy="760" rx="${280 - Math.abs(turn) * 40}" ry="370" fill="url(#skin)"/>
  <path d="M${cx - 300} 700 C ${cx - 320} 360, ${cx + 320} 330, ${cx + 300} 690 C ${cx + 250} 520, ${cx - 200} 480, ${cx - 300} 700 Z" fill="${hair}"/>
  <path d="M${cx - 170 + eyeShift} 640 q 70 -30 130 0" stroke="${hair}" stroke-width="18" fill="none" stroke-linecap="round"/>
  <path d="M${cx + 40 + eyeShift} 640 q 70 -30 130 0" stroke="${hair}" stroke-width="18" fill="none" stroke-linecap="round"/>
  <ellipse cx="${cx - 105 + eyeShift}" cy="700" rx="46" ry="22" fill="#f4f1ec"/>
  <ellipse cx="${cx + 105 + eyeShift}" cy="700" rx="46" ry="22" fill="#f4f1ec"/>
  <circle cx="${cx - 105 + eyeShift * 1.2}" cy="700" r="17" fill="#3b2a20"/>
  <circle cx="${cx + 105 + eyeShift * 1.2}" cy="700" r="17" fill="#3b2a20"/>
  <path d="M${cx + eyeShift * 1.4} 720 q -30 110 -10 140 q 20 12 45 0" stroke="${skinShade}" stroke-width="10" fill="none" stroke-linecap="round"/>
  <path d="M${cx - 90 + eyeShift} 960 q ${90} 40 180 0" stroke="rgb(150,80,76)" stroke-width="16" fill="none" stroke-linecap="round"/>
  <rect width="${W}" height="${H}" filter="url(#grain)"/>
</svg>`;
}

async function render(svg, file, format = "jpeg", resize) {
  let pipeline = sharp(Buffer.from(svg));
  if (resize) pipeline = pipeline.resize(resize.width, resize.height);
  pipeline = format === "png" ? pipeline.png() : format === "webp" ? pipeline.webp({ quality: 85 }) : pipeline.jpeg({ quality: 88 });
  await pipeline.toFile(out + file);
  return file;
}

const written = [];
written.push(await render(face({ turn: 0 }), "synthetic-front.jpg"));
written.push(await render(face({ turn: -1 }), "synthetic-left.jpg"));
written.push(await render(face({ turn: 1 }), "synthetic-right.jpg"));
written.push(await render(face({ turn: 0 }), "synthetic-front.png", "png", { width: 900, height: 1200 }));
written.push(await render(face({ turn: 0 }), "synthetic-front.webp", "webp", { width: 900, height: 1200 }));
written.push(await render(face({ turn: 0 }), "too-small.jpg", "jpeg", { width: 300, height: 400 }));
written.push(await render(face({ turn: 0, light: 0.12 }), "too-dark.jpg"));

// Uniform grey: no detail at all (blocked as "can't make out a face").
await sharp({ create: { width: 900, height: 1200, channels: 3, background: { r: 128, g: 128, b: 128 } } })
  .png()
  .toFile(out + "blank.png");
written.push("blank.png");

// A text file pretending to be a JPEG.
await writeFile(out + "not-an-image.jpg", "This is plain text, not a photo.\n");
written.push("not-an-image.jpg");

// Real JPEG bytes behind a .png name.
await sharp(Buffer.from(face({ turn: 0 }))).resize(600, 800).jpeg().toFile(out + "disguised.png");
written.push("disguised.png");

// EXIF-tagged JPEG (orientation 6 = rotate 90° CW, plus a fake camera model) to prove stripping.
await sharp(Buffer.from(face({ turn: 0 })))
  .resize(1600, 1200)
  .withMetadata({ orientation: 6, exif: { IFD0: { Make: "SyntheticCam", Model: "FixtureModel-123" } } })
  .jpeg({ quality: 85 })
  .toFile(out + "exif-rotated.jpg");
written.push("exif-rotated.jpg");

console.log(`Wrote ${written.length} synthetic fixtures to ${out}`);
