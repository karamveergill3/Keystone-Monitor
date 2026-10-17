import { ImageResponse } from "next/og";
import { LOGO_SVG_SQUARE } from "@/lib/logo";

// The phone home-screen icon, drawn from the same SVG as the favicon.
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  const src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(LOGO_SVG_SQUARE)}`;
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: "#000" }}>
        <img src={src} width={180} height={180} alt="" />
      </div>
    ),
    { ...size }
  );
}
