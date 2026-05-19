import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession, isAdminRole } from "@/lib/auth";

// Convert admission to student record
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session?.tenantId || !isAdminRole(session.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;

  // T10: convert flow accepts `mergeWithDetected: boolean` so the admin can
  // override the auto-merge default when sibling-detect flagged a parent.
  // Default true preserves the pre-T10 behaviour (merge when detectedParentId
  // is set). Empty / non-JSON body falls through to the default — convert was
  // historically POST-with-no-body.
  let mergeWithDetected = true;
  try {
    const body = await req.json();
    if (body && typeof body.mergeWithDetected === "boolean") {
      mergeWithDetected = body.mergeWithDetected;
    }
  } catch {
    // No body → keep default
  }

  const admission = await prisma.admission.findUnique({ where: { id } });
  if (!admission || admission.tenantId !== session.tenantId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (admission.studentId) {
    console.error(
      `[admin-admissions CONVERT] already converted id=${id} studentId=${admission.studentId}`,
    );
    return NextResponse.json({ error: "Pendaftaran ini sudah dikonversi menjadi siswa" }, { status: 400 });
  }
  if (admission.status !== "ADMITTED") {
    console.error(
      `[admin-admissions CONVERT] wrong status id=${id} status=${admission.status} (expected ADMITTED)`,
    );
    return NextResponse.json({ error: "Hanya pendaftaran dengan status ADMITTED yang bisa dikonversi" }, { status: 400 });
  }

  // T10 email-conflict gate: when admin chose no-merge AND the admission's
  // parentEmail collides with an existing Parent row (Parent has
  // @@unique([tenantId, email])), fail FAST with 409 + actionable payload
  // before opening the transaction. Without this gate the create path inside
  // the tx would throw P2002 with no recovery info for the UI.
  if (!mergeWithDetected && admission.parentEmail) {
    const parentEmail = admission.parentEmail.trim();
    const conflicting = await prisma.parent.findUnique({
      where: { tenantId_email: { tenantId: session.tenantId, email: parentEmail } },
      select: { id: true, name: true },
    });
    if (conflicting) {
      return NextResponse.json(
        {
          error: "EMAIL_CONFLICT",
          conflictingParentId: conflicting.id,
          conflictingParentName: conflicting.name,
          message:
            "Parent with this email already exists. Use Merge to link, or clear the admission's parent email before retrying.",
        },
        { status: 409 },
      );
    }
  }

  // T11 field-parity audit — every transferable Admission column maps to:
  //   childName            → Student.name
  //   childGender          → Student.gender
  //   dateOfBirth          → Student.dateOfBirth
  //   notes                → Student.notes
  //   parentName/Phone/Email/Whatsapp/Education/Occupation/Income
  //                        → Parent.{name,phone,email,whatsapp,education,
  //                                  occupation,incomeRange}
  //   parentRelationship   → StudentGuardian.relationship
  //   campusPreference     → Student.metadata.campusPreference (stash per
  //                          cycle assumption #3 — convert doesn't auto-
  //                          create an enrollment; a future enroll flow can
  //                          read this hint to default the campus picker)
  // Intentionally NOT transferred (stay on the Admission row for audit):
  //   programId            — Admission keeps program ref; first enroll picks
  //                          ClassSection (carries program transitively)
  //   source / followUpDate / detectedParentId / status / createdAt
  //                        — admission-internal audit
  //   childAge             — legacy free-text, derived from dateOfBirth at
  //                          display time; never written on new admissions
  //                          (see lib/admission/age.ts)
  const { student } = await prisma.$transaction(async (tx) => {
    const studentMetadata = admission.campusPreference
      ? JSON.stringify({ campusPreference: admission.campusPreference })
      : null;
    const student = await tx.student.create({
      data: {
        tenantId: session.tenantId!,
        name: admission.childName,
        dateOfBirth: admission.dateOfBirth,
        gender: admission.childGender,
        notes: admission.notes,
        metadata: studentMetadata,
      },
    });

    const parentEmail = admission.parentEmail?.trim() || null;
    let parent;
    // T10: mergeWithDetected=false forces the create path even when an email
    // could upsert into an existing row. The email-conflict gate above
    // already returned 409 if a Parent with that email exists, so reaching
    // here on the no-merge branch implies the email is unique OR the admin
    // explicitly accepted creating a brand-new parent without email merge.
    if (parentEmail && mergeWithDetected) {
      parent = await tx.parent.upsert({
        where: { tenantId_email: { tenantId: session.tenantId!, email: parentEmail } },
        create: {
          tenantId: session.tenantId!,
          name: admission.parentName,
          email: parentEmail,
          phone: admission.parentPhone,
          whatsapp: admission.parentWhatsapp,
          education: admission.parentEducation,
          occupation: admission.parentOccupation,
          incomeRange: admission.parentIncome,
        },
        update: {
          name: admission.parentName,
          phone: admission.parentPhone,
          whatsapp: admission.parentWhatsapp,
          education: admission.parentEducation,
          occupation: admission.parentOccupation,
          incomeRange: admission.parentIncome,
        },
      });
    } else {
      parent = await tx.parent.create({
        data: {
          tenantId: session.tenantId!,
          name: admission.parentName,
          // No-merge branch may still keep the email — uniqueness was
          // verified by the pre-tx gate above.
          email: mergeWithDetected ? null : parentEmail,
          phone: admission.parentPhone,
          whatsapp: admission.parentWhatsapp,
          education: admission.parentEducation,
          occupation: admission.parentOccupation,
          incomeRange: admission.parentIncome,
        },
      });
    }

    await tx.studentGuardian.create({
      data: {
        studentId: student.id,
        parentId: parent.id,
        relationship: admission.parentRelationship || "IBU",
        isPrimary: true,
      },
    });

    await tx.admission.update({
      where: { id },
      data: { studentId: student.id },
    });

    return { student };
  });

  return NextResponse.json({ student, message: "Siswa berhasil dibuat dari data pendaftaran" });
}
