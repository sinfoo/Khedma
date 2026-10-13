/* eslint-disable @next/next/no-img-element -- next/og renders plain <img>, not next/image */
import { ImageResponse } from "next/og";
import { BRAND, markDataUri } from "@/components/landing/mark";

export const alt = "Khedma — Ta première khedma commence ici. Stages, PFE et premier emploi, avec une IA locale.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          background: `radial-gradient(900px 500px at 85% 0%, rgba(11,92,173,0.45), transparent 60%), linear-gradient(180deg, ${BRAND.ink} 0%, #0e1a2e 100%)`,
          color: "#edf0f5",
          padding: "64px 72px",
          position: "relative",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", width: 700 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
            <img src={markDataUri()} width={64} height={64} alt="" />
            <span style={{ fontSize: 44, fontWeight: 700, letterSpacing: -1 }}>Khedma</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ fontSize: 76, fontWeight: 700, lineHeight: 1.05, letterSpacing: -2.5, display: "flex", flexDirection: "column" }}>
              <div style={{ display: "flex", gap: 22 }}>
                <span>Ta première</span>
                <span style={{ color: "#8fc0ff", borderBottom: `8px solid ${BRAND.saffron}` }}>khedma</span>
              </div>
              <span>commence ici.</span>
            </div>
            <div style={{ fontSize: 28, color: "#c8cfda", marginTop: 28, lineHeight: 1.35 }}>
              Stages, PFE et premier emploi — notés face à ton CV par une IA locale. 100 % sur ton laptop.
            </div>
          </div>
          <div style={{ display: "flex", gap: 14, fontSize: 22, color: "#9aa5b6" }}>
            <span>PFA · ENIT · Tunis</span>
            <span style={{ width: 10, height: 10, background: BRAND.saffron, transform: "rotate(45deg)", alignSelf: "center" }} />
            <span>FR · EN</span>
          </div>
        </div>

        {/* the door */}
        <div
          style={{
            position: "absolute",
            right: 80,
            bottom: 0,
            width: 330,
            height: 500,
            display: "flex",
            background: "#efe9dc",
            borderTopLeftRadius: 165,
            borderTopRightRadius: 165,
            padding: 24,
          }}
        >
          <div
            style={{
              flex: 1,
              display: "flex",
              background: `radial-gradient(circle at 75% 70%, #ffd58a, ${BRAND.saffron} 40%, #8a4e00)`,
              borderTopLeftRadius: 141,
              borderTopRightRadius: 141,
            }}
          >
            <div
              style={{
                width: "62%",
                height: "100%",
                background: BRAND.blue,
                borderTopLeftRadius: 141,
                display: "flex",
                position: "relative",
              }}
            >
              <div
                style={{
                  position: "absolute",
                  right: 24,
                  top: 250,
                  width: 26,
                  height: 26,
                  borderRadius: 13,
                  border: `5px solid ${BRAND.saffron}`,
                }}
              />
            </div>
          </div>
        </div>
      </div>
    ),
    size,
  );
}
