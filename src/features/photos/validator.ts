// Isomorphic photo checks shared by the browser (before anything leaves the device)
// and the server (which re-validates every byte it receives). Pure functions only.

export type SniffedType = "image/jpeg" | "image/png" | "image/webp" | "image/heic";

/** Original files may be large phone photos; they are downscaled on-device before upload. */
export const MAX_INPUT_BYTES = 25 * 1024 * 1024;
/** Default upload cap per photo (server-configurable via MAX_PHOTO_BYTES). */
export const MAX_UPLOAD_BYTES_DEFAULT = 8 * 1024 * 1024;
/** Decoding guard against decompression bombs. 48 MP phone sensors fit comfortably. */
export const MAX_DECODE_PIXELS = 64_000_000;
export const MAX_DECODE_SIDE = 12_000;
/** Long side of the normalised photo sent for processing. */
export const NORMALISED_LONG_SIDE = 2048;
/** Profiles only inform the analysis, so they travel smaller. */
export const PROFILE_LONG_SIDE = 1280;
/**
 * Upload size per photo. Hosts cap a request body (Vercel: 4.5 MB), and a paid report must never
 * fail on size: the front photo and both profiles stay under 4 MB together.
 */
export const UPLOAD_BUDGET_BYTES = { front: 2_400_000, profile: 800_000 } as const;

const HEIF_BRANDS = new Set(["heic", "heix", "hevc", "hevx", "heim", "heis", "mif1", "msf1"]);

function ascii(bytes: Uint8Array, start: number, length: number): string {
  let out = "";
  for (let i = start; i < start + length && i < bytes.length; i++) out += String.fromCharCode(bytes[i]!);
  return out;
}

/** Identifies the real format from magic bytes; declared MIME types and names are not trusted. */
export function sniffImageType(bytes: Uint8Array): SniffedType | undefined {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    ascii(bytes, 1, 3) === "PNG" &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return "image/png";
  }
  if (bytes.length >= 12 && ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 4) === "WEBP") return "image/webp";
  if (bytes.length >= 12 && ascii(bytes, 4, 4) === "ftyp") {
    const major = ascii(bytes, 8, 4);
    if (HEIF_BRANDS.has(major)) return "image/heic";
    // Compatible brands follow the minor version (box size is the first 4 bytes, big-endian).
    const boxSize = ((bytes[0]! << 24) | (bytes[1]! << 16) | (bytes[2]! << 8) | bytes[3]!) >>> 0;
    for (let offset = 16; offset + 4 <= Math.min(boxSize, bytes.length); offset += 4) {
      if (HEIF_BRANDS.has(ascii(bytes, offset, 4))) return "image/heic";
    }
  }
  return undefined;
}

const EXTENSION_TYPES: Record<string, SniffedType> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  jfif: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  heic: "image/heic",
  heif: "image/heic",
};

const DECLARED_TYPES: Record<string, SniffedType> = {
  "image/jpeg": "image/jpeg",
  "image/jpg": "image/jpeg",
  "image/pjpeg": "image/jpeg",
  "image/png": "image/png",
  "image/webp": "image/webp",
  "image/heic": "image/heic",
  "image/heif": "image/heic",
  "image/heic-sequence": "image/heic",
  "image/heif-sequence": "image/heic",
};

/**
 * True when the declared MIME type or the file extension claims a different format than
 * the bytes. Empty declarations (common on some Android pickers) are not a mismatch.
 */
export function isDisguised(sniffed: SniffedType, declaredType: string, fileName: string): boolean {
  const declared = declaredType ? DECLARED_TYPES[declaredType.toLowerCase()] : undefined;
  if (declaredType && declaredType !== "application/octet-stream" && declared !== sniffed) return true;
  // Alphabetic extensions only: "Screenshot 15.00.12" has no extension, "photo.jpg" does.
  const extension = /\.([a-z][a-z0-9]{1,4})$/i.exec(fileName)?.[1]?.toLowerCase();
  if (extension && EXTENSION_TYPES[extension] && EXTENSION_TYPES[extension] !== sniffed) return true;
  if (extension && !EXTENSION_TYPES[extension] && !["blob", "tmp"].includes(extension)) return true;
  return false;
}

function readUint16BE(bytes: Uint8Array, offset: number): number {
  return (bytes[offset]! << 8) | bytes[offset + 1]!;
}

function readUint32BE(bytes: Uint8Array, offset: number): number {
  return ((bytes[offset]! << 24) | (bytes[offset + 1]! << 16) | (bytes[offset + 2]! << 8) | bytes[offset + 3]!) >>> 0;
}

function readUint24LE(bytes: Uint8Array, offset: number): number {
  return bytes[offset]! | (bytes[offset + 1]! << 8) | (bytes[offset + 2]! << 16);
}

/**
 * Reads pixel dimensions from the file header without decoding the image.
 * Returns undefined when the header can't be parsed (HEIC is left to the decoder).
 */
export function readHeaderDimensions(
  bytes: Uint8Array,
  type: SniffedType,
): { width: number; height: number } | undefined {
  if (type === "image/png") {
    if (bytes.length < 24 || ascii(bytes, 12, 4) !== "IHDR") return undefined;
    return { width: readUint32BE(bytes, 16), height: readUint32BE(bytes, 20) };
  }

  if (type === "image/webp") {
    const chunk = ascii(bytes, 12, 4);
    if (chunk === "VP8X" && bytes.length >= 30) {
      return { width: readUint24LE(bytes, 24) + 1, height: readUint24LE(bytes, 27) + 1 };
    }
    if (chunk === "VP8 " && bytes.length >= 30) {
      return { width: ((bytes[26]! | (bytes[27]! << 8)) & 0x3fff), height: ((bytes[28]! | (bytes[29]! << 8)) & 0x3fff) };
    }
    if (chunk === "VP8L" && bytes.length >= 25) {
      const b0 = bytes[21]!;
      const b1 = bytes[22]!;
      const b2 = bytes[23]!;
      const b3 = bytes[24]!;
      return { width: 1 + (((b1 & 0x3f) << 8) | b0), height: 1 + (((b3 & 0x0f) << 10) | (b2 << 2) | ((b1 & 0xc0) >> 6)) };
    }
    return undefined;
  }

  if (type === "image/jpeg") {
    let offset = 2;
    while (offset + 9 < bytes.length) {
      if (bytes[offset] !== 0xff) return undefined;
      const marker = bytes[offset + 1]!;
      // Fill bytes / standalone markers
      if (marker === 0xff) {
        offset += 1;
        continue;
      }
      if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
        offset += 2;
        continue;
      }
      const length = readUint16BE(bytes, offset + 2);
      const isStartOfFrame =
        marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
      if (isStartOfFrame) {
        return { height: readUint16BE(bytes, offset + 5), width: readUint16BE(bytes, offset + 7) };
      }
      if (length < 2) return undefined;
      offset += 2 + length;
    }
    return undefined;
  }

  return undefined;
}

export function dimensionsAreSafe({ width, height }: { width: number; height: number }): boolean {
  return (
    width > 0 &&
    height > 0 &&
    width <= MAX_DECODE_SIDE &&
    height <= MAX_DECODE_SIDE &&
    width * height <= MAX_DECODE_PIXELS
  );
}

export type BasicCheck =
  | { ok: true; type: SniffedType; headerDimensions?: { width: number; height: number } }
  | {
      ok: false;
      code: "UNSUPPORTED_IMAGE_TYPE" | "PHOTO_TOO_LARGE" | "PHOTO_UNREADABLE" | "PHOTO_DIMENSIONS_UNSAFE";
      message: string;
    };

/**
 * First-line checks on raw bytes: size, real type, disguise, header dimensions.
 * `head` needs only the first ~64 KB of the file.
 */
export function checkPhotoBasics(input: {
  head: Uint8Array;
  size: number;
  declaredType: string;
  fileName: string;
  maxBytes: number;
}): BasicCheck {
  if (input.size === 0) {
    return { ok: false, code: "PHOTO_UNREADABLE", message: "That file is empty. Choose another photo." };
  }
  if (input.size > input.maxBytes) {
    const mb = Math.round(input.maxBytes / (1024 * 1024));
    return { ok: false, code: "PHOTO_TOO_LARGE", message: `That photo is over ${mb} MB. Choose a smaller one.` };
  }
  const type = sniffImageType(input.head);
  if (!type) {
    return {
      ok: false,
      code: "UNSUPPORTED_IMAGE_TYPE",
      message: "That file isn't a JPEG, PNG, WebP or HEIC photo.",
    };
  }
  if (isDisguised(type, input.declaredType, input.fileName)) {
    return {
      ok: false,
      code: "UNSUPPORTED_IMAGE_TYPE",
      message: "That file's name or type doesn't match its contents. Choose the original photo.",
    };
  }
  const headerDimensions = readHeaderDimensions(input.head, type);
  if (headerDimensions && !dimensionsAreSafe(headerDimensions)) {
    return {
      ok: false,
      code: "PHOTO_DIMENSIONS_UNSAFE",
      message: "That image is too large to process safely. Choose a regular photo.",
    };
  }
  return { ok: true, type, headerDimensions };
}

/** Size that fits `longSide` while keeping the aspect ratio (never upscales). */
export function fitWithin(width: number, height: number, longSide: number): { width: number; height: number } {
  const scale = Math.min(1, longSide / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}
