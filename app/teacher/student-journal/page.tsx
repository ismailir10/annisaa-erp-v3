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
import { getTodayInTimezone } from "@/lib/attendance/timezone";

type Assignment = {
  id: string;
  classSection: { id: string; name: string; program: { name: string } };
};

export default function StudentJournalPickerPage() {
  const router = useRouter();
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [selectedClass, setSelectedClass] = useState("");
  const today = getTodayInTimezone("Asia/Jakarta");
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
      <div className="space-y-4">
        <PageHeader title="Buku Penghubung" />
        <Skeleton className="h-12 w-full rounded-xl" />
        <Skeleton className="h-12 w-full rounded-xl" />
        <Skeleton className="h-12 w-full rounded-xl" />
      </div>
    );
  }

  if (assignments.length === 0) {
    return (
      <div>
        <PageHeader title="Buku Penghubung" />
        <EmptyState
          icon={Users}
          title="Belum ditugaskan ke kelas"
          description="Hubungi admin untuk ditugaskan mengajar di kelas tertentu."
        />
      </div>
    );
  }

  return (
    <div>
      {/*
        One name for one thing. The nav tab says "Jurnal", this page said
        "Jurnal — Buku Penghubung", its CTA said "Isi Penghubung" and the
        destination said "Isi Buku Penghubung" — four labels, one destination.
        The tab keeps "Jurnal" (a width budget, documented in bottom-nav.tsx);
        every page-level surface now says Buku Penghubung.
      */}
      <PageHeader title="Buku Penghubung" subtitle="Pilih kelas dan tanggal" />

      <div className="space-y-4">
        <Field>
          <FieldLabel htmlFor="journal-class">Kelas</FieldLabel>
          <Select value={selectedClass} onValueChange={(v) => v && setSelectedClass(v)} items={assignments.map((a) => ({ label: `${a.classSection.name} — ${a.classSection.program.name}`, value: a.classSection.id }))}>
            <SelectTrigger id="journal-class" className="tap-target w-full">
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
          <FieldLabel htmlFor="journal-date">Tanggal</FieldLabel>
          <Input
            id="journal-date"
            type="date"
            value={date}
            max={today}
            onChange={(e) => setDate(e.target.value)}
            className="tap-target w-full"
          />
        </Field>

        <Button onClick={handleSubmit} className="tap-target w-full mt-2" size="lg">
          <BookHeart size={18} aria-hidden="true" />
          Isi Buku Penghubung
        </Button>
      </div>
    </div>
  );
}
