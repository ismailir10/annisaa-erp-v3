import { NextRequest, NextResponse } from "next/server";
import { getSession, isAdminRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { noteBodySchema } from "@/lib/validations/student-journal";
import { requireGuardianForStudent } from "@/lib/student-journal/guards";
import {
  JOURNAL_FORBIDDEN_MSG,
  JOURNAL_NOT_ENROLLED_MSG,
} from "@/lib/student-journal/messages";

export async function POST(req: NextRequest) {
  // Rate limit: 20 notes per minute per IP
  const ip = getClientIp(req);
  const rl = rateLimit(`sj-note-post:${ip}`, 20, 60_000);
  if (!rl.success) {
    return NextResponse.json({ error: "Terlalu banyak permintaan" }, { status: 429 });
  }

  // Auth
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Parse + validate body
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body tidak valid" }, { status: 400 });
  }

  const parsed = noteBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Input tidak valid" },
      { status: 400 },
    );
  }

  const { studentId, date, body: noteBody } = parsed.data;

  // Note tenantId must match the student's record, not the author's session.
  // Otherwise a multi-tenant deployment where a teacher in tenant A is reading
  // a student in tenant B (e.g. a guru pengganti) saves the note tagged to
  // tenant A — and the guardian in tenant B never sees it via their week
  // queries which filter by their own tenantId. The bug surfaced as
  // "catatan visible on /parent/attendance but missing on /parent/student-journal"
  // because the two surfaces had subtly different filters; locking the note's
  // tenantId to the student removes the ambiguity.
  const studentForTenant = await prisma.student.findUnique({
    where: { id: studentId },
    select: { tenantId: true },
  });
  if (!studentForTenant) {
    return NextResponse.json({ error: JOURNAL_FORBIDDEN_MSG }, { status: 403 });
  }
  const noteTenantId = studentForTenant.tenantId;

  // Role-based authorization
  if (isAdminRole(session.role)) {
    // Admin (SUPER_ADMIN | SCHOOL_ADMIN) writes notes on behalf of staff —
    // tenant-scope check only, no class assignment required. Cycle T1
    // acceptance criterion (c) "admin → 200".
    if (!session.tenantId) {
      return NextResponse.json({ error: JOURNAL_FORBIDDEN_MSG }, { status: 403 });
    }
    const studentInTenant = await prisma.student.findFirst({
      where: { id: studentId, tenantId: session.tenantId },
      select: { id: true },
    });
    if (!studentInTenant) {
      return NextResponse.json({ error: JOURNAL_FORBIDDEN_MSG }, { status: 403 });
    }
  } else if (session.role === "TEACHER") {
    // Verify teacher is assigned to student's active class
    if (!session.tenantId || !session.employeeId) {
      return NextResponse.json({ error: JOURNAL_FORBIDDEN_MSG }, { status: 403 });
    }

    // Student may have multiple ACTIVE enrollments (e.g. cross-program day-care
    // students). Fetch ALL of them and grant if the teacher is assigned to ANY
    // of the student's classes — otherwise findFirst can return a class the
    // teacher isn't assigned to and the request 403s even though the teacher
    // IS authorized via another enrollment.
    const enrollments = await prisma.studentEnrollment.findMany({
      where: {
        studentId,
        status: "ACTIVE",
        classSection: { tenantId: session.tenantId },
      },
      select: { classSectionId: true },
    });
    if (enrollments.length === 0) {
      return NextResponse.json({ error: JOURNAL_NOT_ENROLLED_MSG }, { status: 404 });
    }

    const assignment = await prisma.teachingAssignment.findFirst({
      where: {
        employeeId: session.employeeId,
        classSectionId: { in: enrollments.map((e) => e.classSectionId) },
        classSection: { tenantId: session.tenantId },
      },
    });
    if (!assignment) {
      return NextResponse.json({ error: JOURNAL_FORBIDDEN_MSG }, { status: 403 });
    }
  } else if (session.role === "GUARDIAN") {
    const guard = await requireGuardianForStudent(studentId);
    if (guard.error) return guard.error;
  } else {
    return NextResponse.json({ error: JOURNAL_FORBIDDEN_MSG }, { status: 403 });
  }

  // Create note
  const note = await prisma.studentJournalNote.create({
    data: {
      tenantId: noteTenantId,
      studentId,
      date,
      authorUserId: session.id,
      authorRole: session.role,
      body: noteBody,
    },
    select: {
      id: true,
      date: true,
      authorRole: true,
      body: true,
      createdAt: true,
    },
  });

  return NextResponse.json({ data: note }, { status: 201 });
}
