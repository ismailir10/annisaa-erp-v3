import type { Metadata } from "next";
import { Plus_Jakarta_Sans, JetBrains_Mono } from "next/font/google";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
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
  title: "School ERP — An Nisaa' Sekolahku",
  description: "Teacher Attendance & Payroll Management System",
};

function StagingBanner() {
  if (process.env.VERCEL_ENV !== "preview") return null;
  return (
    <div className="bg-[#F4D03F] text-[#1A2E2F] text-center text-xs font-semibold py-1 px-4 fixed top-0 left-0 right-0 z-[100]">
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
      </body>
    </html>
  );
}
