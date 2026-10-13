"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Camera, Plus, Tick } from "@/components/common/icons";
import { CropMarks, PlasterHead, ProfileHead } from "@/components/common/StudioArt";
import { track } from "@/features/analytics/client";
import { processPhoto } from "@/features/photos/client-processor";
import { usePhotoStore } from "@/features/photos/memory-store";
import type { PhotoSlot, QualityIssue } from "@/features/photos/types";

const INPUT_ACCEPT = "image/jpeg,image/png,image/webp,image/heic,image/heif";

type SlotStatus = { state: "idle" } | { state: "working" } | { state: "error"; message: string };

function useSlotUpload(slot: PhotoSlot) {
  const setPhoto = usePhotoStore((state) => state.setPhoto);
  const [status, setStatus] = useState<SlotStatus>({ state: "idle" });

  async function handleFiles(input: HTMLInputElement) {
    const file = input.files?.[0];
    // Drop the input's reference to the original file as soon as we have it.
    input.value = "";
    if (!file) return;
    setStatus({ state: "working" });
    const result = await processPhoto(file);
    if (!result.ok) {
      track("photo_rejected", { reason: result.code });
      setStatus({ state: "error", message: result.message });
      return;
    }
    const blocking = result.quality.issues.find((issue) => issue.severity === "block");
    if (blocking) track("photo_rejected", { reason: blocking.code });
    setPhoto(slot, { blob: result.blob, width: result.width, height: result.height, quality: result.quality });
    setStatus({ state: "idle" });
  }

  return { status, handleFiles, setStatus };
}

function QualityList({ issues }: { issues: QualityIssue[] }) {
  if (issues.length === 0) return null;
  return (
    <ul className="mt-3 grid gap-2" aria-label="Photo checks">
      {issues.map((issue) => (
        <li
          key={issue.code}
          className={`flex items-start gap-2 text-[15px] leading-[1.4] ${issue.severity === "block" ? "text-negative" : "text-ink-2"}`}
        >
          <span className="mono mt-0.5 flex-none">{issue.severity === "block" ? "Fix" : "Tip"}</span>
          <span>{issue.message}</span>
        </li>
      ))}
    </ul>
  );
}

function FrontSlot() {
  const photo = usePhotoStore((state) => state.photos.front);
  const { status, handleFiles } = useSlotUpload("front");
  const cameraId = useId();
  const libraryId = useId();
  const statusId = useId();
  const checks = photo?.quality;
  const checkLine = (label: string, ok: string, concerns: (issue: QualityIssue) => boolean) => {
    const found = checks?.issues.filter(concerns) ?? [];
    const issue = found.find((entry) => entry.severity === "block") ?? found[0];
    return { label, value: issue ? (issue.severity === "block" ? "fix" : "check") : ok, ok: !issue };
  };
  // A photo with no readable face can't be "centered"; a flat, hazy one is a light problem.
  const readouts = checks
    ? [
        checkLine("Light", "ok", (i) => i.code === "too_dark" || i.code === "too_bright" || (i.code === "low_contrast" && i.severity === "warn")),
        checkLine("Focus", "sharp", (i) => i.code === "blurry"),
        // Only the orientation is checked here (the face itself is judged after payment), so say just that.
        checkLine("Framing", "portrait", (i) => i.code === "landscape" || (i.code === "low_contrast" && i.severity === "block")),
      ]
    : [];

  return (
    <div>
      <div className="stage relative h-[318px] max-[700px]:h-[260px]" aria-describedby={statusId}>
        {photo ? (
          // Object URL of the in-memory photo; never a data URL, never stored.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photo.previewUrl} alt="Your front photo" className="absolute inset-0 h-full w-full object-cover" />
        ) : (
          <PlasterHead className="absolute inset-x-0 bottom-0 h-[78%] w-full" />
        )}
        <CropMarks corners={["tl", "tr"]} />
        {photo ? (
          <div className="readouts mono frost key-light-on right-4 top-4 rounded-[14px] px-3 py-2.5">
            <span className="settle grid gap-1.5">
              {readouts.map((line) => (
                <span key={line.label} className="inline-flex items-center justify-end gap-1.5">
                  {line.label} · {line.value} {line.ok ? <Tick size={13} className="text-positive" /> : null}
                </span>
              ))}
            </span>
          </div>
        ) : null}
        <span className="capsule frost mono absolute bottom-4 left-4">Front</span>
        <div className="absolute bottom-4 right-4 flex gap-2">
          <label htmlFor={cameraId} className="capsule frost min-h-11 cursor-pointer gap-2 px-4 text-[15px] font-semibold">
            <Camera size={18} />
            {photo ? "Retake" : "Take photo"}
          </label>
          {!photo ? (
            <label htmlFor={libraryId} className="capsule frost min-h-11 cursor-pointer px-4 text-[15px] font-semibold">
              Choose
            </label>
          ) : null}
        </div>
        {/* Labelled on their own too: the visible "Choose" label goes away once a photo is in. */}
        <input id={cameraId} type="file" accept="image/*" capture="user" className="sr-only" aria-label="Take your front photo" onChange={(event) => void handleFiles(event.currentTarget)} />
        <input id={libraryId} type="file" accept={INPUT_ACCEPT} className="sr-only" aria-label="Choose your front photo" onChange={(event) => void handleFiles(event.currentTarget)} />
      </div>
      <div id={statusId} aria-live="polite">
        {status.state === "working" ? <p className="mt-3 text-[15px] text-ink-2">Checking light, focus and framing…</p> : null}
        {status.state === "error" ? (
          <p role="alert" className="mt-3 text-[15px] leading-[1.4] text-negative">
            {status.message}
          </p>
        ) : null}
        {photo ? <QualityList issues={photo.quality.issues} /> : null}
      </div>
    </div>
  );
}

function ProfileTile({ slot }: { slot: "left" | "right" }) {
  const photo = usePhotoStore((state) => state.photos[slot]);
  const removePhoto = usePhotoStore((state) => state.removePhoto);
  const { status, handleFiles } = useSlotUpload(slot);
  const inputId = useId();
  const label = slot === "left" ? "Left profile" : "Right profile";
  return (
    <div>
      <div className="stage relative h-28 rounded-[20px]">
        {photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photo.previewUrl} alt={`Your ${label.toLowerCase()} photo`} className="absolute inset-0 h-full w-full object-cover" />
        ) : (
          <ProfileHead className="absolute inset-x-0 bottom-0 h-[92%] w-full opacity-35" mirrored={slot === "right"} />
        )}
        <span className="mono absolute left-3 top-2.5 text-[color:var(--on-image)]">{slot === "left" ? "Left" : "Right"} · optional</span>
        {photo ? (
          <button type="button" className="capsule frost absolute bottom-2.5 right-2.5 min-h-11 px-4 text-[15px] font-semibold" onClick={() => removePhoto(slot)}>
            Remove
          </button>
        ) : (
          <label htmlFor={inputId} className="frost absolute bottom-2.5 right-2.5 grid h-11 w-11 cursor-pointer place-items-center rounded-full">
            <Plus size={18} />
            <span className="sr-only">Add {label.toLowerCase()} photo</span>
          </label>
        )}
        <input id={inputId} type="file" accept={INPUT_ACCEPT} className="sr-only" aria-label={`Add ${label.toLowerCase()} photo`} onChange={(event) => void handleFiles(event.currentTarget)} />
      </div>
      {status.state === "error" ? (
        <p role="alert" className="mt-2 text-[13px] leading-[1.35] text-negative">
          {status.message}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Photo selection: front photo required, two profiles optional. Everything happens on
 * the device; results live only in memory (see features/photos/memory-store.ts).
 */
export function PhotoCapture({ frontOnly = false }: { frontOnly?: boolean }) {
  const front = usePhotoStore((state) => state.photos.front);
  const profiles = usePhotoStore((state) => Number(Boolean(state.photos.left)) + Number(Boolean(state.photos.right)));
  const ownership = usePhotoStore((state) => state.ownershipConfirmed);
  const setOwnership = usePhotoStore((state) => state.setOwnershipConfirmed);
  const reported = useRef<string | undefined>(undefined);

  useEffect(() => {
    const key = front ? `${front.quality.ok}:${profiles}` : undefined;
    if (key && key !== reported.current) {
      reported.current = key;
      track("photo_ready", { ready: Boolean(front?.quality.ok), profiles });
    }
  }, [front, profiles]);

  return (
    <div>
      <FrontSlot />
      {!frontOnly ? (
        <div className="mt-2.5 grid grid-cols-2 gap-2.5">
          <ProfileTile slot="left" />
          <ProfileTile slot="right" />
        </div>
      ) : null}
      <label className="mt-5 flex cursor-pointer items-start gap-3 text-[15px] leading-[1.4]">
        <input type="checkbox" className="checkbox" checked={ownership} onChange={(event) => setOwnership(event.currentTarget.checked)} />
        <span>These are photos of me, and I&apos;m 18 or older.</span>
      </label>
    </div>
  );
}
