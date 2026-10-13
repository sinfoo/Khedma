/* eslint-disable @next/next/no-img-element -- next/og renders plain <img>, not next/image */
import { ImageResponse } from "next/og";
import { markDataUri } from "@/components/landing/mark";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

// Full-bleed square: iOS applies its own rounded mask.
export default function AppleIcon() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex" }}>
        <img src={markDataUri(0)} width={180} height={180} alt="" />
      </div>
    ),
    size,
  );
}
