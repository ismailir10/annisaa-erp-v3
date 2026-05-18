"use client";

import { useEffect, useState, useCallback, use } from "react";
import Link from "next/link";
import { DetailPageHeader } from "@/components/admin/detail-page-header";
import { DetailPageSkeleton } from "@/components/admin/detail-page-skeleton";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/ui/status-badge";
import { AdminTabs, AdminTabsList, AdminTabsTrigger, AdminTabsContent } from "@/components/admin/admin-tabs";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionHeading } from "@/components/ui/section-heading";
import { ArrowLeft, Mail, Phone, MapPin, Briefcase, User, Building, GraduationCap, Wallet, Users, FileText, Baby, Pencil, X, Save } from "lucide-react";
import { toast } from "sonner";
import { REL_LABELS } from "@/lib/constants/parent-options";
import { GuardianFormBody, EMPTY_GUARDIAN_FORM, type GuardianForm } from "@/components/admin/guardian-edit-dialog";

// ------------------------------------------------------------------
// Types
// ------------------------------------------------------------------

type ParentDetail = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  whatsapp: string | null;
  address: string | null;
  nik: string | null;
  education: string | null;
  occupation: string | null;
  employer: string | null;
  employerAddress: string | null;
  employerCity: string | null;
  incomeRange: string | null;
  childrenTotal: number | null;
  status: string;
  guardians: {
    id: string;
    relationship: string;
    isPrimary: boolean;
    status: string;
    student: { id: string; name: string; status: string; gender: string | null };
  }[];
  invoices: {
    id: string;
    invoiceNumber: string;
    periodLabel: string;
    totalDue: number;
    totalPaid: number;
    status: string;
  }[];
};

// ------------------------------------------------------------------
// Constants
// ------------------------------------------------------------------

// ------------------------------------------------------------------
// Page
// ------------------------------------------------------------------

export default function GuardianDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [parent, setParent] = useState<ParentDetail | null>(null);
  const [loading, setLoading] = useState(true);

  // Edit toggle
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState<GuardianForm>(EMPTY_GUARDIAN_FORM);
  const [saving, setSaving] = useState(false);

  const fetchParent = useCallback(async () => {
    try {
      const res = await fetch(`/api/parents/${id}`);
      if (!res.ok) { toast.error("Gagal memuat data wali"); return; }
      setParent(await res.json());
    } catch { toast.error("Terjadi kesalahan"); }
    finally { setLoading(false); }
  }, [id]);

  useEffect(() => { fetchParent(); }, [fetchParent]);

  // --- Edit toggle ---
  function startEditing() {
    if (!parent) return;
    setEditForm({
      ...EMPTY_GUARDIAN_FORM,
      name: parent.name,
      email: parent.email ?? "",
      phone: parent.phone ?? "",
      whatsapp: parent.whatsapp ?? "",
      address: parent.address ?? "",
      parentNik: parent.nik ?? "",
      education: parent.education ?? "",
      occupation: parent.occupation ?? "",
      employer: parent.employer ?? "",
      employerAddress: parent.employerAddress ?? "",
      employerCity: parent.employerCity ?? "",
      incomeRange: parent.incomeRange ?? "",
      childrenTotal: parent.childrenTotal != null ? String(parent.childrenTotal) : "",
    });
    setIsEditing(true);
  }

  async function saveParent() {
    if (!editForm.name.trim()) { toast.error("Nama wajib diisi"); return; }
    if (!parent) return;

    // Save via PUT /api/guardians/[guardianId] where guardianId = first StudentGuardian ID
    const guardianId = parent.guardians[0]?.id;
    if (!guardianId) { toast.error("Tidak ada data StudentGuardian untuk diperbarui"); return; }

    setSaving(true);
    try {
      const res = await fetch(`/api/guardians/${guardianId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...editForm,
          childrenTotal: editForm.childrenTotal ? Number(editForm.childrenTotal) : null,
        }),
      });
      if (res.ok) {
        toast.success("Data wali diperbarui");
        setIsEditing(false);
        fetchParent();
      } else {
        const d = await res.json().catch(() => ({}));
        toast.error(d.error || "Gagal menyimpan");
      }
    } catch { toast.error("Terjadi kesalahan"); }
    setSaving(false);
  }

  if (loading) return <DetailPageSkeleton />;
  if (!parent) return <EmptyState title="Wali tidak ditemukan" description="Data wali tidak tersedia atau telah dihapus." />;

  const studentCount = parent.guardians.length;

  return (
    <>
      <DetailPageHeader
        backHref="/admin/guardians"
        backLabel="Kembali ke Daftar Wali"
        title={parent.name}
        description={`${studentCount} siswa terdaftar`}
        badge={<StatusBadge status={parent.status} />}
        actions={
          !isEditing ? (
            <Button size="sm" variant="outline" onClick={startEditing}>
              <Pencil size={14} className="mr-1" /> Edit
            </Button>
          ) : undefined
        }
      />

      {/* Profile Card — View/Edit toggle */}
      <Card className="p-card mb-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Data Wali</h3>
          {isEditing && (
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => setIsEditing(false)} disabled={saving}>
                <X size={14} className="mr-1" /> Batal
              </Button>
              <Button size="sm" onClick={saveParent} disabled={saving}>
                <Save size={14} className="mr-1" /> {saving ? "Menyimpan..." : "Simpan Perubahan"}
              </Button>
            </div>
          )}
        </div>

        {isEditing ? (
          <GuardianFormBody form={editForm} setForm={setEditForm} showRelationship={false} />
        ) : (
          <>
            <div className="grid grid-cols-2 gap-4">
              <div className="flex items-center gap-3">
                <User size={16} className="text-muted-foreground shrink-0" />
                <div><p className="text-xs text-muted-foreground">Nama Lengkap</p><p className="text-sm font-medium">{parent.name}</p></div>
              </div>
              {parent.email && (
                <div className="flex items-center gap-3">
                  <Mail size={16} className="text-muted-foreground shrink-0" />
                  <div><p className="text-xs text-muted-foreground">Email</p><p className="text-sm font-medium">{parent.email}</p></div>
                </div>
              )}
              {parent.phone && (
                <div className="flex items-center gap-3">
                  <Phone size={16} className="text-muted-foreground shrink-0" />
                  <div><p className="text-xs text-muted-foreground">Telepon</p><p className="text-sm font-medium">{parent.phone}</p></div>
                </div>
              )}
              {parent.whatsapp && (
                <div className="flex items-center gap-3">
                  <Phone size={16} className="text-muted-foreground shrink-0" />
                  <div><p className="text-xs text-muted-foreground">WhatsApp</p><p className="text-sm font-medium">{parent.whatsapp}</p></div>
                </div>
              )}
              {parent.address && (
                <div className="col-span-2 flex items-start gap-3">
                  <MapPin size={16} className="text-muted-foreground shrink-0 mt-0.5" />
                  <div><p className="text-xs text-muted-foreground">Alamat</p><p className="text-sm">{parent.address}</p></div>
                </div>
              )}
              {parent.nik && (
                <div className="flex items-center gap-3">
                  <User size={16} className="text-muted-foreground shrink-0" />
                  <div><p className="text-xs text-muted-foreground">NIK</p><p className="text-sm font-medium font-currency">{parent.nik}</p></div>
                </div>
              )}
              {parent.childrenTotal != null && (
                <div className="flex items-center gap-3">
                  <Baby size={16} className="text-muted-foreground shrink-0" />
                  <div><p className="text-xs text-muted-foreground">Jumlah Anak</p><p className="text-sm font-medium">{parent.childrenTotal}</p></div>
                </div>
              )}
            </div>

            {(parent.education || parent.occupation || parent.employer || parent.incomeRange) && (
              <>
                <div className="mt-6"><SectionHeading label="Data Pekerjaan" /></div>
                <div className="grid grid-cols-2 gap-4">
                  {parent.education && (
                    <div className="flex items-center gap-3">
                      <GraduationCap size={16} className="text-muted-foreground shrink-0" />
                      <div><p className="text-xs text-muted-foreground">Pendidikan</p><p className="text-sm font-medium">{parent.education}</p></div>
                    </div>
                  )}
                  {parent.occupation && (
                    <div className="flex items-center gap-3">
                      <Briefcase size={16} className="text-muted-foreground shrink-0" />
                      <div><p className="text-xs text-muted-foreground">Pekerjaan</p><p className="text-sm font-medium">{parent.occupation}</p></div>
                    </div>
                  )}
                  {parent.incomeRange && (
                    <div className="flex items-center gap-3">
                      <Wallet size={16} className="text-muted-foreground shrink-0" />
                      <div><p className="text-xs text-muted-foreground">Penghasilan</p><p className="text-sm font-medium">{parent.incomeRange}</p></div>
                    </div>
                  )}
                  {parent.employer && (
                    <div className="flex items-center gap-3">
                      <Building size={16} className="text-muted-foreground shrink-0" />
                      <div><p className="text-xs text-muted-foreground">Tempat Kerja</p><p className="text-sm font-medium">{parent.employer}</p></div>
                    </div>
                  )}
                  {parent.employerAddress && (
                    <div className="flex items-center gap-3">
                      <MapPin size={16} className="text-muted-foreground shrink-0" />
                      <div><p className="text-xs text-muted-foreground">Alamat Kantor</p><p className="text-sm font-medium">{parent.employerAddress}</p></div>
                    </div>
                  )}
                  {parent.employerCity && (
                    <div className="flex items-center gap-3">
                      <Building size={16} className="text-muted-foreground shrink-0" />
                      <div><p className="text-xs text-muted-foreground">Kota/Kab</p><p className="text-sm font-medium">{parent.employerCity}</p></div>
                    </div>
                  )}
                </div>
              </>
            )}
          </>
        )}
      </Card>

      {/* Tabs for related data */}
      <AdminTabs defaultValue="students">
        <AdminTabsList>
          <AdminTabsTrigger value="students"><Users size={13} className="mr-1" />Anak Terdaftar</AdminTabsTrigger>
          <AdminTabsTrigger value="invoices"><FileText size={13} className="mr-1" />Tagihan</AdminTabsTrigger>
        </AdminTabsList>

        <AdminTabsContent value="students">
          <Card className="p-card mt-2">
            <SectionHeading label="Anak Terdaftar" />
            {parent.guardians.length === 0 ? (
              <EmptyState title="Belum ada anak terdaftar" description="Belum ada siswa yang ditautkan ke wali ini." />
            ) : (
              <div className="space-y-2">
                {parent.guardians.map(g => (
                  <Link key={g.id} href={`/admin/students/${g.student.id}`} className="block">
                    <div className="flex items-center justify-between py-2.5 border-b border-border/50 last:border-0 hover:bg-accent/50 rounded-md px-2 -mx-2 transition-colors">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium">{g.student.name}</span>
                          <Badge variant="outline" className="text-xs">{REL_LABELS[g.relationship] ?? g.relationship}</Badge>
                          {g.isPrimary && <Badge className="bg-primary/10 text-primary text-xs">Utama</Badge>}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {g.student.gender === "L" ? "Laki-laki" : g.student.gender === "P" ? "Perempuan" : ""}
                        </p>
                      </div>
                      <StatusBadge status={g.student.status} />
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </Card>
        </AdminTabsContent>

        <AdminTabsContent value="invoices">
          <Card className="p-card mt-2">
            <SectionHeading label="Tagihan" />
            {parent.invoices.length === 0 ? (
              <EmptyState title="Belum ada tagihan" description="Belum ada tagihan untuk wali ini." />
            ) : (
              <div className="space-y-0">
                {parent.invoices.map(inv => (
                  <Link key={inv.id} href={`/admin/invoices/${inv.id}`} className="block">
                    <div className="flex items-center justify-between py-2.5 border-b border-border/50 last:border-0 hover:bg-accent/50 rounded-md px-2 -mx-2 transition-colors">
                      <div>
                        <p className="text-sm font-medium">{inv.invoiceNumber}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {inv.periodLabel} &middot; Rp {inv.totalDue.toLocaleString("id-ID")}
                        </p>
                      </div>
                      <StatusBadge status={inv.status} />
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </Card>
        </AdminTabsContent>
      </AdminTabs>
    </>
  );
}
