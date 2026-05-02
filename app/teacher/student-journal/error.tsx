"use client";

import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";

export default function TeacherStudentJournalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-6 flex flex-col items-center text-center gap-3">
      <div className="w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center">
        <AlertTriangle className="text-destructive" size={22} />
      </div>
      <div>
        <h2 className="text-h3 font-semibold mb-1">Gagal memuat buku penghubung</h2>
        <p className="text-sm text-muted-foreground max-w-xs">Coba lagi sebentar ya.</p>
      </div>
      <Button onClick={reset} variant="outline" size="sm">
        Coba Lagi
      </Button>
    </div>
  );
}
