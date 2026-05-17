import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/db";
import { formatDate } from "@/lib/format";

export type ActivityEvent = {
  id: string;
  actorName: string;
  actorInitials: string;
  verb: string;
  target: string;
  href: string;
  timestamp: string; // ISO
};

type WhitelistedEntity =
  | "Employee"
  | "LeaveRequest"
  | "PayrollRun"
  | "Invoice"
  | "Admission"
  | "StudentEnrollment";

type VerbKey = `${WhitelistedEntity}.${string}`;

type VerbBuilder = (target: string) => { verb: string; href: string };

const VERB_MAP: Record<VerbKey, VerbBuilder> = {
  "LeaveRequest.create": (t) => ({ verb: `mengajukan cuti untuk ${t}`, href: "/admin/leave-requests" }),
  "LeaveRequest.approve": (t) => ({ verb: `menyetujui cuti ${t}`, href: "/admin/leave-requests" }),
  "LeaveRequest.reject": (t) => ({ verb: `menolak cuti ${t}`, href: "/admin/leave-requests" }),
  "Employee.create": (t) => ({ verb: `menambah karyawan ${t}`, href: "/admin/employees" }),
  "Employee.update": (t) => ({ verb: `memperbarui data ${t}`, href: "/admin/employees" }),
  "PayrollRun.create": (t) => ({ verb: `membuat penggajian ${t}`, href: "/admin/payroll" }),
  "PayrollRun.approve": (t) => ({ verb: `menyetujui penggajian ${t}`, href: "/admin/payroll" }),
  "Invoice.create": (t) => ({ verb: `membuat tagihan ${t}`, href: "/admin/invoices" }),
  "Invoice.payment": (t) => ({ verb: `mencatat pembayaran ${t}`, href: "/admin/invoices" }),
  "Admission.create": (t) => ({ verb: `pendaftaran baru: ${t}`, href: "/admin/admissions" }),
  "Admission.update": (t) => ({ verb: `memperbarui pendaftaran ${t}`, href: "/admin/admissions" }),
  "StudentEnrollment.create": (t) => ({ verb: `mendaftarkan siswa ${t}`, href: "/admin/enrollments" }),
};

const ENTITY_NAME_FIELD: Record<WhitelistedEntity, string> = {
  Employee: "nama",
  LeaveRequest: "id",
  PayrollRun: "periodStart",
  Invoice: "invoiceNumber",
  Admission: "childName",
  StudentEnrollment: "id",
};

function initialsFor(name: string | null | undefined): string {
  if (!name) return "??";
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p.charAt(0).toUpperCase()).join("") || "??";
}

async function fetchRecentActivityImpl(
  tenantId: string,
  limit: number = 8
): Promise<ActivityEvent[]> {
  const rows = await prisma.auditLog.findMany({
    where: { tenantId },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  if (rows.length === 0) return [];

  const grouped = new Map<WhitelistedEntity, Set<string>>();
  for (const row of rows) {
    const key = `${row.entity}.${row.action}` as VerbKey;
    if (!(key in VERB_MAP)) continue;
    const ent = row.entity as WhitelistedEntity;
    if (!grouped.has(ent)) grouped.set(ent, new Set());
    grouped.get(ent)!.add(row.entityId);
  }

  const actorIds = Array.from(new Set(rows.map((r) => r.actorId)));
  const [users, ...entityResults] = await Promise.all([
    prisma.user.findMany({
      where: { id: { in: actorIds } },
      select: { id: true, name: true, email: true },
    }),
    ...Array.from(grouped.entries()).map(([entity, ids]) => {
      const idArr = Array.from(ids);
      const nameField = ENTITY_NAME_FIELD[entity];
      return resolveEntityNames(entity, idArr, nameField).then(
        (map) => [entity, map] as const
      );
    }),
  ]);

  const userMap = new Map(users.map((u) => [u.id, u]));
  const entityMaps = new Map(entityResults);

  const events: ActivityEvent[] = [];
  for (const row of rows) {
    const key = `${row.entity}.${row.action}` as VerbKey;
    const builder = VERB_MAP[key];
    if (!builder) continue;
    const ent = row.entity as WhitelistedEntity;
    const targetName = entityMaps.get(ent)?.get(row.entityId);
    if (!targetName) continue;
    const displayName =
      ent === "PayrollRun"
        ? formatDate(targetName, { month: "long", year: "numeric" })
        : targetName;
    const user = userMap.get(row.actorId);
    const actorName = user?.name?.trim() || user?.email?.split("@")[0] || "Pengguna";
    const { verb, href } = builder(displayName);
    events.push({
      id: row.id,
      actorName,
      actorInitials: initialsFor(actorName),
      verb,
      target: displayName,
      href,
      timestamp: row.createdAt.toISOString(),
    });
  }

  return events;
}

async function resolveEntityNames(
  entity: WhitelistedEntity,
  ids: string[],
  nameField: string
): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const delegate = (prisma as unknown as Record<string, { findMany: (args: unknown) => Promise<Array<Record<string, unknown>>> }>)[
    entity.charAt(0).toLowerCase() + entity.slice(1)
  ];
  const rows = await delegate.findMany({
    where: { id: { in: ids } },
    select: { id: true, [nameField]: true },
  });
  const map = new Map<string, string>();
  for (const row of rows) {
    const val = row[nameField];
    if (typeof val === "string" && val.length > 0) {
      map.set(row.id as string, val);
    }
  }
  return map;
}

export const getRecentActivity = unstable_cache(
  fetchRecentActivityImpl,
  ["dashboard-recent-activity"],
  { revalidate: 60, tags: ["activity-feed"] }
);
