/* eslint-disable @next/next/no-img-element -- next/og renders plain <img>, not next/image */
import { ImageResponse } from "next/og";
import { markDataUri } from "@/components/landing/mark";

// PNG favicon + PWA icons (/icon1/32, /icon1/192, /icon1/512). The SVG favicon is app/icon.svg.
const SIZES = [32, 192, 512];

export function generateImageMetadata() {
  return SIZES.map((n) => ({ id: String(n), size: { width: n, height: n }, contentType: "image/png" }));
}

export default async function Icon({ id }: { id: Promise<string> }) {
  const req = Number(await id);
  const n = SIZES.includes(req) ? req : 32;
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex" }}>
        <img src={markDataUri()} width={n} height={n} alt="" />
      </div>
    ),
    { width: n, height: n },
  );
}
