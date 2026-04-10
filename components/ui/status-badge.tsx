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
  PRESENT: { label: "Hadir", className: "bg-status-present-subtle text-status-present-text" },
  LATE: { label: "Terlambat", className: "bg-status-late-subtle text-status-late-text" },
  ABSENT: { label: "Tidak Hadir", className: "bg-status-absent-subtle text-status-absent-text" },
  LEAVE: { label: "Cuti", className: "bg-status-leave-subtle text-status-leave-text" },
  HOLIDAY: { label: "Libur", className: "bg-status-holiday-subtle text-status-holiday-text" },
  HALF_DAY: { label: "Setengah Hari", className: "bg-status-late-subtle text-status-late-text" },
  PRESENT_NO_CHECKOUT: { label: "Hadir Tanpa Pulang", className: "bg-status-no-checkout-subtle text-status-late-text" },

  // Leave
  PENDING: { label: "Menunggu", className: "bg-status-late-subtle text-status-late-text" },
  APPROVED: { label: "Disetujui", className: "bg-status-present-subtle text-status-present-text" },
  REJECTED: { label: "Ditolak", className: "bg-status-absent-subtle text-status-absent-text" },
  CANCELLED: { label: "Dibatalkan", className: "bg-muted text-muted-foreground" },

  // Payroll
  DRAFT: { label: "Draft", className: "bg-muted text-muted-foreground" },
  EXPORTED: { label: "Diekspor", className: "bg-status-leave-subtle text-status-leave-text" },
  SLIPS_SENT: { label: "Slip Terkirim", className: "bg-status-holiday-subtle text-status-holiday-text" },

  // Employee
  ACTIVE: { label: "Aktif", className: "bg-status-present-subtle text-status-present-text" },
  INACTIVE: { label: "Tidak Aktif", className: "bg-muted text-muted-foreground" },

  // Invoice (future)
  SENT: { label: "Terkirim", className: "bg-status-leave-subtle text-status-leave-text" },
  PAID: { label: "Lunas", className: "bg-status-present-subtle text-status-present-text" },
  OVERDUE: { label: "Jatuh Tempo", className: "bg-status-absent-subtle text-status-absent-text" },
  PARTIALLY_PAID: { label: "Sebagian", className: "bg-status-late-subtle text-status-late-text" },

  // Admission (future)
  INQUIRY: { label: "Pertanyaan", className: "bg-status-leave-subtle text-status-leave-text" },
  VISIT_SCHEDULED: { label: "Kunjungan", className: "bg-status-late-subtle text-status-late-text" },
  VISITED: { label: "Sudah Kunjungan", className: "bg-status-holiday-subtle text-status-holiday-text" },
  ADMITTED: { label: "Diterima", className: "bg-status-present-subtle text-status-present-text" },
  REGISTERED: { label: "Terdaftar", className: "bg-primary/10 text-primary" },
  ENROLLED: { label: "Terdaftar di Kelas", className: "bg-status-present-subtle text-status-present-text" },
  GRADUATED: { label: "Lulus", className: "bg-status-holiday-subtle text-status-holiday-text" },
  WITHDRAWN: { label: "Keluar", className: "bg-muted text-muted-foreground" },

  // Student attendance (future)
  SICK: { label: "Sakit", className: "bg-status-absent-subtle text-status-absent-text" },
  PERMISSION: { label: "Izin", className: "bg-status-leave-subtle text-status-leave-text" },

  // Leave types
  ANNUAL: { label: "Cuti Tahunan", className: "bg-status-leave-subtle text-status-leave-text" },
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
