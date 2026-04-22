"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, FieldLabel } from "@/components/ui/field";
import { BookHeart, Users } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/portal/page-header";

type Assignment = {
  id: string;
  classSection: { id: string; name: string; program: { name: string } };
};

export default function StudentJournalPickerPage() {
  const router = useRouter();
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [selectedClass, setSelectedClass] = useState("");
  const today = new Date().toISOString().split("T")[0];
  const [date, setDate] = useState(today);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/teaching-assignments/my")
      .then((r) => {
        if (!r.ok) {
          toast.error("Daftar kelas tidak bisa dimuat. Coba lagi sebentar ya.");
          setLoading(false);
          return;
        }
        return r.json();
      })
      .then((data) => {
        if (!data) return;
        setAssignments(data);
        if (data.length > 0) setSelectedClass(data[0].classSection.id);
        setLoading(false);
      })
      .catch(() => {
        toast.error("Daftar kelas tidak bisa dimuat. Coba lagi sebentar ya.");
        setLoading(false);
      });
  }, []);

  function handleSubmit() {
    if (!selectedClass) {
      toast.error("Pilih kelas dulu ya.");
      return;
    }
    if (!date) {
      toast.error("Pilih tanggal dulu ya.");
      return;
    }
    router.push(`/teacher/student-journal/entry?classId=${selectedClass}&date=${date}`);
  }

  if (loading) {
    return (
      <div className="px-5 pt-6 space-y-4">
        <Skeleton className="h-7 w-48 rounded-md" />
        <Skeleton className="h-12 w-full rounded-xl" />
        <Skeleton className="h-12 w-full rounded-xl" />
        <Skeleton className="h-12 w-full rounded-xl" />
      </div>
    );
  }

  if (assignments.length === 0) {
    return (
      <div className="px-5 pt-6">
        <EmptyState
          icon={Users}
          title="Belum ditugaskan ke kelas"
          description="Hubungi admin untuk ditugaskan mengajar di kelas tertentu."
        />
      </div>
    );
  }

  return (
    <div className="px-5 pt-6 pb-4 max-w-md mx-auto">
      <PageHeader
        title="Buku Penghubung"
        actions={<BookHeart size={22} className="text-primary" aria-hidden />}
      />

      <div className="space-y-4">
        <Field>
          <FieldLabel>Pilih Kelas</FieldLabel>
          <Select value={selectedClass} onValueChange={(v) => v && setSelectedClass(v)}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Pilih kelas" />
            </SelectTrigger>
            <SelectContent>
              {assignments.map((a) => (
                <SelectItem key={a.classSection.id} value={a.classSection.id}>
                  {a.classSection.name} — {a.classSection.program.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field>
          <FieldLabel>Tanggal</FieldLabel>
          <Input
            type="date"
            value={date}
            max={today}
            onChange={(e) => setDate(e.target.value)}
            className="w-full"
          />
        </Field>

        <Button onClick={handleSubmit} className="w-full mt-2" size="lg">
          Isi Penghubung
        </Button>
      </div>
    </div>
  );
}
