import { NextRequest, NextResponse } from "next/server";
import { rateLimit } from "@/lib/rate-limit";
import { requireNoteAccessForStudent } from "@/lib/student-journal/guards";
import { markNotesRead } from "@/lib/student-journal/note-reads";

/**
 * POST /api/student-journal/notes/read  { studentId }
 *
 * Moves the caller's read watermark for one student to now, which is what
 * clears the unread badge. Called when a reader opens the note surface — the
 * teacher's per-student page, the parent's Catatan tab.
 *
 * A write on what feels like a read, deliberately: the alternative (per-note
 * receipts written as cards scroll into view) answers no question the badge
 * asks and grows with notes × readers. The unique index on
 * (userId, studentId) makes repeat opens one row, not a log.
 *
 * Authorization is the same guard the note read + write use, so a reader can
 * only ever mark a student they were already allowed to see.
 */
export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body tidak valid" }, { status: 400 });
  }

  const studentId = (body as { studentId?: unknown } | null)?.studentId;
  if (typeof studentId !== "string" || studentId.length === 0) {
    return NextResponse.json({ error: "studentId wajib diisi" }, { status: 400 });
  }

  const access = await requireNoteAccessForStudent(studentId);
  if (access.error) return access.error;
  const { session, studentTenantId } = access;

  // Rate limit after auth, keyed per user: a mount-effect calling this on every
  // navigation is normal, a thousand a minute is not.
  const rl = rateLimit(`sj-note-read:${session.id}`, 120, 60_000);
  if (!rl.success) {
    return NextResponse.json({ error: "Terlalu banyak permintaan" }, { status: 429 });
  }

  const lastReadAt = await markNotesRead({
    tenantId: studentTenantId,
    studentId,
    readerUserId: session.id,
    now: new Date(),
  });

  return NextResponse.json({ data: { lastReadAt: lastReadAt.toISOString() } });
}
