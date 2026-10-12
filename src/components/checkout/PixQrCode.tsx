"use client";

import { useMemo } from "react";
import { encode } from "uqr";

/** Draws the PIX QR code from its copy-and-paste code. Always dark on white, so any bank app can scan it. */
export function PixQrCode({ code, simulated }: { code: string; simulated: boolean }) {
  const qr = useMemo(() => {
    const { data, size } = encode(code, { ecc: "M", border: 0 });
    let path = "";
    data.forEach((row, y) => {
      for (let x = 0; x < size; x++) {
        if (!row[x]) continue;
        let run = 1;
        while (x + run < size && row[x + run]) run++;
        path += `M${x} ${y}h${run}v1h-${run}z`;
        x += run - 1;
      }
    });
    return { path, size };
  }, [code]);

  return (
    <figure className="relative mx-auto w-[min(232px,72vw)] rounded-[20px] bg-white p-4 shadow-[0_10px_28px_rgba(40,55,62,.16),inset_0_0_0_1px_#D9DEE0]">
      <svg viewBox={`0 0 ${qr.size} ${qr.size}`} role="img" aria-label="Pix QR code" shapeRendering="crispEdges" className="block h-auto w-full">
        <path d={qr.path} fill="#111417" />
      </svg>
      {simulated ? (
        <figcaption className="mono absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white px-3 py-1 text-[#111417] shadow-[inset_0_0_0_1px_#D9DEE0]">
          Simulated
        </figcaption>
      ) : null}
    </figure>
  );
}
