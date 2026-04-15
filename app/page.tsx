"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import { motion } from "framer-motion";
import { createClient } from "@/lib/supabase/client";
import { Mail, Loader2 } from "lucide-react";

type UserOption = {
  id: string;
  email: string;
  name: string | null;
  role: string;
};

export default function LoginPageWrapper() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-sidebar" />}>
      <LoginPage />
    </Suspense>
  );
}

function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const error = searchParams.get("error");

  const isSupabaseConfigured = !!process.env.NEXT_PUBLIC_SUPABASE_URL;

  // Supabase auth state
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [magicLinkSent, setMagicLinkSent] = useState(false);
  const [authError, setAuthError] = useState(error === "auth_failed" ? "Login gagal. Silakan coba lagi." : "");

  // Demo mode state
  const [demoUsers, setDemoUsers] = useState<UserOption[]>([]);
  const [demoLoading, setDemoLoading] = useState(!isSupabaseConfigured);
  const [loginLoading, setLoginLoading] = useState<string | null>(null);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      fetch("/api/auth/users")
        .then((r) => r.json())
        .then((data) => { setDemoUsers(data); setDemoLoading(false); });
    }
  }, [isSupabaseConfigured]);

  // Supabase Magic Link
  async function handleMagicLink(e: React.FormEvent) {
    e.preventDefault();
    if (!email) return;
    setLoading(true);
    setAuthError("");

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });

    if (error) {
      setAuthError(error.message);
    } else {
      setMagicLinkSent(true);
    }
    setLoading(false);
  }

  // Supabase Google OAuth
  async function handleGoogleLogin() {
    setLoading(true);
    setAuthError("");
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) {
      setAuthError(error.message);
      setLoading(false);
    }
  }

  // Demo mode login
  async function handleDemoLogin(userId: string) {
    setLoginLoading(userId);
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
    });
    const data = await res.json();
    if (data.ok) router.push(data.redirectUrl);
  }

  const admins = demoUsers.filter((u) => u.role === "SCHOOL_ADMIN");
  const teachers = demoUsers.filter((u) => u.role === "TEACHER");

  return (
    <main className="min-h-screen flex items-center justify-center bg-sidebar px-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="w-full max-w-md"
      >
        {/* Logo & Title */}
        <div className="text-center mb-10">
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.1, duration: 0.4 }}
          >
            <Image src="/logo.png" alt="An Nisaa' Sekolahku" width={64} height={64} className="mx-auto mb-4 rounded-2xl" />
          </motion.div>
          <h1 className="text-2xl font-bold text-white tracking-tight">
            An Nisaa&apos; Sekolahku
          </h1>
          <p className="text-sidebar-foreground mt-2 text-sm">
            Sistem Kehadiran &amp; Penggajian
          </p>
        </div>

        {/* Auth Card */}
        <div className="bg-sidebar-accent rounded-2xl p-6 border border-white/5">

          {isSupabaseConfigured ? (
            /* ── Supabase Auth ── */
            magicLinkSent ? (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="text-center py-4"
              >
                <div className="w-16 h-16 rounded-full bg-primary/20 mx-auto mb-4 flex items-center justify-center">
                  <Mail className="text-primary" size={28} />
                </div>
                <h2 className="text-white font-semibold text-lg">Cek Email Anda</h2>
                <p className="text-sidebar-foreground text-sm mt-2">
                  Magic link telah dikirim ke <span className="text-white font-medium">{email}</span>
                </p>
                <p className="text-sidebar-foreground text-xs mt-3">
                  Klik link di email untuk masuk
                </p>
                <button
                  onClick={() => { setMagicLinkSent(false); setEmail(""); }}
                  className="text-primary text-sm mt-4 hover:underline"
                >
                  Gunakan email lain
                </button>
              </motion.div>
            ) : (
              <div className="space-y-4">
                {/* Google OAuth */}
                <button
                  onClick={handleGoogleLogin}
                  disabled={loading}
                  className="w-full flex items-center justify-center gap-3 p-3 rounded-xl bg-white text-sidebar font-medium text-sm hover:bg-gray-100 transition-colors disabled:opacity-50"
                >
                  <svg width="18" height="18" viewBox="0 0 18 18"><path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z" fill="#4285F4"/><path d="M9.003 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332C2.438 15.983 5.482 18 9.003 18z" fill="#34A853"/><path d="M3.964 10.71c-.18-.54-.282-1.117-.282-1.71s.102-1.17.282-1.71V4.958H.957C.347 6.173 0 7.548 0 9s.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/><path d="M9.003 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.464.891 11.428 0 9.002 0 5.48 0 2.438 2.017.957 4.958L3.964 7.29c.708-2.127 2.692-3.71 5.036-3.71z" fill="#EA4335"/></svg>
                  Masuk dengan Google
                </button>

                <div className="flex items-center gap-3">
                  <div className="flex-1 h-px bg-white/10" />
                  <span className="text-sidebar-foreground text-xs">atau</span>
                  <div className="flex-1 h-px bg-white/10" />
                </div>

                {/* Magic Link */}
                <form onSubmit={handleMagicLink} className="space-y-3">
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Masukkan email Anda"
                    className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-sidebar-foreground text-sm focus:outline-none focus:border-primary transition-colors"
                    required
                  />
                  <button
                    type="submit"
                    disabled={loading || !email}
                    className="w-full flex items-center justify-center gap-2 p-3 rounded-xl bg-primary text-white font-medium text-sm hover:bg-primary/90 transition-colors disabled:opacity-50"
                  >
                    {loading ? <Loader2 size={16} className="animate-spin" /> : <Mail size={16} />}
                    Kirim Magic Link
                  </button>
                </form>

                {authError && (
                  <p className="text-red-400 text-xs text-center">{authError}</p>
                )}
              </div>
            )
          ) : (
            /* ── Demo Mode ── */
            <div>
              <p className="text-sidebar-foreground text-xs uppercase tracking-wider font-semibold mb-4">
                Demo Mode — Pilih Akun
              </p>

              {demoLoading ? (
                <div className="space-y-3">
                  {[1, 2, 3].map((i) => <div key={i} className="h-14 rounded-xl bg-white/5 opacity-50" />)}
                </div>
              ) : (
                <div className="space-y-4">
                  {admins.map((user) => (
                    <motion.button
                      key={user.id}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => handleDemoLogin(user.id)}
                      disabled={loginLoading !== null}
                      className="w-full flex items-center gap-3 p-3 rounded-xl bg-primary/10 border border-primary/20 hover:border-primary/40 transition-colors text-left disabled:opacity-50"
                    >
                      <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center shrink-0">
                        <span className="text-white text-sm font-bold">{user.name?.[0] ?? "A"}</span>
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-white font-medium text-sm truncate">{user.name ?? user.email}</p>
                        <p className="text-sidebar-foreground text-xs">Admin Sekolah</p>
                      </div>
                      {loginLoading === user.id && <Loader2 size={16} className="text-white animate-spin" />}
                    </motion.button>
                  ))}

                  <p className="text-sidebar-foreground text-xs uppercase tracking-wider font-semibold pt-2">Guru ({teachers.length})</p>
                  <div className="max-h-48 overflow-y-auto space-y-1 pr-1">
                    {teachers.map((user, i) => (
                      <motion.button
                        key={user.id}
                        initial={{ opacity: 0, x: -8 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.03 * i }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => handleDemoLogin(user.id)}
                        disabled={loginLoading !== null}
                        className="w-full flex items-center gap-3 p-2.5 rounded-xl hover:bg-white/5 transition-colors text-left disabled:opacity-50"
                      >
                        <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center shrink-0">
                          <span className="text-white/70 text-xs font-medium">{user.name?.[0] ?? "?"}</span>
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-white/90 text-sm truncate">{user.name}</p>
                          <p className="text-sidebar-foreground text-xs truncate">{user.email}</p>
                        </div>
                        {loginLoading === user.id && <Loader2 size={16} className="text-white animate-spin" />}
                      </motion.button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <p className="text-center text-sidebar-foreground text-xs mt-6">
          {isSupabaseConfigured ? "Powered by An Nisaa' ERP" : "Demo mode — Supabase Auth belum dikonfigurasi"}
        </p>
      </motion.div>
    </main>
  );
}
