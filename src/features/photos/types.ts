export const PHOTO_SLOTS = ["front", "left", "right"] as const;
export type PhotoSlot = (typeof PHOTO_SLOTS)[number];

export const SLOT_LABELS: Record<PhotoSlot, string> = {
  front: "Front",
  left: "Left profile",
  right: "Right profile",
};

/** Accepted after client-side normalisation; the server re-checks every byte. */
export const ACCEPTED_INPUT_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"] as const;
export const UPLOAD_MIME = "image/jpeg";

export type QualityIssueCode =
  | "too_small"
  | "too_dark"
  | "too_bright"
  | "low_contrast"
  | "blurry"
  | "landscape";

export type QualityIssue = {
  code: QualityIssueCode;
  /** "block" stops the photo being used; "warn" lets the buyer continue knowingly. */
  severity: "block" | "warn";
  message: string;
};

export type PhotoQualityReport = {
  ok: boolean;
  issues: QualityIssue[];
  metrics: { width: number; height: number; meanLuminance: number; contrast: number; sharpness: number };
};

export type PhotoRejectionCode =
  | "UNSUPPORTED_IMAGE_TYPE"
  | "PHOTO_TOO_LARGE"
  | "PHOTO_UNREADABLE"
  | "PHOTO_DIMENSIONS_UNSAFE"
  | "PHOTO_QUALITY_INSUFFICIENT";

export type HeldPhoto = {
  /** Normalised JPEG: upright, metadata stripped, downscaled. RAM only. */
  blob: Blob;
  /** Object URL for <img> previews. Revoked on replace, clear and page exit. */
  previewUrl: string;
  width: number;
  height: number;
  byteSize: number;
  quality: PhotoQualityReport;
};
