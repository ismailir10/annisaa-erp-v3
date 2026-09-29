"use client";

import { useState } from "react";
import { LogOut } from "lucide-react";
import { toast } from "sonner";
import { signOut } from "@/lib/sign-out";

export function LogoutButton() {
  const [busy, setBusy] = useState(false);

  async function handleLogout() {
    setBusy(true);
    try {
      await signOut();
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
