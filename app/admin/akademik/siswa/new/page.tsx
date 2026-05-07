// /admin/akademik/siswa/new — Student create form per spec §5.2 4-line recipe.
// onSubmit receives the createStudent server action directly — Next.js
// serialises server actions across the RSC → Client Component boundary
// (inline closures wrapping a server action would break the build).
//
// Cycle: docs/cycles/2026-05-07-p2-scaffold-pages.md (T5)

import { ScaffoldFormPage, formSpecFromEntity } from "@/lib/scaffold";
import student from "@/lib/entities/student/entity";
import { createStudent } from "@/lib/students/actions/create";
import type { Student } from "@/lib/generated/prisma/client";

export default function Page() {
  return (
    <ScaffoldFormPage<Student>
      formSpec={formSpecFromEntity(student)}
      mode="create"
      cancelHref="/admin/akademik/siswa"
      breadcrumbs={[
        { label: "Akademik", href: "/admin/akademik" },
        { label: "Siswa", href: "/admin/akademik/siswa" },
      ]}
      onSubmit={createStudent}
    />
  );
}
