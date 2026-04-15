import type { Metadata } from "next";
import { Plus_Jakarta_Sans, JetBrains_Mono } from "next/font/google";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import { Analytics } from '@vercel/analytics/next';
import "./globals.css";

const plusJakarta = Plus_Jakarta_Sans({
  variable: "--font-sans",
  subsets: ["latin"],
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "An Nisaa' Sekolahku — Sistem Kehadiran & Penggajian",
  description: "Sistem manajemen kehadiran guru dan penggajian untuk An Nisaa' Sekolahku",
  icons: {
    icon: [
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
    ],
    apple: "/apple-touch-icon.png",
  },
};

function StagingBanner() {
  if (process.env.VERCEL_ENV !== "preview") return null;
  return (
    <div className="bg-yellow-400 text-sidebar text-center text-xs font-semibold py-1 px-4 fixed top-0 left-0 right-0 z-[100]">
      ⚠ STAGING — Emails dikirim ke test address, bukan guru asli
    </div>
  );
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="id"
      className={`${plusJakarta.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <StagingBanner />
        <TooltipProvider>
          {children}
        </TooltipProvider>
        <Toaster />
        <Analytics />
      </body>
    </html>
  );
}
