import Image from "next/image";
import { CheckCircle } from "lucide-react";

export default function PaymentSuccessPage() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="text-center max-w-md">
        <Image src="/logo.png" alt="An Nisaa'" width={48} height={48} className="mx-auto mb-4 rounded-xl" />
        <div className="w-16 h-16 rounded-full bg-success/10 mx-auto mb-4 flex items-center justify-center">
          <CheckCircle size={32} className="text-success" />
        </div>
        <h1 className="text-xl font-bold">Pembayaran Berhasil!</h1>
        <p className="text-sm text-muted-foreground mt-2">
          Terima kasih, pembayaran Anda telah diterima. Bukti pembayaran akan dikirim melalui email.
        </p>
        <p className="text-xs text-muted-foreground mt-6">
          An Nisaa&apos; Sekolahku — Pendidikan Anak Usia Dini Islam Terpadu
        </p>
      </div>
    </main>
  );
}
