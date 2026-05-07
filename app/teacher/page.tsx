// Teacher portal home stub. Real Beranda content lands in a follow-up
// cycle (`p2-teacher-beranda`). This stub exists so the layout guard +
// sidebar render under a real route — without it, `/teacher` 404s and
// the AC1 sidebar smoke test cannot assert active-route highlight.
//
// Cycle: docs/cycles/2026-05-08-p2-portal-shell-sidebar.md (T5)

export default function TeacherHomePage() {
  return (
    <div className="p-6">
      <h1 className="text-2xl font-semibold">Beranda</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Halaman beranda guru sedang dalam pengembangan.
      </p>
    </div>
  );
}
