import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { noteBodySchema } from "@/lib/validations/student-journal";
import { requireGuardianForStudent } from "@/lib/student-journal/guards";

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

  // Role-based authorization
  if (session.role === "TEACHER") {
    // Verify teacher is assigned to student's active class
    if (!session.tenantId || !session.employeeId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const enrollment = await prisma.studentEnrollment.findFirst({
      where: { studentId, status: "ACTIVE" },
      select: { classSectionId: true },
    });
    if (!enrollment) {
      return NextResponse.json({ error: "Student not enrolled" }, { status: 404 });
    }

    const assignment = await prisma.teachingAssignment.findFirst({
      where: {
        employeeId: session.employeeId,
        classSectionId: enrollment.classSectionId,
        classSection: { tenantId: session.tenantId },
      },
    });
    if (!assignment) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  } else if (session.role === "GUARDIAN") {
    const guard = await requireGuardianForStudent(studentId);
    if (guard.error) return guard.error;
  } else {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Create note
  const note = await prisma.studentJournalNote.create({
    data: {
      tenantId: session.tenantId!,
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
