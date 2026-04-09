"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/admin/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Plus, Search, Users } from "lucide-react";
import { motion } from "framer-motion";

type Student = {
  id: string; name: string; nickname: string | null; dateOfBirth: string | null;
  gender: string | null; status: string;
  guardians: { name: string; phone: string | null }[];
  enrollments: { classSection: { name: string; program: { name: string } } }[];
};

export default function StudentsPage() {
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => {
    fetch("/api/students").then(r => r.json()).then(d => { setStudents(d); setLoading(false); });
  }, []);

  const filtered = search
    ? students.filter(s => s.name.toLowerCase().includes(search.toLowerCase()) || s.nickname?.toLowerCase().includes(search.toLowerCase()))
    : students;

  return (
    <>
      <PageHeader
        title="Siswa"
        description={`${students.filter(s => s.status === "ACTIVE").length} siswa aktif`}
        actions={
          <Link href="/admin/students/new">
            <Button size="sm"><Plus size={14} className="mr-1.5" /> Daftarkan Siswa</Button>
          </Link>
        }
      />

      <div className="mb-4">
        <div className="relative max-w-sm">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Cari nama siswa..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
        </div>
      </div>

      {loading ? (
        <div className="space-y-2">{[1, 2, 3, 4].map(i => <div key={i} className="h-16 bg-card rounded-lg animate-pulse" />)}</div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Users}
          title={search ? "Tidak ada siswa ditemukan" : "Belum ada siswa terdaftar"}
          description={search ? "Coba kata kunci lain" : "Mulai dengan mendaftarkan siswa baru atau konversi dari pendaftaran."}
          actionLabel={!search ? "Daftarkan Siswa" : undefined}
          actionHref={!search ? "/admin/students/new" : undefined}
        />
      ) : (
        <div className="space-y-1">
          {filtered.map((s, i) => (
            <motion.div key={s.id} initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.02 }}>
              <Link href={`/admin/students/${s.id}`}>
                <Card className="p-3 hover:border-primary/20 transition-colors cursor-pointer">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                        <span className="text-primary text-xs font-bold">{s.name[0]}</span>
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium">{s.name}</span>
                          {s.nickname && <span className="text-xs text-muted-foreground">({s.nickname})</span>}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {s.enrollments[0]?.classSection.program.name ?? "Belum terdaftar di kelas"}
                          {s.enrollments[0] && ` · ${s.enrollments[0].classSection.name}`}
                          {s.guardians[0] && ` · ${s.guardians[0].name}`}
                        </p>
                      </div>
                    </div>
                    <StatusBadge status={s.status} />
                  </div>
                </Card>
              </Link>
            </motion.div>
          ))}
        </div>
      )}
    </>
  );
}
