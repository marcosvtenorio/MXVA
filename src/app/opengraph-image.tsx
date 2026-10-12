import { ImageResponse } from "next/og";

export const alt = "MXVA — Your face. Your full glow-up.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Link preview for Instagram DMs, WhatsApp and iMessage: the lit seamless, the head, the line.
export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-end",
          padding: 72,
          backgroundColor: "#a9b7be",
          backgroundImage: "radial-gradient(circle at 22% 18%, #dce3e6 0%, #a9b7be 55%, #7f909a 100%)",
          color: "#111417",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", maxWidth: 640 }}>
          <div style={{ fontSize: 30, letterSpacing: 8, marginBottom: 40 }}>MXVA</div>
          <div style={{ fontSize: 76, lineHeight: 1.02, letterSpacing: -3 }}>Your face.</div>
          <div style={{ fontSize: 76, lineHeight: 1.02, letterSpacing: -3, color: "#3f5b6b" }}>Your full glow-up.</div>
          <div style={{ fontSize: 26, marginTop: 32, color: "#2a3740" }}>AI concept portrait + sourced roadmap · $29 once · photos not kept</div>
        </div>
        <div
          style={{
            width: 250,
            height: 330,
            borderRadius: "50% 50% 46% 46%",
            backgroundImage: "radial-gradient(circle at 34% 30%, #f2f3f0 0%, #d3d8d6 45%, #8e9aa0 100%)",
            boxShadow: "60px 40px 80px rgba(85,101,110,.45)",
            marginBottom: 40,
          }}
        />
      </div>
    ),
    size,
  );
}
