// NIS allocator per foundation spec §6.6.
//
// Allocates the next NIS (Nomor Induk Siswa) for a student in a given
// (tenant, academic year, program) triple. Uses a Postgres advisory
// transaction lock keyed on (tenantId, academicYearId) to serialize
// concurrent acquires within the same year — different programs share
// the same lock key (rare contention at PAUD scale; collision risk
// negligible per cycle assumption 6).
//
// Sequence-bump lives on `StudentIdentifierSequence` keyed by the
// `(tenantId, academicYearId, programId)` composite-unique. The lock
// is purely app-layer; migration 07 does NOT define a SQL helper
// function (cycle assumption 12).
//
// NIS format: `<programCode>-<YY>-<NNNN>` where YY is the last two
// digits of the academic year (parsed from `AcademicYear.name` like
// "2025/2026" → "25", or fallback to `startDate` UTC year). NNNN is
// the zero-padded sequence value (4 digits, max 9999).
//
// Spec §4.5 promises NIS history retention via soft-delete on
// StudentIdentifier rows; this allocator only mints fresh sequence
// values — it does NOT inspect existing identifier rows.

import type { Prisma } from "@/lib/generated/prisma/client";

export type AllocateNisArgs = {
  tenantId: string;
  academicYearId: string;
  programId: string;
  /**
   * Either a real PrismaClient or a transaction-scoped Prisma type.
   * The allocator calls `$transaction` internally — pass the root
   * client, not a `tx` already inside another transaction (the
   * advisory lock is `xact_lock`, scoped to the innermost transaction
   * — nested calls work in Postgres but break the test assumption
   * that each call creates its own scope).
   */
  prisma: AllocatorPrismaLike;
};

export type AllocateNisResult = {
  nis: string;
  sequenceValue: number;
};

// Minimal Prisma surface needed by the allocator. Tests pass a mock;
// production passes the real PrismaClient (which structurally
// satisfies this shape). The `unknown` typing on the model methods
// matches Prisma's generated overloads while keeping the test mock
// simple — production callers benefit from full Prisma types via
// the structural compatibility check at the call site.
export type TxPrismaLike = {
  $queryRaw<T = unknown>(query: TemplateStringsArray, ...values: unknown[]): Promise<T>;
  studentIdentifierSequence: {
    findUnique(args: unknown): Promise<{ id: string; lastValue: number } | null>;
    create(args: unknown): Promise<{ id: string; lastValue: number }>;
    update(args: unknown): Promise<{ id: string; lastValue: number }>;
  };
  program: {
    findUnique(args: unknown): Promise<{ code: string | null } | null>;
  };
  academicYear: {
    findUnique(
      args: unknown,
    ): Promise<{ name: string | null; startDate: Date | null } | null>;
  };
};

export type AllocatorPrismaLike = {
  $transaction<T>(fn: (tx: TxPrismaLike) => Promise<T>): Promise<T>;
};

const MAX_SEQUENCE = 9999; // 4-digit padded suffix

export class NisAllocatorError extends Error {
  constructor(
    public readonly code:
      | "INVALID_INPUT"
      | "PROGRAM_NOT_FOUND"
      | "ACADEMIC_YEAR_NOT_FOUND"
      | "SEQUENCE_OVERFLOW",
    message: string,
  ) {
    super(message);
    this.name = "NisAllocatorError";
  }
}

export async function allocateNis(args: AllocateNisArgs): Promise<AllocateNisResult> {
  if (!args.tenantId || !args.academicYearId || !args.programId) {
    throw new NisAllocatorError(
      "INVALID_INPUT",
      "tenantId, academicYearId, and programId are all required",
    );
  }

  return args.prisma.$transaction(async (tx) => {
    // Step 1 — acquire advisory transaction lock keyed on (tenant, year).
    // Released automatically when the transaction commits or rolls back
    // (xact_lock semantics). Program is deliberately NOT in the key per
    // cycle assumption 6 (low contention, simpler deadlock surface).
    const lockKey = `${args.tenantId}:nis:${args.academicYearId}`;
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`;

    // Step 2 — read Program.code + AcademicYear (name/startDate) to build
    // the NIS prefix. Both lookups are tenant-scoped via the composite
    // unique `id_tenantId`.
    const program = await tx.program.findUnique({
      where: { id_tenantId: { id: args.programId, tenantId: args.tenantId } },
      select: { code: true },
    });
    if (!program?.code) {
      throw new NisAllocatorError(
        "PROGRAM_NOT_FOUND",
        `Program ${args.programId} not found or missing code`,
      );
    }
    const year = await tx.academicYear.findUnique({
      where: {
        id_tenantId: { id: args.academicYearId, tenantId: args.tenantId },
      },
      select: { name: true, startDate: true },
    });
    if (!year) {
      throw new NisAllocatorError(
        "ACADEMIC_YEAR_NOT_FOUND",
        `AcademicYear ${args.academicYearId} not found`,
      );
    }
    const yearSuffix = computeYearSuffix(year);

    // Step 3 — find or create the sequence row. Composite-unique
    // `(tenantId, academicYearId, programId)` is the lookup key.
    let seq = await tx.studentIdentifierSequence.findUnique({
      where: {
        tenantId_academicYearId_programId: {
          tenantId: args.tenantId,
          academicYearId: args.academicYearId,
          programId: args.programId,
        },
      },
      select: { id: true, lastValue: true },
    });
    if (!seq) {
      seq = await tx.studentIdentifierSequence.create({
        data: {
          tenantId: args.tenantId,
          academicYearId: args.academicYearId,
          programId: args.programId,
          lastValue: 0,
        },
        select: { id: true, lastValue: true },
      });
    }

    // Step 4 — bump the counter inside the lock window.
    const nextValue = seq.lastValue + 1;
    if (nextValue > MAX_SEQUENCE) {
      throw new NisAllocatorError(
        "SEQUENCE_OVERFLOW",
        `Sequence overflow for tenant=${args.tenantId} year=${args.academicYearId} program=${args.programId} (max ${MAX_SEQUENCE})`,
      );
    }
    const updated = await tx.studentIdentifierSequence.update({
      where: { id: seq.id },
      data: { lastValue: nextValue },
      select: { lastValue: true },
    });

    // Step 5 — format the NIS string.
    const nis = formatNis(program.code, yearSuffix, updated.lastValue);
    return { nis, sequenceValue: updated.lastValue };
  });
}

function computeYearSuffix(year: { name: string | null; startDate: Date | null }): string {
  // Prefer AcademicYear.name when it carries a 4-digit year (e.g.,
  // "2025/2026" → "25", "TA 2026" → "26"). PAUD convention uses the
  // earlier of the two years (the one schooling starts in).
  if (year.name) {
    const m = year.name.match(/(\d{4})/);
    if (m) return m[1].slice(-2);
  }
  // Fallback: startDate UTC year (avoids local-TZ off-by-one).
  if (year.startDate) {
    const y = year.startDate.getUTCFullYear();
    return String(y).slice(-2);
  }
  // Defensive: neither populated. Return "00" — tests assert this case
  // is unreachable in practice (AcademicYear always has startDate per
  // schema NOT NULL).
  return "00";
}

function formatNis(programCode: string, yearSuffix: string, sequenceValue: number): string {
  const padded = String(sequenceValue).padStart(4, "0");
  return `${programCode}-${yearSuffix}-${padded}`;
}

// Internal helpers exposed for unit tests only. Not part of the public
// API; downstream callers should use `allocateNis` exclusively.
export const _internal = { computeYearSuffix, formatNis, MAX_SEQUENCE };

// Re-export Prisma type alias for callers that need to thread the
// real client through. The `Prisma` namespace import keeps this file
// importing from generated artifacts in the same way as
// lib/scaffold/permission.ts (consistency).
export type { Prisma };
