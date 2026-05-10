# Admin Dashboard Shadcn Rebuild — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the admin dashboard at `/admin` using shadcn primitives, split the monolithic client into focused components, replace the bespoke CSS bar chart with `ChartContainer` (recharts), add a Pending Admissions row + Recent Activity feed sourced from `AuditLog`, and degrade per-section on query failure via `Promise.allSettled`.

**Architecture:** Server component (`app/admin/page.tsx`) does all parallel queries with `Promise.allSettled`, gates each by permission, then composes five focused child components from `components/admin/dashboard/*`. Activity feed humanisation lives in `lib/dashboard/activity-feed.ts` with a verb-mapping table and bounded batch lookups (one query per whitelisted entity type plus one for actors — no N+1). Cache via `unstable_cache` with tag `"activity-feed"`, invalidated centrally in `lib/audit.ts` on every `recordAudit` success.

**Tech Stack:** Next.js 16 (App Router, RSC), Prisma, recharts via `components/ui/chart.tsx` (shadcn ChartContainer), framer-motion (existing — kept on chart only, dropped elsewhere), Vitest, Playwright, Tailwind, lucide-react.

**Spec:** [docs/superpowers/specs/2026-05-03-dashboard-shadcn-rebuild-design.md](../specs/2026-05-03-dashboard-shadcn-rebuild-design.md)

---

## File Structure

**Create:**
- `lib/dashboard/activity-feed.ts` — `getRecentActivity(tenantId, limit)` with verb mapping + entity batch resolver. Wraps `unstable_cache` (60s, tag `"activity-feed"`). Owns the `ActivityEvent` type and the `VERB_MAP`.
- `lib/dashboard/__tests__/activity-feed.test.ts` — vitest unit suite mocking `prisma`.
- `components/admin/dashboard/stat-grid.tsx` — server component, 4 KPI cards row.
- `components/admin/dashboard/attendance-trend-chart.tsx` — `"use client"`, recharts stacked BarChart in a Card, with header link + empty state.
- `components/admin/dashboard/pending-actions.tsx` — server component, leave + admissions + payroll rows.
- `components/admin/dashboard/activity-feed.tsx` — server component, list of avatar + actor + verb + target + relative time, or `EmptyState`.
- `components/admin/dashboard/quick-actions.tsx` — server component, action grid filtered by perms. No animation.
- `components/admin/dashboard/index.ts` — barrel re-exports.
- `e2e/admin-dashboard.spec.ts` — Playwright coverage for stat cards, chart, pending actions, activity feed empty state, quick actions, and SCHOOL_ADMIN gating.

**Modify:**
- `app/admin/page.tsx` — switch to `Promise.allSettled`, add `pendingAdmissions` + `getRecentActivity` queries (perm-gated), compose new layout, drop the import of `DashboardClient`.
- `lib/audit.ts` — call `revalidateTag("activity-feed")` after a successful `auditLog.create`.

**Delete:**
- `app/admin/dashboard-client.tsx` — replaced by the components/admin/dashboard split.

---

## Task 1: Implement `lib/dashboard/activity-feed.ts` (TDD)

This is the pure-logic core — TDD it red→green.

**Files:**
- Create: `lib/dashboard/activity-feed.ts`
- Create: `lib/dashboard/__tests__/activity-feed.test.ts`

- [ ] **Step 1.1: Write failing test scaffold**

Create `lib/dashboard/__tests__/activity-feed.test.ts` with a single failing test that imports the not-yet-existing module:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({
  prisma: {
    auditLog: { findMany: vi.fn() },
    user: { findMany: vi.fn() },
    employee: { findMany: vi.fn() },
    leaveRequest: { findMany: vi.fn() },
    payrollRun: { findMany: vi.fn() },
    invoice: { findMany: vi.fn() },
    admission: { findMany: vi.fn() },
    studentEnrollment: { findMany: vi.fn() },
  },
}));

vi.mock("next/cache", () => ({
  unstable_cache: <T extends (...args: unknown[]) => unknown>(fn: T) => fn,
  revalidateTag: vi.fn(),
}));

import { getRecentActivity } from "@/lib/dashboard/activity-feed";
import { prisma } from "@/lib/db";

const mockAudit = prisma.auditLog.findMany as unknown as ReturnType<typeof vi.fn>;
const mockUser = prisma.user.findMany as unknown as ReturnType<typeof vi.fn>;

describe("getRecentActivity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAudit.mockResolvedValue([]);
    mockUser.mockResolvedValue([]);
  });

  it("returns empty array when no audit rows exist", async () => {
    const events = await getRecentActivity("tenant-1");
    expect(events).toEqual([]);
    expect(mockAudit).toHaveBeenCalledOnce();
    expect(mockAudit).toHaveBeenCalledWith({
      where: { tenantId: "tenant-1" },
      orderBy: { createdAt: "desc" },
      take: 8,
    });
  });
});
```

- [ ] **Step 1.2: Run test, confirm failure**

Run: `npx vitest run lib/dashboard/__tests__/activity-feed.test.ts`
Expected: FAIL with "Cannot find module '@/lib/dashboard/activity-feed'".

- [ ] **Step 1.3: Write minimal implementation that passes the empty-array test**

Create `lib/dashboard/activity-feed.ts`:

```ts
import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/db";

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
  "LeaveRequest.create": (t) => ({ verb: `mengajukan cuti untuk ${t}`, href: "/admin/leave" }),
  "LeaveRequest.approve": (t) => ({ verb: `menyetujui cuti ${t}`, href: "/admin/leave" }),
  "LeaveRequest.reject": (t) => ({ verb: `menolak cuti ${t}`, href: "/admin/leave" }),
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
  Invoice: "number",
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
  limit: number
): Promise<ActivityEvent[]> {
  const rows = await prisma.auditLog.findMany({
    where: { tenantId },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  if (rows.length === 0) return [];

  // Group entityIds by whitelisted entity type (skip non-whitelisted early).
  const grouped = new Map<WhitelistedEntity, Set<string>>();
  for (const row of rows) {
    const key = `${row.entity}.${row.action}` as VerbKey;
    if (!(key in VERB_MAP)) continue;
    const ent = row.entity as WhitelistedEntity;
    if (!grouped.has(ent)) grouped.set(ent, new Set());
    grouped.get(ent)!.add(row.entityId);
  }

  // Parallel batch lookups: one query per whitelisted entity type + one for actors.
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
    if (!targetName) continue; // hard-deleted entity → skip
    const user = userMap.get(row.actorId);
    const actorName = user?.name?.trim() || user?.email?.split("@")[0] || "Pengguna";
    const { verb, href } = builder(targetName);
    events.push({
      id: row.id,
      actorName,
      actorInitials: initialsFor(actorName),
      verb,
      target: targetName,
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
```

- [ ] **Step 1.4: Run test, confirm pass**

Run: `npx vitest run lib/dashboard/__tests__/activity-feed.test.ts`
Expected: PASS, 1 test.

- [ ] **Step 1.5: Add the rest of the test cases**

Append to `lib/dashboard/__tests__/activity-feed.test.ts`:

```ts
  it("returns events with humanised verb for whitelisted entries", async () => {
    mockAudit.mockResolvedValue([
      {
        id: "a1",
        tenantId: "tenant-1",
        actorId: "u1",
        entity: "LeaveRequest",
        entityId: "lr1",
        action: "approve",
        before: null,
        after: null,
        createdAt: new Date("2026-05-03T10:00:00Z"),
      },
    ]);
    mockUser.mockResolvedValue([{ id: "u1", name: "Bu Sari", email: "sari@school.id" }]);
    (prisma.leaveRequest.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: "lr1" },
    ]);

    const events = await getRecentActivity("tenant-1");
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      actorName: "Bu Sari",
      actorInitials: "BS",
      verb: "menyetujui cuti lr1",
      href: "/admin/leave",
    });
  });

  it("skips audit rows whose entity.action is not whitelisted", async () => {
    mockAudit.mockResolvedValue([
      {
        id: "a1",
        tenantId: "tenant-1",
        actorId: "u1",
        entity: "OrgConfig",
        entityId: "oc1",
        action: "update",
        before: null,
        after: null,
        createdAt: new Date(),
      },
    ]);
    mockUser.mockResolvedValue([{ id: "u1", name: "Admin", email: "a@s.id" }]);

    const events = await getRecentActivity("tenant-1");
    expect(events).toEqual([]);
  });

  it("skips rows whose target entity is hard-deleted (no name returned)", async () => {
    mockAudit.mockResolvedValue([
      {
        id: "a1",
        tenantId: "tenant-1",
        actorId: "u1",
        entity: "Employee",
        entityId: "missing-emp",
        action: "create",
        before: null,
        after: null,
        createdAt: new Date(),
      },
    ]);
    mockUser.mockResolvedValue([{ id: "u1", name: "Admin", email: "a@s.id" }]);
    (prisma.employee.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]); // no row

    const events = await getRecentActivity("tenant-1");
    expect(events).toEqual([]);
  });

  it("falls back to email-prefix when actor.name is null", async () => {
    mockAudit.mockResolvedValue([
      {
        id: "a1",
        tenantId: "tenant-1",
        actorId: "u1",
        entity: "Invoice",
        entityId: "inv1",
        action: "create",
        before: null,
        after: null,
        createdAt: new Date(),
      },
    ]);
    mockUser.mockResolvedValue([{ id: "u1", name: null, email: "kepala@school.id" }]);
    (prisma.invoice.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: "inv1", number: "INV-001" },
    ]);

    const events = await getRecentActivity("tenant-1");
    expect(events).toHaveLength(1);
    expect(events[0].actorName).toBe("kepala");
    expect(events[0].actorInitials).toBe("K");
    expect(events[0].verb).toBe("membuat tagihan INV-001");
  });

  it("honours the limit argument", async () => {
    mockAudit.mockResolvedValue([]);
    await getRecentActivity("tenant-1", 3);
    expect(mockAudit).toHaveBeenCalledWith({
      where: { tenantId: "tenant-1" },
      orderBy: { createdAt: "desc" },
      take: 3,
    });
  });

  it("returns empty array when actor lookup misses (deleted user → fallback name 'Pengguna')", async () => {
    mockAudit.mockResolvedValue([
      {
        id: "a1",
        tenantId: "tenant-1",
        actorId: "ghost",
        entity: "Admission",
        entityId: "ad1",
        action: "create",
        before: null,
        after: null,
        createdAt: new Date(),
      },
    ]);
    mockUser.mockResolvedValue([]);
    (prisma.admission.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: "ad1", childName: "Aisyah" },
    ]);

    const events = await getRecentActivity("tenant-1");
    expect(events).toHaveLength(1);
    expect(events[0].actorName).toBe("Pengguna");
    expect(events[0].actorInitials).toBe("P");
    expect(events[0].verb).toBe("pendaftaran baru: Aisyah");
  });
});
```

Note the first test in the suite passes a `limit` of 8 by default; add a default-arg signature (`limit = 8`) to the wrapped function. Update `getRecentActivity` to declare the default by editing the inner function signature:

```ts
async function fetchRecentActivityImpl(
  tenantId: string,
  limit: number = 8
): Promise<ActivityEvent[]> {
```

- [ ] **Step 1.6: Run all tests, confirm pass**

Run: `npx vitest run lib/dashboard/__tests__/activity-feed.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 1.7: Run between-task gate**

Run: `npm run build && npx vitest run`
Expected: build succeeds (no TypeScript errors), all vitest tests pass.

- [ ] **Step 1.8: Commit**

```bash
git add lib/dashboard/activity-feed.ts lib/dashboard/__tests__/activity-feed.test.ts
git commit -m "feat(dashboard): add getRecentActivity helper with verb mapping

Implements lib/dashboard/activity-feed.ts: queries AuditLog.findMany,
batches entity-name lookups per whitelisted entity, maps each row through
VERB_MAP to produce ActivityEvent { actor, verb, target, href, timestamp }.
Skips non-whitelisted entity.action pairs and hard-deleted entity refs.
Wrapped in unstable_cache (60s, tag activity-feed) for Task 4 invalidation.
Tests cover empty input, verb mapping, whitelist skip, hard-deleted skip,
deleted-actor fallback, limit honouring."
```

---

## Task 2: Add `components/admin/dashboard/*` component splits

This task is independent of Task 1 and can run in parallel under subagent-driven development. No unit tests for these components — visual coverage comes from Task 5 (Playwright).

**Files:**
- Create: `components/admin/dashboard/stat-grid.tsx`
- Create: `components/admin/dashboard/attendance-trend-chart.tsx`
- Create: `components/admin/dashboard/pending-actions.tsx`
- Create: `components/admin/dashboard/activity-feed.tsx`
- Create: `components/admin/dashboard/quick-actions.tsx`
- Create: `components/admin/dashboard/index.ts`

- [ ] **Step 2.1: Create `stat-grid.tsx`**

```tsx
import { StatCard } from "@/components/admin/stat-card";
import { Users, UserCheck, Clock, UserX } from "lucide-react";

export function StatGrid({
  totalEmployees,
  present,
  late,
  absent,
}: {
  totalEmployees: number;
  present: number;
  late: number;
  absent: number;
}) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      <StatCard label="Total Karyawan" value={totalEmployees} sublabel="aktif" icon={Users} color="primary" index={0} />
      <StatCard label="Hadir Hari Ini" value={present} sublabel={`dari ${totalEmployees}`} icon={UserCheck} color="success" index={1} />
      <StatCard label="Terlambat" value={late} icon={Clock} color="warning" index={2} />
      <StatCard label="Tidak Hadir" value={absent} icon={UserX} color="error" index={3} />
    </div>
  );
}
```

- [ ] **Step 2.2: Create `attendance-trend-chart.tsx`**

```tsx
"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { Card } from "@/components/ui/card";
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { formatDate } from "@/lib/format";

export type WeeklyTrend = {
  date: string; // YYYY-MM-DD
  present: number;
  late: number;
  absent: number;
};

const chartConfig = {
  present: { label: "Hadir", color: "var(--chart-1)" },
  late: { label: "Terlambat", color: "var(--chart-2)" },
  absent: { label: "Tidak Hadir", color: "var(--chart-3)" },
} satisfies ChartConfig;

export function AttendanceTrendChart({
  data,
  className,
}: {
  data: WeeklyTrend[];
  className?: string;
}) {
  const isEmpty =
    data.length === 0 || data.every((d) => d.present + d.late + d.absent === 0);

  const chartData = data.map((d) => ({
    label: formatDate(d.date, { weekday: "short" }),
    present: d.present,
    late: d.late,
    absent: d.absent,
  }));

  return (
    <Card className={`p-card ${className ?? ""}`}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold">Tren Kehadiran (7 Hari Terakhir)</h3>
        <Link
          href="/admin/attendance"
          className="text-xs text-primary hover:underline flex items-center gap-1"
        >
          Lihat detail <ArrowRight size={12} />
        </Link>
      </div>
      {isEmpty ? (
        <div className="h-32 flex items-center justify-center text-xs text-muted-foreground">
          Data kehadiran belum tersedia
        </div>
      ) : (
        <ChartContainer config={chartConfig} className="h-32 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData}>
              <CartesianGrid vertical={false} strokeDasharray="3 3" />
              <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={11} />
              <YAxis hide />
              <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
              <Bar dataKey="present" stackId="a" fill="var(--color-present)" radius={[0, 0, 4, 4]} />
              <Bar dataKey="late" stackId="a" fill="var(--color-late)" />
              <Bar dataKey="absent" stackId="a" fill="var(--color-absent)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartContainer>
      )}
    </Card>
  );
}
```

- [ ] **Step 2.3: Create `pending-actions.tsx`**

```tsx
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/ui/status-badge";
import { CalendarOff, Banknote, UserPlus } from "lucide-react";

export function PendingActions({
  pendingLeave,
  pendingAdmissions,
  lastPayroll,
  canSeePayroll,
  canSeeAdmissions,
}: {
  pendingLeave: number;
  pendingAdmissions: number;
  lastPayroll: { period: string; status: string; employeeCount: number } | null;
  canSeePayroll: boolean;
  canSeeAdmissions: boolean;
}) {
  return (
    <Card className="p-card h-full flex flex-col">
      <h3 className="text-sm font-semibold mb-4">Perlu Tindakan</h3>
      <div className="flex-1 space-y-3">
        <Link
          href="/admin/leave"
          className="flex items-center justify-between p-3 rounded-lg hover:bg-accent transition-colors"
        >
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-warning/10 flex items-center justify-center">
              <CalendarOff size={16} className="text-warning" />
            </div>
            <div>
              <p className="text-xs font-medium">Pengajuan Cuti</p>
              <p className="text-xs text-muted-foreground">Menunggu persetujuan</p>
            </div>
          </div>
          {pendingLeave > 0 ? (
            <Badge className="bg-warning text-white text-xs">{pendingLeave}</Badge>
          ) : (
            <span className="text-xs text-muted-foreground">0</span>
          )}
        </Link>

        {canSeeAdmissions && (
          <Link
            href="/admin/admissions"
            className="flex items-center justify-between p-3 rounded-lg hover:bg-accent transition-colors"
          >
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                <UserPlus size={16} className="text-primary" />
              </div>
              <div>
                <p className="text-xs font-medium">Pendaftaran Baru</p>
                <p className="text-xs text-muted-foreground">Inquiry menunggu tindak lanjut</p>
              </div>
            </div>
            {pendingAdmissions > 0 ? (
              <Badge className="bg-primary text-white text-xs">{pendingAdmissions}</Badge>
            ) : (
              <span className="text-xs text-muted-foreground">0</span>
            )}
          </Link>
        )}

        {canSeePayroll && (
          <Link
            href="/admin/payroll"
            className="flex items-center justify-between p-3 rounded-lg hover:bg-accent transition-colors"
          >
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center">
                <Banknote size={16} className="text-primary" />
              </div>
              <div>
                <p className="text-xs font-medium">Penggajian Terakhir</p>
                <p className="text-xs text-muted-foreground">
                  {lastPayroll ? lastPayroll.period : "Belum ada"}
                </p>
              </div>
            </div>
            {lastPayroll && <StatusBadge status={lastPayroll.status} />}
          </Link>
        )}
      </div>
    </Card>
  );
}
```

- [ ] **Step 2.4: Create `activity-feed.tsx`**

```tsx
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { EmptyState } from "@/components/ui/empty-state";
import { formatRelativeTime } from "@/lib/format";
import Link from "next/link";
import { Activity } from "lucide-react";
import type { ActivityEvent } from "@/lib/dashboard/activity-feed";

export function ActivityFeed({ events }: { events: ActivityEvent[] }) {
  return (
    <Card className="p-card h-full flex flex-col">
      <h3 className="text-sm font-semibold mb-4">Aktivitas Terbaru</h3>
      {events.length === 0 ? (
        <EmptyState
          icon={Activity}
          title="Belum ada aktivitas terbaru"
          description="Aktivitas tim akan muncul di sini saat tindakan dilakukan."
        />
      ) : (
        <ul className="flex-1 space-y-3">
          {events.map((event) => (
            <li key={event.id}>
              <Link
                href={event.href}
                className="flex items-start gap-3 p-2 -mx-2 rounded-lg hover:bg-accent transition-colors"
              >
                <Avatar size="sm">
                  <AvatarFallback>{event.actorInitials}</AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="text-xs leading-snug">
                    <span className="font-medium">{event.actorName}</span>{" "}
                    <span className="text-muted-foreground">{event.verb}</span>
                  </p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    {formatRelativeTime(event.timestamp)}
                  </p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
```

- [ ] **Step 2.5: Create `quick-actions.tsx`**

```tsx
import Link from "next/link";

export function QuickActions({ canSeePayroll }: { canSeePayroll: boolean }) {
  const actions = [
    ...(canSeePayroll
      ? [{ label: "Jalankan Penggajian", href: "/admin/payroll?create=1", emoji: "💰" }]
      : []),
    { label: "Lihat Kehadiran", href: "/admin/attendance", emoji: "📋" },
    { label: "Pengajuan Cuti", href: "/admin/leave", emoji: "📝" },
    { label: "Tambah Karyawan", href: "/admin/employees?create=1", emoji: "👤" },
  ];

  return (
    <div>
      <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
        Aksi Cepat
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
        {actions.map((action) => (
          <Link
            key={action.href}
            href={action.href}
            className="flex items-center gap-3 p-3.5 bg-card border border-border rounded-xl hover:border-primary/30 hover:shadow-sm transition-all group"
          >
            <span className="text-lg">{action.emoji}</span>
            <span className="text-xs font-medium group-hover:text-primary transition-colors">
              {action.label}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2.6: Create `index.ts` barrel**

```ts
export { StatGrid } from "./stat-grid";
export { AttendanceTrendChart, type WeeklyTrend } from "./attendance-trend-chart";
export { PendingActions } from "./pending-actions";
export { ActivityFeed } from "./activity-feed";
export { QuickActions } from "./quick-actions";
```

- [ ] **Step 2.7: Run between-task gate**

Run: `npm run build && npx vitest run`
Expected: build succeeds; tests pass. The new components have no callers yet, so the build only verifies they compile (no unused-export warnings unless lint flags them).

- [ ] **Step 2.8: Commit**

```bash
git add components/admin/dashboard/
git commit -m "feat(dashboard): split dashboard sections into focused components

Adds components/admin/dashboard/{stat-grid,attendance-trend-chart,
pending-actions,activity-feed,quick-actions,index}.tsx. Chart now uses
shadcn ChartContainer (recharts) with --chart-1/2/3 tokens; previous
hand-rolled CSS bars are gone. Activity feed renders avatar + actor +
verb + relative time, with EmptyState for the zero-events case. Pending
actions adds an admissions row gated by canSeeAdmissions. Stat-grid /
pending-actions / activity-feed / quick-actions are server components
(no animation); only the chart is client-side (recharts requirement)."
```

---

## Task 3: Rewrite `app/admin/page.tsx` and delete `dashboard-client.tsx`

Depends on Task 1 (`getRecentActivity`) and Task 2 (component imports).

**Files:**
- Modify: `app/admin/page.tsx`
- Delete: `app/admin/dashboard-client.tsx`

- [ ] **Step 3.1: Rewrite `app/admin/page.tsx`**

Replace the entire contents of `app/admin/page.tsx` with:

```tsx
import { unstable_cache } from "next/cache";
import { getSession, isAdminRole } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/admin/page-header";
import { formatDate } from "@/lib/format";
import {
  StatGrid,
  AttendanceTrendChart,
  PendingActions,
  ActivityFeed,
  QuickActions,
  type WeeklyTrend,
} from "@/components/admin/dashboard";
import { getRecentActivity, type ActivityEvent } from "@/lib/dashboard/activity-feed";

const getEmployeeCount = unstable_cache(
  async (tenantId: string) =>
    prisma.employee.count({ where: { tenantId, status: "ACTIVE" } }),
  ["employees-count"],
  { revalidate: 1800, tags: ["employees-count"] }
);

function settled<T>(result: PromiseSettledResult<T>, fallback: T, key: string): T {
  if (result.status === "fulfilled") return result.value;
  console.error("[dashboard] query failed", { key, err: result.reason });
  return fallback;
}

export default async function AdminDashboard() {
  const session = await getSession();
  if (!session || !isAdminRole(session.role)) redirect("/");
  if (!session.tenantId) redirect("/");

  const tenantId = session.tenantId;
  const today = new Date();
  const todayStr = today.toISOString().split("T")[0];

  const last7Weekdays: string[] = [];
  const d = new Date(today);
  while (last7Weekdays.length < 7) {
    d.setDate(d.getDate() - 1);
    if (d.getDay() === 0 || d.getDay() === 6) continue;
    last7Weekdays.unshift(d.toISOString().split("T")[0]);
  }

  const canSeePayroll = hasPermission(session, "payroll.view");
  const canSeeAdmissions = hasPermission(session, "admissions.view");
  const canSeeActivity = hasPermission(session, "hr.view");

  const results = await Promise.allSettled([
    getEmployeeCount(tenantId),
    prisma.attendanceRecord.groupBy({
      by: ["status"],
      where: { employee: { tenantId }, date: todayStr },
      _count: true,
    }),
    prisma.leaveRequest.count({
      where: { employee: { tenantId }, status: "PENDING" },
    }),
    canSeePayroll
      ? prisma.payrollRun.findFirst({
          where: { tenantId },
          orderBy: { periodStart: "desc" },
          include: { _count: { select: { items: true } } },
        })
      : Promise.resolve(null),
    prisma.attendanceRecord.groupBy({
      by: ["date", "status"],
      where: { employee: { tenantId }, date: { in: last7Weekdays } },
      _count: true,
    }),
    canSeeAdmissions
      ? prisma.admission.count({ where: { tenantId, status: "INQUIRY" } })
      : Promise.resolve(0),
    canSeeActivity
      ? getRecentActivity(tenantId, 8)
      : Promise.resolve([] as ActivityEvent[]),
  ]);

  const totalEmployees = settled(results[0], 0, "employees-count");
  const todayAttendance = settled(results[1], [] as Array<{ status: string; _count: number }>, "today-attendance");
  const pendingLeave = settled(results[2], 0, "pending-leave");
  const lastPayrollRow = settled(
    results[3],
    null as Awaited<ReturnType<typeof prisma.payrollRun.findFirst>> | null,
    "last-payroll"
  );
  const weeklyTrendRaw = settled(
    results[4],
    [] as Array<{ date: string; status: string; _count: number }>,
    "weekly-trend"
  );
  const pendingAdmissions = settled(results[5], 0, "pending-admissions");
  const recentActivity = settled(results[6], [] as ActivityEvent[], "recent-activity");

  const weeklyTrendMap = new Map<string, Record<string, number>>();
  for (const row of weeklyTrendRaw) {
    if (!weeklyTrendMap.has(row.date)) weeklyTrendMap.set(row.date, {});
    weeklyTrendMap.get(row.date)![row.status] = row._count;
  }
  const weeklyTrend: WeeklyTrend[] = last7Weekdays.map((date) => {
    const counts = weeklyTrendMap.get(date) || {};
    return {
      date,
      present: (counts["PRESENT"] ?? 0) + (counts["PRESENT_NO_CHECKOUT"] ?? 0),
      late: counts["LATE"] ?? 0,
      absent: counts["ABSENT"] ?? 0,
    };
  });

  const statusCounts: Record<string, number> = {};
  for (const row of todayAttendance) statusCounts[row.status] = row._count;
  const present =
    (statusCounts["PRESENT"] ?? 0) +
    (statusCounts["LATE"] ?? 0) +
    (statusCounts["PRESENT_NO_CHECKOUT"] ?? 0);
  const late = statusCounts["LATE"] ?? 0;
  const absent = Math.max(
    0,
    totalEmployees - present - (statusCounts["LEAVE"] ?? 0) - (statusCounts["HOLIDAY"] ?? 0)
  );

  const lastPayroll = lastPayrollRow
    ? {
        period: `${lastPayrollRow.periodStart} — ${lastPayrollRow.periodEnd}`,
        status: lastPayrollRow.status,
        employeeCount: lastPayrollRow._count.items,
      }
    : null;

  return (
    <>
      <PageHeader
        title="Dasbor"
        description={formatDate(todayStr, {
          weekday: "long",
          year: "numeric",
          month: "long",
          day: "numeric",
        })}
      />
      <div className="space-y-section">
        <StatGrid
          totalEmployees={totalEmployees}
          present={present}
          late={late}
          absent={absent}
        />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <AttendanceTrendChart data={weeklyTrend} className="lg:col-span-2" />
          <div className="space-y-4">
            <PendingActions
              pendingLeave={pendingLeave}
              pendingAdmissions={pendingAdmissions}
              lastPayroll={lastPayroll}
              canSeePayroll={canSeePayroll}
              canSeeAdmissions={canSeeAdmissions}
            />
            <ActivityFeed events={recentActivity} />
          </div>
        </div>
        <QuickActions canSeePayroll={canSeePayroll} />
      </div>
    </>
  );
}
```

- [ ] **Step 3.2: Delete the old client**

Run: `git rm app/admin/dashboard-client.tsx`
Expected: file removed, git status shows deletion staged.

- [ ] **Step 3.3: Run between-task gate**

Run: `npm run build && npx vitest run`
Expected: build succeeds (no unresolved import of `DashboardClient` anywhere), all tests pass.

If `npm run build` reports any other file still importing the deleted client (unlikely; this file was only used by `app/admin/page.tsx`), fix the import in that file before retrying.

- [ ] **Step 3.4: Commit**

```bash
git add app/admin/page.tsx
git commit -m "feat(dashboard): rebuild admin dashboard composition with shadcn primitives

app/admin/page.tsx now composes the new components/admin/dashboard split:
StatGrid + AttendanceTrendChart (2/3) + PendingActions+ActivityFeed
right rail (1/3) + QuickActions (full-width). Adds two perm-gated
queries: pending Admission count (status=INQUIRY) and getRecentActivity
from AuditLog. Switches Promise.all → Promise.allSettled so any single
failed query degrades only its own section. Deletes the now-orphan
dashboard-client.tsx."
```

---

## Task 4: Wire `revalidateTag(\"activity-feed\")` into `lib/audit.ts`

**Files:**
- Modify: `lib/audit.ts`

- [ ] **Step 4.1: Edit `recordAudit` to invalidate the activity-feed cache on success**

Replace the function body of `recordAudit` in `lib/audit.ts` with:

```ts
import { revalidateTag } from "next/cache";
import { prisma } from "@/lib/db";
import type { Prisma } from "@/lib/generated/prisma/client";

export type AuditAction = "create" | "update" | "delete" | string;

export interface AuditEntry {
  tenantId: string;
  actorId: string;
  entity: string;
  entityId: string;
  action: AuditAction;
  before?: Prisma.InputJsonValue;
  after?: Prisma.InputJsonValue;
}

export async function recordAudit(
  entry: AuditEntry,
  tx?: Prisma.TransactionClient
): Promise<void> {
  const client = tx ?? prisma;
  try {
    await client.auditLog.create({
      data: {
        tenantId: entry.tenantId,
        actorId: entry.actorId,
        entity: entry.entity,
        entityId: entry.entityId,
        action: entry.action,
        before: entry.before,
        after: entry.after,
      },
    });
    revalidateTag("activity-feed");
  } catch (err) {
    if (tx) throw err;
    console.error("[audit] failed to record entry", { entry, err });
  }
}
```

Keep the existing JSDoc comment block at the top of the function — only the imports + body change. (Re-paste the JSDoc above `export async function recordAudit` from the original file if the rewrite drops it.)

- [ ] **Step 4.2: Update the existing audit test to mock `revalidateTag`**

The existing test file at `lib/__tests__/audit.test.ts` already mocks `@/lib/db`. Add a `next/cache` mock at the top:

```ts
vi.mock("next/cache", () => ({
  revalidateTag: vi.fn(),
}));
```

Add an import `import { revalidateTag } from "next/cache";` near the existing imports, then add this test inside the `describe("recordAudit", ...)` block:

```ts
  it("invalidates the activity-feed cache tag after a successful create", async () => {
    (prisma.auditLog.create as ReturnType<typeof vi.fn>).mockResolvedValue({});
    await recordAudit({
      tenantId: "t1",
      actorId: "u1",
      entity: "Invoice",
      entityId: "inv1",
      action: "create",
    });
    expect(revalidateTag).toHaveBeenCalledWith("activity-feed");
  });

  it("does not invalidate the cache tag when the create fails (standalone)", async () => {
    (prisma.auditLog.create as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error("db down")
    );
    await recordAudit({
      tenantId: "t1",
      actorId: "u1",
      entity: "Invoice",
      entityId: "inv1",
      action: "create",
    });
    expect(revalidateTag).not.toHaveBeenCalled();
  });
```

- [ ] **Step 4.3: Run audit tests and the full vitest suite**

Run: `npx vitest run lib/__tests__/audit.test.ts && npx vitest run`
Expected: audit suite green (existing tests + 2 new ones); full suite green.

- [ ] **Step 4.4: Run between-task gate**

Run: `npm run build && npx vitest run`
Expected: build + all tests pass.

- [ ] **Step 4.5: Commit**

```bash
git add lib/audit.ts lib/__tests__/audit.test.ts
git commit -m "feat(audit): invalidate activity-feed cache tag on recordAudit success

After every successful auditLog.create, call revalidateTag(\"activity-feed\")
so the dashboard's getRecentActivity unstable_cache returns fresh data on
next read. Failed inserts (standalone path) do not invalidate. Adds two
test cases covering both paths."
```

---

## Task 5: Add Playwright e2e coverage

**Files:**
- Create: `e2e/admin-dashboard.spec.ts`

- [ ] **Step 5.1: Inspect existing admin spec to follow auth/login pattern**

Run: `cat e2e/admin.spec.ts | head -40`
Expected: shows the demo-mode login pattern (cookie-based) used in current admin specs. Reuse the same pattern in the new spec — do not invent a new auth path.

- [ ] **Step 5.2: Create `e2e/admin-dashboard.spec.ts`**

```ts
import { test, expect } from "@playwright/test";

test.describe("admin dashboard rebuild", () => {
  test.beforeEach(async ({ context }) => {
    // Demo-mode cookie auth (matches pattern in e2e/admin.spec.ts).
    // If the existing spec uses a helper, prefer importing it instead.
    await context.addCookies([
      {
        name: "demo_role",
        value: "SUPER_ADMIN",
        domain: "localhost",
        path: "/",
      },
    ]);
  });

  test("renders all five dashboard sections for SUPER_ADMIN", async ({ page }) => {
    await page.goto("/admin");

    // Stat grid
    await expect(page.getByText("Total Karyawan")).toBeVisible();
    await expect(page.getByText("Hadir Hari Ini")).toBeVisible();
    await expect(page.getByText("Terlambat")).toBeVisible();
    await expect(page.getByText("Tidak Hadir")).toBeVisible();

    // Chart container — shadcn ChartContainer renders a div with data-slot="chart".
    // If the chart's data is all zeros for the seed tenant, the empty-state copy
    // appears instead — accept either.
    const chartOrEmpty = page.locator('[data-slot="chart"], :text("Data kehadiran belum tersedia")').first();
    await expect(chartOrEmpty).toBeVisible();

    // Pending actions card
    await expect(page.getByText("Perlu Tindakan")).toBeVisible();
    await expect(page.getByText("Pengajuan Cuti")).toBeVisible();
    await expect(page.getByText("Pendaftaran Baru")).toBeVisible(); // admissions row (full perm)

    // Activity feed card
    await expect(page.getByText("Aktivitas Terbaru")).toBeVisible();
    // Either rows render, or the empty state copy is visible.
    const feedOrEmpty = page.locator(':text("Belum ada aktivitas terbaru"), [data-slot="avatar"]').first();
    await expect(feedOrEmpty).toBeVisible();

    // Quick actions
    await expect(page.getByText("Aksi Cepat")).toBeVisible();
    await expect(page.getByRole("link", { name: /Lihat Kehadiran/ })).toBeVisible();
    await expect(page.getByRole("link", { name: /Pengajuan Cuti/ })).toBeVisible();
    await expect(page.getByRole("link", { name: /Tambah Karyawan/ })).toBeVisible();
  });

  test("hides payroll row + payroll quick action for SCHOOL_ADMIN", async ({ context, page }) => {
    await context.clearCookies();
    await context.addCookies([
      {
        name: "demo_role",
        value: "SCHOOL_ADMIN",
        domain: "localhost",
        path: "/",
      },
    ]);
    await page.goto("/admin");

    await expect(page.getByText("Perlu Tindakan")).toBeVisible();
    await expect(page.getByText("Penggajian Terakhir")).toHaveCount(0);
    await expect(page.getByRole("link", { name: /Jalankan Penggajian/ })).toHaveCount(0);
    // Other quick actions still present
    await expect(page.getByRole("link", { name: /Lihat Kehadiran/ })).toBeVisible();
  });
});
```

If `e2e/admin.spec.ts` exposes a helper like `loginAs(role)` or sets the cookie via a different name (`demo_user`, `session`, etc.), replace the `addCookies` block with that helper. Verify the cookie name by reading `e2e/admin.spec.ts` and matching it.

- [ ] **Step 5.3: Build production assets and start the demo server**

Playwright config in this repo runs against the production build (`DEMO_MODE=true npm run start`). Confirm by reading `playwright.config.ts` if unsure.

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 5.4: Run the new spec only first to iterate quickly**

Run: `npx playwright test e2e/admin-dashboard.spec.ts --reporter=line`
Expected: both tests pass. If a selector misses, fix the selector (not the component) — keep test surface tight to user-visible text.

- [ ] **Step 5.5: Run the full Playwright suite (end-of-cycle gate)**

Run: `npx playwright test`
Expected: all 6 specs pass (existing 5 + new 1). If a previously-passing spec now fails, the regression is in your changes — investigate before continuing.

- [ ] **Step 5.6: Run between-task gate (sanity)**

Run: `npm run build && npx vitest run`
Expected: green.

- [ ] **Step 5.7: Commit**

```bash
git add e2e/admin-dashboard.spec.ts
git commit -m "test(e2e): cover rebuilt admin dashboard composition + perm gating

Asserts the five dashboard sections render for SUPER_ADMIN (stat grid,
chart container or empty state, pending actions w/ admissions row,
activity feed list or empty state, quick actions). Second test confirms
SCHOOL_ADMIN sees no payroll row or payroll quick action."
```

---

## Self-Review

**Spec coverage check:**
- Goal 1 (replace bespoke chart with ChartContainer): Task 2.2 (`attendance-trend-chart.tsx`).
- Goal 2 (adopt shadcn primitives): Tasks 2.2, 2.3, 2.4 use `Card`, `Badge`, `StatusBadge`, `Avatar`, `EmptyState`, `ChartContainer`.
- Goal 3 (split dashboard-client): Task 2 creates the split, Task 3 deletes the old client.
- Goal 4 (Pending Admissions row): Task 2.3 (`pending-actions.tsx` admissions branch) + Task 3 (perm gate + count query).
- Goal 5 (Activity Feed): Tasks 1, 2.4, 3.
- Goal 6 (`Promise.allSettled`): Task 3 step 3.1.
- Goal 7 (cross-check design-system): handled by the `/build` cycle doc Verification entry per spec; not a code task.
- Acceptance: SCHOOL_ADMIN gating covered by Task 5.2 second test; failed-query degradation is structurally guaranteed by `Promise.allSettled` + `settled()` helper in Task 3 — no per-section unit test added (the helper itself is trivial; e2e proves render-with-zeros works).

**Placeholder scan:** No "TBD"/"TODO"/"appropriate"/"similar to". One conditional in Task 5.2 ("If `e2e/admin.spec.ts` exposes a helper...") — that is verification + adaptation, not a placeholder.

**Type consistency:** `ActivityEvent` shape defined once in Task 1.3 (`{ id, actorName, actorInitials, verb, target, href, timestamp }`) and consumed identically in Tasks 2.4 (`activity-feed.tsx`) and 3.1 (page imports the type). `WeeklyTrend` defined in Task 2.2 (`attendance-trend-chart.tsx`), exported via Task 2.6 barrel, imported in Task 3.1.

---

## Plan Complete

Plan saved to `docs/superpowers/plans/2026-05-03-dashboard-shadcn-rebuild.md`. Two execution options:

1. **Subagent-Driven (recommended)** — dispatch a fresh subagent per task, review between tasks, fast iteration.
2. **Inline Execution** — execute tasks in this session using `executing-plans`, batch execution with checkpoints.

Which?
