import { Badge } from "@/components/ui/badge";

/**
 * Status badge with consistent color mapping across the entire app.
 * Single source of truth for status → color mapping.
 */

type StatusConfig = {
  label: string;
  className: string;
};

const STATUS_MAP: Record<string, StatusConfig> = {
  // Attendance
  PRESENT: { label: "Hadir", className: "bg-status-present-subtle text-[#00875A]" },
  LATE: { label: "Terlambat", className: "bg-status-late-subtle text-[#B35C00]" },
  ABSENT: { label: "Tidak Hadir", className: "bg-status-absent-subtle text-[#CC0000]" },
  LEAVE: { label: "Cuti", className: "bg-status-leave-subtle text-[#0369A1]" },
  HOLIDAY: { label: "Libur", className: "bg-status-holiday-subtle text-[#6B21A8]" },
  HALF_DAY: { label: "Setengah Hari", className: "bg-status-late-subtle text-[#B35C00]" },
  PRESENT_NO_CHECKOUT: { label: "Hadir Tanpa Pulang", className: "bg-status-no-checkout-subtle text-[#B35C00]" },

  // Leave
  PENDING: { label: "Menunggu", className: "bg-status-late-subtle text-[#B35C00]" },
  APPROVED: { label: "Disetujui", className: "bg-status-present-subtle text-[#00875A]" },
  REJECTED: { label: "Ditolak", className: "bg-status-absent-subtle text-[#CC0000]" },
  CANCELLED: { label: "Dibatalkan", className: "bg-muted text-muted-foreground" },

  // Payroll
  DRAFT: { label: "Draft", className: "bg-muted text-muted-foreground" },
  EXPORTED: { label: "Diekspor", className: "bg-status-leave-subtle text-[#0369A1]" },
  SLIPS_SENT: { label: "Slip Terkirim", className: "bg-status-holiday-subtle text-[#6B21A8]" },

  // Employee
  ACTIVE: { label: "Aktif", className: "bg-status-present-subtle text-[#00875A]" },
  INACTIVE: { label: "Tidak Aktif", className: "bg-muted text-muted-foreground" },

  // Invoice (future)
  SENT: { label: "Terkirim", className: "bg-status-leave-subtle text-[#0369A1]" },
  PAID: { label: "Lunas", className: "bg-status-present-subtle text-[#00875A]" },
  OVERDUE: { label: "Jatuh Tempo", className: "bg-status-absent-subtle text-[#CC0000]" },
  PARTIALLY_PAID: { label: "Sebagian", className: "bg-status-late-subtle text-[#B35C00]" },

  // Admission (future)
  INQUIRY: { label: "Pertanyaan", className: "bg-status-leave-subtle text-[#0369A1]" },
  VISIT_SCHEDULED: { label: "Kunjungan", className: "bg-status-late-subtle text-[#B35C00]" },
  VISITED: { label: "Sudah Kunjungan", className: "bg-status-holiday-subtle text-[#6B21A8]" },
  ADMITTED: { label: "Diterima", className: "bg-status-present-subtle text-[#00875A]" },
  REGISTERED: { label: "Terdaftar", className: "bg-primary/10 text-primary" },
  ENROLLED: { label: "Terdaftar di Kelas", className: "bg-status-present-subtle text-[#00875A]" },
  GRADUATED: { label: "Lulus", className: "bg-status-holiday-subtle text-[#6B21A8]" },
  WITHDRAWN: { label: "Keluar", className: "bg-muted text-muted-foreground" },

  // Student attendance (future)
  SICK: { label: "Sakit", className: "bg-status-absent-subtle text-[#CC0000]" },
  PERMISSION: { label: "Izin", className: "bg-status-leave-subtle text-[#0369A1]" },

  // Leave types
  ANNUAL: { label: "Cuti Tahunan", className: "bg-status-leave-subtle text-[#0369A1]" },
  OTHER: { label: "Lainnya", className: "bg-muted text-muted-foreground" },
};

export function StatusBadge({
  status,
  label,
  className,
}: {
  status: string;
  label?: string; // Override the default label
  className?: string;
}) {
  const config = STATUS_MAP[status];
  return (
    <Badge
      variant="secondary"
      className={`text-[10px] ${config?.className ?? "bg-muted text-muted-foreground"} ${className ?? ""}`}
    >
      {label ?? config?.label ?? status}
    </Badge>
  );
}

/**
 * Get the status config for programmatic use (e.g., in charts).
 */
export function getStatusConfig(status: string): StatusConfig {
  return STATUS_MAP[status] ?? { label: status, className: "bg-muted text-muted-foreground" };
}
