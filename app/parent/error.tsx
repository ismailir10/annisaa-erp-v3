"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";

export default function ParentError({
  error: _error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-20 px-4 text-center max-w-md mx-auto">
      <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center mb-4">
        <AlertTriangle className="text-destructive" size={28} />
      </div>
      <h2 className="text-h2 font-semibold mb-2">Halaman belum bisa dimuat</h2>
      <p className="text-sm text-muted-foreground mb-6">
        Koneksi terputus. Coba lagi sebentar ya.
      </p>
      <div className="flex items-center gap-2">
        <Button onClick={reset} variant="outline">
          Coba Lagi
        </Button>
        <Link
          href="/parent"
          className="inline-flex items-center justify-center rounded-md px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
        >
          Kembali ke Beranda
        </Link>
      </div>
    </div>
  );
}
