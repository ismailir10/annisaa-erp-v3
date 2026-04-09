import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import Image from "next/image";
import Link from "next/link";

export default async function ParentLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session || session.role !== "GUARDIAN") redirect("/");

  return (
    <div className="min-h-screen bg-background">
      {/* Simple header */}
      <header className="sticky top-0 z-20 bg-card border-b border-border">
        <div className="max-w-2xl mx-auto flex items-center justify-between px-4 h-14">
          <div className="flex items-center gap-2.5">
            <Image src="/logo.png" alt="An Nisaa'" width={28} height={28} className="rounded-md" />
            <span className="text-sm font-semibold">An Nisaa&apos; Portal Orang Tua</span>
          </div>
          <nav className="flex items-center gap-4 text-xs">
            <Link href="/parent" className="text-muted-foreground hover:text-foreground">Beranda</Link>
            <Link href="/parent/invoices" className="text-muted-foreground hover:text-foreground">Tagihan</Link>
            <Link href="/parent/attendance" className="text-muted-foreground hover:text-foreground">Kehadiran</Link>
            <Link href="/parent/reports" className="text-muted-foreground hover:text-foreground">Rapor</Link>
          </nav>
        </div>
      </header>
      <main className="max-w-2xl mx-auto px-4 py-6">{children}</main>
    </div>
  );
}
