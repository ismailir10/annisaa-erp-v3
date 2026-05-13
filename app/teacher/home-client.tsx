"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { MapPin, BookHeart } from "lucide-react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/portal/page-header";
import { formatDate, formatTime } from "@/lib/format";

type TodayRecord = {
  status: string;
  checkInTime: string | null;
  checkOutTime: string | null;
};

/** Pure helper: derive optimistic next state for the status card.
 *  Exported for unit testing — no React, no fetch, no side effects.
 */
export function nextStateAfterAction(
  record: TodayRecord | null,
  action: "check-in" | "check-out",
  now: string = new Date().toISOString()
): TodayRecord {
  if (action === "check-in") {
    return {
      status: "PRESENT",
      checkInTime: record?.checkInTime ?? now,
      checkOutTime: record?.checkOutTime ?? null,
    };
  }
  return {
    status: record?.status ?? "PRESENT",
    checkInTime: record?.checkInTime ?? now,
    checkOutTime: record?.checkOutTime ?? now,
  };
}

export function TeacherHomeClient({
  userName,
  todayRecord: initialRecord,
}: {
  userName: string;
  todayRecord: TodayRecord | null;
}) {
  const router = useRouter();
  const [record, setRecord] = useState(initialRecord);
  const [time, setTime] = useState(new Date());
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [gpsStatus, setGpsStatus] = useState<string>("Menunggu...");
  // FIND-015: defer time-dependent rendering until after client mount.
  // Pre-fix, `time = new Date()` initialised differently server-vs-client
  // (UTC vs WIB), producing the date string mismatch on the greeting line
  // and tripping React error #418 (text content mismatch) when no
  // AttendanceRecord existed to mask the divergence with a checked-in card.
  const [mounted, setMounted] = useState(false);

  // Live clock + mounted flag — both need the client to be active first.
  useEffect(() => {
    setMounted(true);
    const interval = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  // Auto-clear inline error after 5 s
  useEffect(() => {
    if (!actionError) return;
    const t = setTimeout(() => setActionError(null), 5000);
    return () => clearTimeout(t);
  }, [actionError]);

  const getGPS = useCallback((): Promise<{ lat: number; lng: number } | null> => {
    return new Promise((resolve) => {
      if (!navigator.geolocation) {
        setGpsStatus("GPS tidak tersedia");
        resolve(null);
        return;
      }
      setGpsStatus("Mengambil lokasi...");
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setGpsStatus(`${pos.coords.latitude.toFixed(4)}, ${pos.coords.longitude.toFixed(4)}`);
          resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        },
        () => {
          setGpsStatus("GPS ditolak");
          resolve(null);
        },
        { timeout: 10000, enableHighAccuracy: true }
      );
    });
  }, []);

  const hasCheckedIn = !!record?.checkInTime;
  const hasCheckedOut = !!record?.checkOutTime;

  async function handleAction() {
    if (loading) return;
    setLoading(true);
    setActionError(null);

    // Determine action before any await so the optimistic state is correct
    const action: "check-in" | "check-out" = hasCheckedIn ? "check-out" : "check-in";
    const endpoint = action === "check-out" ? "/api/attendance/check-out" : "/api/attendance/check-in";

    // --- OPTIMISTIC FLIP --- flip the card BEFORE GPS capture + network
    const previousRecord = record;
    setRecord(nextStateAfterAction(record, action));

    // GPS capture (may be denied → undefined coords; POST still fires — unchanged)
    const gps = await getGPS();

    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lat: gps?.lat, lng: gps?.lng }),
    });

    if (res.ok) {
      const data = await res.json();
      // Confirm with server-authoritative values
      setRecord({
        status: data.status,
        checkInTime: data.checkInTime,
        checkOutTime: data.checkOutTime,
      });
      setSuccess(action === "check-out" ? "Pulang tercatat" : "Clock-in tersimpan");
      setTimeout(() => setSuccess(null), 2000);
      router.refresh();
    } else {
      // Revert optimistic state on failure
      setRecord(previousRecord);
      setActionError("Gagal mencatat absensi. Coba lagi sebentar.");
    }
    setLoading(false);
  }

  // Until mounted, render placeholders for time-derived strings so server
  // SSR and client first-render produce identical HTML. Once `mounted` flips
  // true via the useEffect above, the real clock takes over.
  const timeStr = mounted ? formatTime(time.toISOString()) : "";
  const dateStr = mounted
    ? formatDate(time.toISOString().split("T")[0], {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : "";

  const greeting = mounted
    ? time.getHours() < 12 ? "Pagi" : time.getHours() < 15 ? "Siang" : time.getHours() < 18 ? "Sore" : "Malam"
    : "Datang";

  return (
    <div>
      {/* Greeting */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <PageHeader
          title={`Selamat ${greeting}, Ustadz/Ustadzah ${userName}`}
          subtitle={dateStr}
          className="mb-0"
        />
      </motion.div>

      {/* Clock + Check-in button */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.15, duration: 0.4 }}
        className="mt-8 flex flex-col items-center"
      >
        <p className="font-currency text-display font-bold tracking-tight mb-6">
          {timeStr}
        </p>

        <div className="relative">
          <AnimatePresence mode="wait">
            {success ? (
              <motion.div
                key="success"
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.8, opacity: 0 }}
                className="w-36 h-36 rounded-full bg-status-present flex items-center justify-center"
              >
                <motion.span
                  initial={{ scale: 0 }}
                  animate={{ scale: [0, 1.3, 1] }}
                  transition={{ duration: 0.4 }}
                  className="text-white text-4xl"
                >
                  ✓
                </motion.span>
              </motion.div>
            ) : (
              <motion.button
                key="button"
                whileHover={!hasCheckedOut && !loading ? { scale: 1.03 } : {}}
                whileTap={!hasCheckedOut && !loading ? { scale: 0.95 } : {}}
                onClick={handleAction}
                disabled={hasCheckedOut || loading}
                className={`w-36 h-36 rounded-full flex items-center justify-center text-white font-bold text-lg shadow-lg transition-colors ${
                  hasCheckedOut
                    ? "bg-status-present cursor-default"
                    : hasCheckedIn
                    ? "bg-status-late hover:opacity-90"
                    : "bg-primary hover:opacity-90"
                } ${loading ? "opacity-70" : ""}`}
              >
                {loading
                  ? "..."
                  : hasCheckedOut
                  ? "Selesai ✓"
                  : hasCheckedIn
                  ? "PULANG"
                  : "MASUK"}
              </motion.button>
            )}
          </AnimatePresence>
        </div>

        <p className="text-muted-foreground text-xs mt-4">
          {hasCheckedOut
            ? "Anda sudah pulang hari ini"
            : hasCheckedIn
            ? "Ketuk untuk mencatat kepulangan"
            : "Ketuk untuk mulai absensi"}
        </p>

        {/* Inline error (voice.md: supportive, non-blame) */}
        <AnimatePresence>
          {actionError && (
            <motion.p
              key="action-error"
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="mt-3 text-xs text-status-late-text text-center px-4"
              role="alert"
            >
              {actionError}
            </motion.p>
          )}
        </AnimatePresence>

        {/* GPS info */}
        <div className="flex items-center gap-1 text-xs text-muted-foreground mt-2">
          <MapPin size={10} />
          <span>{gpsStatus}</span>
        </div>
      </motion.div>

      {/* Quick links */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.25, duration: 0.4 }}
        className="mt-6"
      >
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
          Akses Cepat
        </p>
        <Link
          href="/teacher/student-journal"
          className="flex items-center gap-3 p-3 rounded-xl border border-border bg-card hover:border-primary/30 transition-colors"
        >
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <BookHeart size={20} className="text-primary" />
          </div>
          <div>
            <p className="text-sm font-medium">Buku Penghubung</p>
            <p className="text-xs text-muted-foreground">Isi catatan harian siswa</p>
          </div>
        </Link>
      </motion.div>

      {/* Today status */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3, duration: 0.4 }}
        className="mt-6"
      >
        <Card className="p-card">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
            Status Hari Ini
          </p>
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <p className="text-xs text-muted-foreground">Masuk</p>
              <p className="font-currency text-sm font-semibold mt-0.5">
                {formatTime(record?.checkInTime ?? null)}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Pulang</p>
              <p className="font-currency text-sm font-semibold mt-0.5">
                {formatTime(record?.checkOutTime ?? null)}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Status</p>
              <p className="text-sm font-semibold mt-0.5">
                {record?.status === "PRESENT" && <span className="text-status-present-text">Hadir</span>}
                {record?.status === "LATE" && <span className="text-status-late-text">Terlambat</span>}
                {record?.status === "PRESENT_NO_CHECKOUT" && <span className="text-status-late-text">Hadir</span>}
                {!record && <span className="text-muted-foreground">—</span>}
              </p>
            </div>
          </div>
        </Card>
      </motion.div>
    </div>
  );
}
