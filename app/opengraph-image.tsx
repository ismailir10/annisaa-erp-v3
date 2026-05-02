import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "Talib by An Nisaa' Sekolahku";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          height: "100%",
          width: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#0F172A",
          color: "#F8FAFC",
          fontFamily: "sans-serif",
          padding: "80px",
        }}
      >
        <div style={{ fontSize: 144, fontWeight: 700, letterSpacing: "-0.04em", lineHeight: 1 }}>
          Talib
        </div>
        <div style={{ fontSize: 36, marginTop: 24, opacity: 0.85 }}>
          by An Nisaa&apos; Sekolahku
        </div>
        <div style={{ fontSize: 24, marginTop: 80, opacity: 0.65, textAlign: "center" }}>
          Platform sekolah — kehadiran, jurnal, tagihan, komunikasi orang tua
        </div>
      </div>
    ),
    size,
  );
}
