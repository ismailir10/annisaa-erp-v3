import { prisma } from "@/lib/db";
import { formatDateShort, formatRupiah } from "@/lib/format";
import type { ParentActivityItem } from "@/lib/validations/parent-activity";

const ATTENDANCE_LABEL: Record<string, string> = {
  PRESENT: "Hadir",
  ABSENT: "Tidak hadir",
  SICK: "Sakit",
  PERMISSION: "Izin",
  LATE: "Terlambat",
};

/**
 * Build the merged "recent activity" feed for a single child across
 * attendance, journal notes/entries, invoices, and assessments.
 *
 * Caller is responsible for tenant-scoping `studentId` upstream
 * (typically via `requireGuardianForStudent` or `getParentWithChildren`).
 */
export async function getStudentRecentActivity(
  studentId: string,
  tenantId: string,
  opts: { limit?: number; days?: number } = {},
): Promise<ParentActivityItem[]> {
  const limit = opts.limit ?? 7;
  const days = opts.days ?? 30;

  const sinceDate = new Date();
  sinceDate.setDate(sinceDate.getDate() - days);
  const sinceYmd = sinceDate.toISOString().slice(0, 10);
  const childQuery = `?child=${studentId}`;

  const [attendance, notes, journalEntries, invoices, assessments] =
    await Promise.all([
      prisma.studentAttendance.findMany({
        where: {
          studentId,
          isVoided: false,
          date: { gte: sinceYmd },
          student: { tenantId },
        },
        orderBy: { date: "desc" },
        take: limit,
        select: { id: true, date: true, status: true, createdAt: true },
      }),
      prisma.studentJournalNote.findMany({
        where: {
          tenantId,
          studentId,
          status: "ACTIVE",
          createdAt: { gte: sinceDate },
        },
        orderBy: { createdAt: "desc" },
        take: limit,
        select: {
          id: true,
          date: true,
          authorUserId: true,
          authorRole: true,
          body: true,
          createdAt: true,
        },
      }),
      prisma.studentJournalEntry.findMany({
        where: { tenantId, studentId, date: { gte: sinceYmd } },
        orderBy: { createdAt: "desc" },
        take: limit * 4,
        select: { id: true, date: true, createdAt: true },
      }),
      prisma.invoice.findMany({
        where: {
          studentId,
          tenantId,
          // Same allow-list as getParentInvoiceList — never surface
          // PENDING_PAYMENT_LINK or CANCELLED rows in the parent activity feed.
          status: { in: ["SENT", "PARTIALLY_PAID", "OVERDUE", "PAID"] },
          OR: [
            { sentAt: { gte: sinceDate } },
            { paidAt: { gte: sinceDate } },
            { createdAt: { gte: sinceDate } },
          ],
        },
        orderBy: { createdAt: "desc" },
        take: limit,
        select: {
          id: true,
          periodLabel: true,
          totalDue: true,
          totalPaid: true,
          status: true,
          sentAt: true,
          paidAt: true,
          createdAt: true,
        },
      }),
      prisma.studentAssessment.findMany({
        where: {
          studentId,
          status: "PUBLISHED",
          OR: [
            { publishedAt: { gte: sinceDate } },
            { createdAt: { gte: sinceDate } },
          ],
        },
        orderBy: { createdAt: "desc" },
        take: limit,
        select: {
          id: true,
          period: true,
          publishedAt: true,
          createdAt: true,
          template: { select: { name: true } },
        },
      }),
    ]);

  const noteAuthorIds = Array.from(new Set(notes.map((n) => n.authorUserId)));
  const noteAuthors = noteAuthorIds.length
    ? await prisma.user.findMany({
        where: { id: { in: noteAuthorIds } },
        select: { id: true, name: true },
      })
    : [];
  const authorName = new Map(noteAuthors.map((u) => [u.id, u.name]));

  const items: ParentActivityItem[] = [];

  for (const a of attendance) {
    items.push({
      id: `att-${a.id}`,
      timestamp: a.createdAt.toISOString(),
      kind: "ATTENDANCE_MARKED",
      title: `${ATTENDANCE_LABEL[a.status] ?? a.status} · ${formatDateShort(a.date)}`,
      href: `/parent/attendance${childQuery}`,
    });
  }

  for (const n of notes) {
    const snippet = n.body.length > 80 ? n.body.slice(0, 80) + "…" : n.body;
    const isGuardian = n.authorRole === "GUARDIAN";
    const author = authorName.get(n.authorUserId) ?? "guru";
    const title = isGuardian
      ? `Catatan rumah: ${snippet}`
      : `Catatan dari ${author}: ${snippet}`;
    items.push({
      id: `note-${n.id}`,
      timestamp: n.createdAt.toISOString(),
      kind: "NOTE_POSTED",
      title,
      href: `/parent/student-journal${childQuery}&week=${n.date}`,
    });
  }

  const seenJournalDays = new Set<string>();
  for (const j of journalEntries) {
    if (seenJournalDays.has(j.date)) continue;
    seenJournalDays.add(j.date);
    items.push({
      id: `journal-${j.date}`,
      timestamp: j.createdAt.toISOString(),
      kind: "JOURNAL_ENTRY",
      title: `Aktivitas sekolah tercatat · ${formatDateShort(j.date)}`,
      href: `/parent/student-journal${childQuery}&week=${j.date}`,
    });
  }

  for (const inv of invoices) {
    const issuedAt = inv.sentAt ?? inv.createdAt;
    if (issuedAt && issuedAt >= sinceDate) {
      items.push({
        id: `inv-issued-${inv.id}`,
        timestamp: issuedAt.toISOString(),
        kind: "INVOICE_ISSUED",
        title: `Tagihan baru · ${inv.periodLabel}`,
        detail: formatRupiah(Number(inv.totalDue)),
        href: `/parent/invoices${childQuery}`,
      });
    }
    if (inv.paidAt && inv.paidAt >= sinceDate) {
      items.push({
        id: `inv-paid-${inv.id}`,
        timestamp: inv.paidAt.toISOString(),
        kind: "PAYMENT_RECEIVED",
        title: `Pembayaran diterima · ${formatRupiah(Number(inv.totalPaid))}`,
        detail: inv.periodLabel,
        href: `/parent/invoices${childQuery}`,
      });
    }
  }

  for (const a of assessments) {
    const ts = a.publishedAt ?? a.createdAt;
    items.push({
      id: `report-${a.id}`,
      timestamp: ts.toISOString(),
      kind: "REPORT_PUBLISHED",
      title: `Rapor ${a.period} tersedia`,
      detail: a.template.name,
      href: `/parent/reports${childQuery}`,
    });
  }

  items.sort((x, y) => (x.timestamp < y.timestamp ? 1 : -1));
  return items.slice(0, limit);
}
