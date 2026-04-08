"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { motion } from "framer-motion";

type UserOption = {
  id: string;
  email: string;
  name: string | null;
  role: string;
  employeeId: string | null;
};

export default function LoginPage() {
  const router = useRouter();
  const [users, setUsers] = useState<UserOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [loginLoading, setLoginLoading] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/auth/users")
      .then((r) => r.json())
      .then((data) => {
        setUsers(data);
        setLoading(false);
      });
  }, []);

  async function handleLogin(userId: string) {
    setLoginLoading(userId);
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
    });
    const data = await res.json();
    if (data.ok) {
      router.push(data.redirectUrl);
    }
  }

  const admins = users.filter((u) => u.role === "SCHOOL_ADMIN");
  const teachers = users.filter((u) => u.role === "TEACHER");

  return (
    <main className="min-h-screen flex items-center justify-center bg-[#1A2E2F] px-4">
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
          <p className="text-[#8AACAD] mt-2 text-sm">
            Sistem Kehadiran &amp; Penggajian
          </p>
        </div>

        {/* Login Card */}
        <div className="bg-[#223838] rounded-2xl p-6 border border-white/5">
          <p className="text-[#8AACAD] text-xs uppercase tracking-wider font-semibold mb-4">
            Pilih Akun
          </p>

          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="h-14 rounded-xl bg-white/5 animate-pulse"
                />
              ))}
            </div>
          ) : (
            <div className="space-y-5">
              {/* Admin */}
              {admins.map((user) => (
                <motion.button
                  key={user.id}
                  whileHover={{ scale: 1.01 }}
                  whileTap={{ scale: 0.99 }}
                  onClick={() => handleLogin(user.id)}
                  disabled={loginLoading !== null}
                  className="w-full flex items-center gap-3 p-3 rounded-xl bg-[#5DB4B8]/10 border border-[#5DB4B8]/20 hover:border-[#5DB4B8]/40 transition-colors text-left disabled:opacity-50"
                >
                  <div className="w-10 h-10 rounded-full bg-[#5DB4B8] flex items-center justify-center shrink-0">
                    <span className="text-white text-sm font-bold">
                      {user.name?.[0] ?? "A"}
                    </span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-white font-medium text-sm truncate">
                      {user.name ?? user.email}
                    </p>
                    <p className="text-[#8AACAD] text-xs">School Admin</p>
                  </div>
                  {loginLoading === user.id && (
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  )}
                </motion.button>
              ))}

              {/* Teachers */}
              <p className="text-[#8AACAD] text-xs uppercase tracking-wider font-semibold pt-2">
                Guru ({teachers.length})
              </p>
              <div className="max-h-64 overflow-y-auto space-y-1.5 pr-1 scrollbar-thin">
                {teachers.map((user, i) => (
                  <motion.button
                    key={user.id}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.05 * i, duration: 0.3 }}
                    whileHover={{ scale: 1.01 }}
                    whileTap={{ scale: 0.99 }}
                    onClick={() => handleLogin(user.id)}
                    disabled={loginLoading !== null}
                    className="w-full flex items-center gap-3 p-2.5 rounded-xl hover:bg-white/5 transition-colors text-left disabled:opacity-50"
                  >
                    <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center shrink-0">
                      <span className="text-white/70 text-xs font-medium">
                        {user.name?.[0] ?? "?"}
                      </span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-white/90 text-sm truncate">
                        {user.name ?? user.email}
                      </p>
                      <p className="text-[#8AACAD] text-xs truncate">
                        {user.email}
                      </p>
                    </div>
                    {loginLoading === user.id && (
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    )}
                  </motion.button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <p className="text-center text-[#8AACAD] text-xs mt-6">
          Demo mode — akan diganti Supabase Auth
        </p>
      </motion.div>
    </main>
  );
}
