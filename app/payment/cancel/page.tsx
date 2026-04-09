import Image from "next/image";
import { XCircle } from "lucide-react";

export default function PaymentCancelPage() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="text-center max-w-md">
        <Image src="/logo.png" alt="An Nisaa'" width={48} height={48} className="mx-auto mb-4 rounded-xl" />
        <div className="w-16 h-16 rounded-full bg-[#FF8C00]/10 mx-auto mb-4 flex items-center justify-center">
          <XCircle size={32} className="text-[#FF8C00]" />
        </div>
        <h1 className="text-xl font-bold">Pembayaran Dibatalkan</h1>
        <p className="text-sm text-muted-foreground mt-2">
          Pembayaran Anda belum selesai. Silakan hubungi admin sekolah jika membutuhkan bantuan.
        </p>
        <p className="text-xs text-muted-foreground mt-6">
          An Nisaa&apos; Sekolahku — Pendidikan Anak Usia Dini Islam Terpadu
        </p>
      </div>
    </main>
  );
}
