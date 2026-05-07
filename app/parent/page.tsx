// Parent portal home stub. Real Beranda content lands in a follow-up
// cycle (`p2-parent-beranda`). This stub exists so the layout guard +
// sidebar render under a real route — without it, `/parent` 404s.
//
// Cycle: docs/cycles/2026-05-08-p2-portal-shell-sidebar.md (T5)

export default function ParentHomePage() {
  return (
    <div className="p-6">
      <h1 className="text-2xl font-semibold">Beranda</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Halaman beranda wali sedang dalam pengembangan.
      </p>
    </div>
  );
}
