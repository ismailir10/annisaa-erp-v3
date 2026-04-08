"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/admin/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Plus, Search, Building2 } from "lucide-react";
import { motion } from "framer-motion";

type Employee = {
  id: string;
  kode: string;
  nama: string;
  email: string;
  jabatan: string;
  status: string;
  campusId: string;
  bankAccountNo: string | null;
  bpjsEnrolled: boolean;
  campus: { name: string };
};

type Campus = { id: string; name: string };

export default function EmployeesPage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [campuses, setCampuses] = useState<Campus[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterCampus, setFilterCampus] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");

  useEffect(() => {
    Promise.all([
      fetch("/api/employees").then((r) => r.json()),
      fetch("/api/config/campuses").then((r) => r.json()),
    ]).then(([emps, camps]) => {
      setEmployees(emps);
      setCampuses(camps);
      setLoading(false);
    });
  }, []);

  const filtered = employees.filter((e) => {
    if (filterCampus !== "all" && e.campusId !== filterCampus) return false;
    if (filterStatus !== "all" && e.status !== filterStatus) return false;
    if (search) {
      const q = search.toLowerCase();
      return e.nama.toLowerCase().includes(q) || e.kode.toLowerCase().includes(q) || e.email.toLowerCase().includes(q);
    }
    return true;
  });

  return (
    <>
      <PageHeader
        title="Karyawan"
        description={`${employees.filter((e) => e.status === "ACTIVE").length} aktif`}
        actions={
          <Link href="/admin/employees/new">
            <Button size="sm"><Plus size={16} className="mr-1.5" /> Tambah</Button>
          </Link>
        }
      />

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Cari nama, kode, atau email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={filterCampus} onValueChange={(v) => v && setFilterCampus(v)}>
          <SelectTrigger className="w-full sm:w-44">
            <Building2 size={14} className="mr-1.5 text-muted-foreground" />
            <SelectValue placeholder="Semua kampus" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Semua Kampus</SelectItem>
            {campuses.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterStatus} onValueChange={(v) => v && setFilterStatus(v)}>
          <SelectTrigger className="w-full sm:w-36"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Semua</SelectItem>
            <SelectItem value="ACTIVE">Aktif</SelectItem>
            <SelectItem value="INACTIVE">Tidak Aktif</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Employee list */}
      {loading ? (
        <div className="space-y-2">{[1, 2, 3, 4, 5].map((i) => <div key={i} className="h-16 bg-card rounded-lg animate-pulse" />)}</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <p>Tidak ada karyawan ditemukan</p>
        </div>
      ) : (
        <div className="space-y-1">
          {filtered.map((e, i) => (
            <motion.div
              key={e.id}
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.02 }}
            >
              <Link
                href={`/admin/employees/${e.id}`}
                className="flex items-center justify-between p-3 bg-card border border-border rounded-lg hover:border-primary/20 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    <span className="text-primary text-xs font-bold">{e.nama[0]}</span>
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{e.nama}</span>
                      <span className="font-currency text-[10px] text-muted-foreground">{e.kode}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">{e.jabatan} · {e.campus.name}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {!e.bankAccountNo && <Badge variant="outline" className="text-[10px] text-status-late">No Bank</Badge>}
                  <Badge
                    variant="secondary"
                    className={`text-[10px] ${e.status === "ACTIVE" ? "bg-status-present-subtle text-[#00875A]" : "bg-muted text-muted-foreground"}`}
                  >
                    {e.status === "ACTIVE" ? "Aktif" : "Tidak Aktif"}
                  </Badge>
                </div>
              </Link>
            </motion.div>
          ))}
        </div>
      )}
    </>
  );
}
