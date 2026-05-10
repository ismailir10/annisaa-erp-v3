import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Talib by An Nisaa' Sekolahku",
    short_name: "Talib",
    description:
      "Platform manajemen sekolah An Nisaa' Sekolahku — kehadiran, jurnal, tagihan.",
    start_url: "/",
    display: "standalone",
    background_color: "#FFFFFF",
    theme_color: "#0F172A",
    icons: [
      { src: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { src: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { src: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
      { src: "/logo.png", sizes: "any", type: "image/png", purpose: "any" },
    ],
    lang: "id-ID",
  };
}
