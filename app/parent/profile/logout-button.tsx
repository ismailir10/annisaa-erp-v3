"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { toast } from "sonner";

export function LogoutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function handleLogout() {
    setBusy(true);
    try {
      const res = await fetch("/api/auth/logout", { method: "POST" });
      if (!res.ok) throw new Error();
      router.push("/");
    } catch {
      toast.error("Tidak bisa keluar. Coba lagi sebentar ya.");
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleLogout}
      disabled={busy}
      className="flex w-full items-center justify-center gap-2 rounded-md border border-status-absent-subtle bg-transparent px-4 py-3 text-sm font-semibold text-status-absent-text transition-colors hover:bg-status-absent-subtle active:scale-98 disabled:opacity-60"
    >
      <LogOut size={16} />
      {busy ? "Keluar..." : "Keluar"}
    </button>
  );
}
