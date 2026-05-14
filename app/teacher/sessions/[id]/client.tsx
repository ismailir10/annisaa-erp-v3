"use client";

import { useState, useCallback } from "react";
import { motion } from "framer-motion";
import { LogIn, LogOut, Users } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/portal/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/ui/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { formatDate, formatTime } from "@/lib/format";

// Prisma enum values — do NOT translate in code, only display labels.
const ROTATION = ["PRESENT", "ABSENT", "SICK", "PERMISSION"] as const;
type Status = (typeof ROTATION)[number];

// Mirrors .claude/standards/portal.md Daily Data Entry recipe — cycle-tap the
// status, row-tinted by current state for a 3 m glance.
const ROW_TINT: Record<Status, string> = {
  PRESENT: "bg-[color:var(--status-present-subtle)]",
  ABSENT: "bg-[color:var(--status-absent-subtle)]",
  SICK: "bg-[color:var(--status-late-subtle)]",
  PERMISSION: "bg-[color:var(--status-leave-subtle)]",
};

// pickedUpByRelation enum → Indonesian display labels.
const PICKUP_RELATIONS: { value: string; label: string }[] = [
  { value: "PARENT", label: "Orang tua" },
  { value: "GUARDIAN", label: "Wali" },
  { value: "GRANDPARENT", label: "Kakek/Nenek" },
  { value: "SIBLING", label: "Kakak/Saudara" },
  { value: "DRIVER", label: "Sopir" },
  { value: "HOUSEHOLD_HELPER", label: "ART" },
  { value: "OTHER", label: "Lainnya" },
];

const SLOT_LABEL: Record<string, string> = {
  FULL_DAY: "Sehari penuh",
  MORNING: "Pagi",
  AFTERNOON: "Siang",
};

type RosterRow = {
  studentId: string;
  name: string;
  nickname: string | null;
  status: string;
  checkInTime: string | null;
  checkOutTime: string | null;
  pickedUpByRelation: string | null;
  pickedUpByName: string | null;
};

export function SessionRosterClient({
  sessionId,
  className,
  date,
  slot,
  roster,
}: {
  sessionId: string;
  className: string;
  date: string;
  slot: string;
  roster: RosterRow[];
}) {
  const [rows, setRows] = useState<RosterRow[]>(roster);
  const [saving, setSaving] = useState(false);

  const update = useCallback(
    (studentId: string, patch: Partial<RosterRow>) => {
      setRows((prev) =>
        prev.map((r) => (r.studentId === studentId ? { ...r, ...patch } : r)),
      );
    },
    [],
  );

  function cycleStatus(studentId: string, current: string) {
    const idx = ROTATION.indexOf(current as Status);
    const next = ROTATION[(idx + 1) % ROTATION.length];
    update(studentId, { status: next });
  }

  function tapIn(studentId: string) {
    update(studentId, { checkInTime: new Date().toISOString() });
  }

  function tapOut(studentId: string) {
    update(studentId, { checkOutTime: new Date().toISOString() });
  }

  async function handleSave() {
    if (saving) return;

    // Client-side guard for the OTHER-requires-name rule so the teacher gets
    // an instant, row-specific message instead of a generic 400.
    const missingName = rows.find(
      (r) =>
        r.pickedUpByRelation === "OTHER" &&
        (!r.pickedUpByName || r.pickedUpByName.trim().length === 0),
    );
    if (missingName) {
      toast.error(
        `Isi nama penjemput untuk ${missingName.name} (hubungan: Lainnya).`,
      );
      return;
    }

    setSaving(true);
    try {
      const res = await fetch(
        `/api/teacher/sessions/${sessionId}/attendance`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            rows: rows.map((r) => ({
              studentId: r.studentId,
              status: r.status,
              checkInTime: r.checkInTime,
              checkOutTime: r.checkOutTime,
              pickedUpByRelation: r.pickedUpByRelation,
              pickedUpByName: r.pickedUpByName?.trim() || null,
            })),
          }),
        },
      );
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        toast.error(
          d?.message || d?.error || "Absensi tidak tersimpan. Coba lagi ya.",
        );
        return;
      }
      const body = await res.json().catch(() => ({ saved: 0, total: 0 }));
      toast.success(`Absensi tersimpan (${body.saved}/${body.total} siswa).`);
    } catch {
      toast.error("Koneksi terputus. Coba lagi sebentar ya.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <PageHeader
        title={className}
        subtitle={`${formatDate(date)} • ${SLOT_LABEL[slot] ?? slot}`}
      />

      {rows.length === 0 ? (
        <div data-empty-state="no-students">
          <EmptyState
            icon={Users}
            title="Belum ada siswa di sesi ini"
            description="Minta admin untuk mendaftarkan siswa ke kelas ini."
          />
        </div>
      ) : (
        <>
          <div className="space-y-2">
            {rows.map((r, i) => {
              const status = r.status as Status;
              return (
                <motion.div
                  key={r.studentId}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.02 }}
                  data-testid="roster-row"
                  className={`rounded-lg border border-border p-3 ${ROW_TINT[status]}`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{r.name}</p>
                      {r.nickname && (
                        <p className="text-xs text-muted-foreground truncate">
                          {r.nickname}
                        </p>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => cycleStatus(r.studentId, r.status)}
                      className="shrink-0"
                      aria-label={`Ubah status ${r.name}`}
                    >
                      <StatusBadge status={status} />
                    </button>
                  </div>

                  <div className="mt-2 flex items-center gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant={r.checkInTime ? "secondary" : "outline"}
                      onClick={() => tapIn(r.studentId)}
                      disabled={!!r.checkInTime}
                    >
                      <LogIn />
                      {r.checkInTime
                        ? `Masuk ${formatTime(r.checkInTime)}`
                        : "Tap Masuk"}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={r.checkOutTime ? "secondary" : "outline"}
                      onClick={() => tapOut(r.studentId)}
                      disabled={!r.checkInTime || !!r.checkOutTime}
                    >
                      <LogOut />
                      {r.checkOutTime
                        ? `Pulang ${formatTime(r.checkOutTime)}`
                        : "Tap Pulang"}
                    </Button>
                  </div>

                  {r.checkOutTime && (
                    <div className="mt-2 space-y-2 rounded-md bg-card/60 p-2">
                      <p className="text-xs font-medium text-muted-foreground">
                        Dijemput oleh
                      </p>
                      <Select
                        value={r.pickedUpByRelation ?? ""}
                        onValueChange={(v) =>
                          update(r.studentId, {
                            pickedUpByRelation: v || null,
                          })
                        }
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Pilih hubungan" />
                        </SelectTrigger>
                        <SelectContent>
                          {PICKUP_RELATIONS.map((rel) => (
                            <SelectItem key={rel.value} value={rel.value}>
                              {rel.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {r.pickedUpByRelation && (
                        <Input
                          value={r.pickedUpByName ?? ""}
                          onChange={(e) =>
                            update(r.studentId, {
                              pickedUpByName: e.target.value,
                            })
                          }
                          placeholder={
                            r.pickedUpByRelation === "OTHER"
                              ? "Nama penjemput (wajib)"
                              : "Nama penjemput (opsional)"
                          }
                          aria-invalid={
                            r.pickedUpByRelation === "OTHER" &&
                            !r.pickedUpByName?.trim()
                          }
                        />
                      )}
                    </div>
                  )}
                </motion.div>
              );
            })}
          </div>

          <div className="sticky bottom-20 mt-4">
            <Button
              type="button"
              className="w-full"
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? "Menyimpan..." : "Simpan"}
            </Button>
          </div>

          <p className="mt-3 text-center text-xs text-muted-foreground">
            Ketuk badge status untuk mengubah (Hadir → Alpa → Sakit → Izin)
          </p>
        </>
      )}
    </div>
  );
}
