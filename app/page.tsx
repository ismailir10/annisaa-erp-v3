"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import { motion } from "framer-motion";
import { createClient } from "@/lib/supabase/client";
import { Mail, Loader2 } from "lucide-react";
import { TalibWordmark } from "@/components/brand/talib-wordmark";
import { LegalFooter } from "@/components/layout/legal-footer";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";

type UserOption = {
  id: string;
  email: string;
  name: string | null;
  role: string;
};

// Maps `?error=<code>` returned by /auth/callback to a user-facing message.
// `access_denied` covers the most common failure: Google OAuth succeeds but
// the email has no User/Employee/Parent record yet (UAT 2026-05-12 teacher
// blocker — silent redirect with no UX).
const LOGIN_ERROR_MESSAGES: Record<string, string> = {
  auth_failed: "Login gagal. Silakan coba lagi.",
  access_denied: "Akun belum terdaftar. Hubungi admin sekolah untuk akses.",
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
  const [authError, setAuthError] = useState(error ? (LOGIN_ERROR_MESSAGES[error] ?? "") : "");

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
            className="flex flex-col items-center"
          >
            <Image src="/logo.png" alt="An Nisaa' Sekolahku" width={64} height={64} className="mb-4 rounded-2xl" />
            <TalibWordmark size="lg" showSublabel className="items-center text-white" />
          </motion.div>
          <p className="text-sidebar-foreground mt-3 text-sm">
            Sahabat belajar anak — kehadiran, jurnal, tagihan dalam satu pintu.
          </p>
        </div>

        <Card className="border-white/5 bg-login-card-bg py-0 text-white">
          <CardContent className="p-6">
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
                <Button
                  type="button"
                  variant="link"
                  onClick={() => { setMagicLinkSent(false); setEmail(""); }}
                  className="mt-4 h-auto p-0 text-primary"
                >
                  Gunakan email lain
                </Button>
              </motion.div>
            ) : (
              <div className="space-y-4">
                {/* Google OAuth */}
                <Button
                  type="button"
                  variant="secondary"
                  size="lg"
                  onClick={handleGoogleLogin}
                  disabled={loading}
                  className="w-full bg-white text-sidebar hover:bg-gray-100"
                >
                  <svg width="18" height="18" viewBox="0 0 18 18"><path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z" fill="#4285F4"/><path d="M9.003 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332C2.438 15.983 5.482 18 9.003 18z" fill="#34A853"/><path d="M3.964 10.71c-.18-.54-.282-1.117-.282-1.71s.102-1.17.282-1.71V4.958H.957C.347 6.173 0 7.548 0 9s.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/><path d="M9.003 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.464.891 11.428 0 9.002 0 5.48 0 2.438 2.017.957 4.958L3.964 7.29c.708-2.127 2.692-3.71 5.036-3.71z" fill="#EA4335"/></svg>
                  Masuk dengan Google
                </Button>

                <div className="flex items-center gap-3">
                  <Separator className="flex-1 bg-white/10" />
                  <span className="text-sidebar-foreground text-xs">atau</span>
                  <Separator className="flex-1 bg-white/10" />
                </div>

                {/* Magic Link */}
                <form onSubmit={handleMagicLink} className="space-y-3">
                  <Field>
                    <FieldLabel htmlFor="login-email" className="sr-only">
                      Email
                    </FieldLabel>
                    <Input
                      id="login-email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="Masukkan email Anda"
                      className="h-11 rounded-xl border-white/10 bg-white/5 px-4 text-white placeholder:text-sidebar-foreground"
                      required
                    />
                  </Field>
                  <Button
                    type="submit"
                    size="lg"
                    disabled={loading || !email}
                    className="w-full"
                  >
                    {loading ? <Loader2 size={16} className="animate-spin" /> : <Mail size={16} />}
                    Kirim Magic Link
                  </Button>
                </form>

                {authError && (
                  <Alert variant="destructive" className="border-red-400/30 bg-red-950/20 text-red-200">
                    <AlertDescription className="text-center text-xs text-red-200">
                      {authError}
                    </AlertDescription>
                  </Alert>
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
                  {[1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-14 rounded-xl bg-white/5" />
                  ))}
                </div>
              ) : (
                <div className="space-y-4">
                  {admins.map((user) => (
                    <motion.div
                      key={user.id}
                      whileTap={{ scale: 0.98 }}
                    >
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => handleDemoLogin(user.id)}
                      disabled={loginLoading !== null}
                      className="h-auto w-full justify-start gap-3 rounded-xl border border-primary/20 bg-primary/10 p-3 text-left hover:border-primary/40 hover:bg-primary/15"
                    >
                      <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center shrink-0">
                        <span className="text-white text-sm font-bold">{user.name?.[0] ?? "A"}</span>
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-white font-medium text-sm truncate">{user.name ?? user.email}</p>
                        <p className="text-sidebar-foreground text-xs">Admin Sekolah</p>
                      </div>
                      {loginLoading === user.id && <Loader2 size={16} className="text-white animate-spin" />}
                    </Button>
                    </motion.div>
                  ))}

                  <p className="text-sidebar-foreground text-xs uppercase tracking-wider font-semibold pt-2">Guru ({teachers.length})</p>
                  <div className="max-h-48 overflow-y-auto space-y-1 pr-1">
                    {teachers.map((user, i) => (
                      <motion.div
                        key={user.id}
                        initial={{ opacity: 0, x: -8 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.03 * i }}
                        whileTap={{ scale: 0.98 }}
                      >
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => handleDemoLogin(user.id)}
                        disabled={loginLoading !== null}
                        className="h-auto w-full justify-start gap-3 rounded-xl p-2.5 text-left text-white/90 hover:bg-white/5"
                      >
                        <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center shrink-0">
                          <span className="text-white/70 text-xs font-medium">{user.name?.[0] ?? "?"}</span>
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-white/90 text-sm truncate">{user.name}</p>
                          <p className="text-sidebar-foreground text-xs truncate">{user.email}</p>
                        </div>
                        {loginLoading === user.id && <Loader2 size={16} className="text-white animate-spin" />}
                      </Button>
                      </motion.div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
          </CardContent>
        </Card>

        <p className="text-center text-sidebar-foreground text-xs mt-6">
          {isSupabaseConfigured ? "Talib by An Nisaa' Sekolahku" : "Demo mode — Supabase Auth belum dikonfigurasi"}
        </p>
        <LegalFooter />
      </motion.div>
    </main>
  );
}
