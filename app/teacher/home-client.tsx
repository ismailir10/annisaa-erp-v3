"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { MapPin, BookHeart } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/portal/page-header";
import { formatDate, formatTime } from "@/lib/format";

type TodayRecord = {
  status: string;
  checkInTime: string | null;
  checkOutTime: string | null;
};

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
  const [gpsStatus, setGpsStatus] = useState<string>("Menunggu...");

  // Live clock
  useEffect(() => {
    const interval = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

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
    setLoading(true);
    const gps = await getGPS();
    const endpoint = hasCheckedIn ? "/api/attendance/check-out" : "/api/attendance/check-in";

    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lat: gps?.lat, lng: gps?.lng }),
    });

    if (res.ok) {
      const data = await res.json();
      setRecord({
        status: data.status,
        checkInTime: data.checkInTime,
        checkOutTime: data.checkOutTime,
      });
      setSuccess(hasCheckedIn ? "Pulang tercatat" : "Clock-in tersimpan");
      setTimeout(() => setSuccess(null), 2000);
      router.refresh();
    } else {
      const data = await res.json().catch(() => ({}));
      setSuccess(null);
      toast.error(data.error || "Absensi tidak tersimpan. Coba ketuk ulang ya.");
    }
    setLoading(false);
  }

  const timeStr = formatTime(time.toISOString());
  const dateStr = formatDate(time.toISOString().split("T")[0], {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const greeting = time.getHours() < 12 ? "Pagi" : time.getHours() < 15 ? "Siang" : time.getHours() < 18 ? "Sore" : "Malam";
  const firstName = userName.split(" ")[0];

  return (
    <div className="px-5 pt-8 pb-4">
      {/* Greeting */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <PageHeader
          title={`Selamat ${greeting}, Ustadz/Ustadzah ${firstName}`}
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
