"use client";

import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";

export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-20 px-4 text-center">
      <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center mb-4">
        <AlertTriangle className="text-destructive" size={28} />
      </div>
      <h2 className="text-lg font-semibold mb-2">Terjadi Kesalahan</h2>
      <p className="text-sm text-muted-foreground mb-6 max-w-md">
        {error.message || "Maaf, terjadi kesalahan saat memuat halaman. Silakan coba lagi."}
      </p>
      <Button onClick={reset} variant="outline">
        Coba Lagi
      </Button>
    </div>
  );
}
