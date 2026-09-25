"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { BookHeart, CalendarDays, CheckCircle2, ClipboardList, MessageCircle, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/portal/page-header";
import { TaskList, TaskRow } from "@/components/portal/task-list";
import { SaveStatus } from "@/components/portal/save-status";
import { formatDate, formatTime } from "@/lib/format";
import type { TeacherClassSummary, TeacherSessionSummary } from "@/lib/teacher/home-progress";

type TodayRecord = { status: string; checkInTime: string | null; checkOutTime: string | null };
const SLOT_LABEL: Record<string,string> = {FULL_DAY:"Sehari penuh",MORNING:"Pagi",AFTERNOON:"Siang"};

export function nextStateAfterAction(record: TodayRecord | null, action: "check-in" | "check-out", now=new Date().toISOString()): TodayRecord {
  return action === "check-in" ? {status:"PRESENT",checkInTime:record?.checkInTime??now,checkOutTime:record?.checkOutTime??null}
    : {status:record?.status??"PRESENT",checkInTime:record?.checkInTime??now,checkOutTime:record?.checkOutTime??now};
}

export function TeacherHomeClient({userName,todayRecord,today,greeting="datang",classes=[],todaySessions=[],homeroomClassSectionName,attendanceUnavailable=false,classesUnavailable=false,sessionsUnavailable=false}: {
  userName:string; todayRecord:TodayRecord|null; today:string; greeting?:string; classes?:TeacherClassSummary[];
  todaySessions?:TeacherSessionSummary[]; homeroomClassSectionName?:string|null;
  attendanceUnavailable?:boolean; classesUnavailable?:boolean; sessionsUnavailable?:boolean;
}) {
  const router=useRouter();
  const [record,setRecord]=useState(todayRecord);
  // Refresh also reconciles a response lost after a successful server write.
  useEffect(() => { setRecord(todayRecord); }, [todayRecord]);
  const [saving,setSaving]=useState(false);
  const inFlight=useRef(false);
  const [saveError,setSaveError]=useState<string|null>(null);
  const [saved,setSaved]=useState(false);
  const [locationMessage,setLocationMessage]=useState<string|null>(null);
  const primary=classes.find(c => c.rosterCount > 0 && (c.attendanceRecorded === null || c.attendanceRecorded < c.rosterCount || !c.journal?.completed)) ?? classes[0];
  const dateLabel=formatDate(today,{weekday:"long",day:"numeric",month:"long",year:"numeric"});
  const classHref=(id:string,journey:"attendance"|"journal")=>`/teacher/${journey==="attendance"?"class-attendance":"student-journal/entry"}?classId=${encodeURIComponent(id)}&date=${today}`;
  const needsAttendance=primary && (primary.attendanceRecorded===null || primary.attendanceRecorded<primary.rosterCount);
  const needsJournal=primary && (!primary.journal || !primary.journal.completed);
  const primaryHref=primary ? classHref(primary.id,needsAttendance?"attendance":"journal") : "";
  const primaryLabel=primary ? needsAttendance ? primary.attendanceRecorded===null ? "Buka absensi kelas" : `Lanjutkan absensi · ${primary.attendanceRecorded}/${primary.rosterCount}`
    : needsJournal ? "Lanjutkan jurnal harian" : "Periksa jurnal harian" : "";
  const replyRows=[...new Map(classes.flatMap(c=>(c.replies??[]).map(reply=>[reply.studentId,{...reply,className:c.name}] as const))).values()];

  async function handleAction(){
    if(inFlight.current || record?.checkOutTime)return;
    inFlight.current=true;setSaving(true);setSaveError(null);setSaved(false);
    const action=record?.checkInTime?"check-out":"check-in";
    try {
      const gps=await new Promise<{lat:number;lng:number}|null>(resolve=>{
        if(!navigator.geolocation){setLocationMessage("Lokasi tidak tersedia; kehadiran tetap dapat dicatat.");resolve(null);return;}
        navigator.geolocation.getCurrentPosition(p=>{setLocationMessage("Lokasi tercatat.");resolve({lat:p.coords.latitude,lng:p.coords.longitude});},()=>{setLocationMessage("Lokasi tidak tersedia; kehadiran tetap dapat dicatat.");resolve(null);},{timeout:10000,enableHighAccuracy:true});
      });
      const response=await fetch(`/api/attendance/${action}`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(gps??{})});
      const body=await response.json();
      const data=response.ok?body:body.record;
      if(!data)throw Error(body.error || "Kehadiran belum tersimpan. Coba lagi ya.");
      if(!data.checkInTime || (action==="check-out"&&!data.checkOutTime))throw Error("Konfirmasi kehadiran belum tersedia. Coba lagi ya.");
      setRecord({status:data.status,checkInTime:data.checkInTime,checkOutTime:data.checkOutTime});setSaved(true);router.refresh();
    }catch(error){setSaveError(error instanceof Error?error.message:"Koneksi terputus. Coba lagi ya.");}
    finally{inFlight.current=false;setSaving(false);}
  }
  const personalAttendance=(
    <div className="space-y-2" aria-label="Kehadiran pribadi">
      {attendanceUnavailable ? <EmptyState title="Kehadiran pribadi belum bisa dimuat" description="Muat ulang sebelum mencatat masuk atau pulang." actionLabel="Coba lagi" onAction={()=>router.refresh()} /> : (
        <div className="flex flex-wrap items-center justify-between gap-2 text-small">
          <p className="flex min-w-0 items-center gap-2 text-muted-foreground">
            {record?.checkInTime ? <CheckCircle2 className="size-4 shrink-0 text-status-present-text" aria-hidden="true"/> : null}
            {record?.checkOutTime ? `Masuk ${formatTime(record.checkInTime)} · pulang ${formatTime(record.checkOutTime)}` : record?.checkInTime ? `Masuk ${formatTime(record.checkInTime)} · sudah tercatat` : "Kehadiran pribadi belum dicatat"}
          </p>
          {!record?.checkOutTime && <Button variant="outline" disabled={saving} onClick={handleAction} className="min-h-11">{saving?"Menyimpan…":saveError?"Coba lagi":record?.checkInTime?"Catat pulang":"Catat masuk"}</Button>}
        </div>
      )}
      {saving||saveError||saved ? <SaveStatus state={saving?"saving":saveError?"error":"saved"} message={saveError??(saving?"Menyimpan kehadiran…":"Kehadiran tersimpan")} />:null}
      {locationMessage?<p className="text-small text-muted-foreground">{locationMessage}</p>:null}
    </div>
  );
  return <div className="space-y-6">
    <PageHeader title={`Selamat ${greeting}, ${userName}`} subtitle={dateLabel} className="mb-0"/>
    {record?.checkInTime?personalAttendance:null}
    {classesUnavailable ? <EmptyState icon={Users} title="Kelas belum bisa dimuat" description="Periksa koneksi dan coba lagi." actionLabel="Coba lagi" onAction={()=>router.refresh()}/> : primary ? (
      <Card className="gap-4 border-primary/20 bg-secondary p-card" data-testid="current-class">
        <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-small font-semibold text-muted-foreground">Kelas hari ini</p>{primary.slot?<span className="text-small font-semibold text-primary-text">{SLOT_LABEL[primary.slot]??primary.slot}</span>:null}</div>
        <div><h2 className="text-h1 font-bold tracking-tight">{primary.name}</h2><p className="mt-1 text-body text-muted-foreground">{primary.rosterCount} siswa · {formatDate(today,{day:"numeric",month:"long"})}</p></div>
        {primary.rosterCount>0?<Button nativeButton={false} role="link" render={<Link href={primaryHref}/>} className="h-auto min-h-11 w-full whitespace-normal py-3"><ClipboardList aria-hidden="true"/>{primaryLabel}</Button>:<p className="text-body text-muted-foreground">Belum ada siswa. Minta admin menambahkan siswa ke kelas ini.</p>}
      </Card>
    ):<EmptyState icon={Users} title="Belum ada kelas yang ditugaskan" description="Hubungi admin sekolah untuk penugasan kelas. Sesi pengganti tetap tersedia di bawah."/>}
    {classes.length > 0 ? <section aria-labelledby="class-tasks">
      <h2 id="class-tasks" className="mb-3 text-h2 font-semibold">Yang perlu diselesaikan</h2>
      <TaskList>
        {classes.filter(c => c.attendanceRecorded === null || c.attendanceRecorded < c.rosterCount).map(c =>
          <TaskRow key={`attendance-${c.id}`} title={`Absensi ${c.name}`} description={c.attendanceRecorded === null ? "Data belum tersedia · buka untuk mencoba lagi" : `${c.attendanceRecorded} dari ${c.rosterCount} siswa tercatat`} meta="Buka" href={classHref(c.id,"attendance")} icon={<CalendarDays className="size-5"/>}/>
        )}
        {classes.filter(c => !c.journal?.completed).map(c =>
          <TaskRow key={`journal-${c.id}`} title={`Jurnal harian ${c.name}`} description={!c.journal ? "Data belum tersedia · buka untuk mencoba lagi" : !c.journal.configured ? "Indikator sekolah belum disiapkan. Hubungi admin." : `${c.journal.completeStudents} dari ${c.journal.totalStudents} siswa lengkap`} meta="Buka" href={classHref(c.id,"journal")} icon={<BookHeart className="size-5"/>} tone="warm"/>
        )}
        <TaskRow title="Buka penilaian" description={homeroomClassSectionName ? `Penilaian pekanan · ${homeroomClassSectionName}` : "Pilih penilaian kelas atau sentra"} href={homeroomClassSectionName ? "/teacher/assessments/weekly" : "/teacher/assessments"} icon={<ClipboardList className="size-5"/>} tone="purple"/>
      </TaskList>
      {classes.some(c => c.rosterCount > 0 && (c.attendanceRecorded === c.rosterCount || c.journal?.completed)) ? <Collapsible className="mt-3">
        <CollapsibleTrigger render={<Button variant="ghost" className="min-h-11"/>}>Pekerjaan yang sudah tersimpan</CollapsibleTrigger>
        <CollapsibleContent>
        <TaskList>
          {classes.filter(c => c.rosterCount > 0 && c.attendanceRecorded === c.rosterCount).map(c => <TaskRow key={`saved-attendance-${c.id}`} title={`Absensi ${c.name}`} description={`${c.rosterCount} siswa sudah tercatat`} meta="Periksa" href={classHref(c.id,"attendance")} icon={<CheckCircle2 className="size-5"/>}/>) }
          {classes.filter(c => c.journal?.completed).map(c => <TaskRow key={`saved-journal-${c.id}`} title={`Jurnal harian ${c.name}`} description={`${c.rosterCount} siswa lengkap`} meta="Periksa" href={classHref(c.id,"journal")} icon={<CheckCircle2 className="size-5"/>}/>) }
        </TaskList>
        </CollapsibleContent>
      </Collapsible> : null}
    </section> : null}
    {replyRows.length>0 || classes.some(c=>c.replies===null)?<section aria-labelledby="guardian-replies"><h2 id="guardian-replies" className="mb-3 text-h2 font-semibold">Balasan dari wali</h2><TaskList>
      {replyRows.map(r=><TaskRow key={r.studentId} title={`Balasan wali ${r.studentName}`} description={r.className} meta={`${r.count} baru`} href={`/teacher/student-journal/students/${encodeURIComponent(r.studentId)}?view=notes#catatan`} icon={<MessageCircle className="size-5"/>}/>)}
      {classes.some(c=>c.replies===null)?<TaskRow title="Balasan belum bisa dimuat" description="Coba muat ulang untuk melihat balasan terbaru." onClick={()=>router.refresh()} meta="Coba lagi"/>:null}
    </TaskList></section>:null}
    {!record?.checkInTime?personalAttendance:null}
    <section aria-labelledby="pickup-sessions"><h2 id="pickup-sessions" className="mb-1 text-h2 font-semibold">Sesi & penjemputan</h2><p className="mb-3 text-small text-muted-foreground">Catatan datang dan pulang setiap sesi disimpan terpisah dari absensi kelas.</p>
      {sessionsUnavailable?<EmptyState title="Sesi belum bisa dimuat" actionLabel="Coba lagi" onAction={()=>router.refresh()}/>:todaySessions.length>0?<TaskList>{todaySessions.map(s=><TaskRow key={s.id} title={s.className} description={`${SLOT_LABEL[s.slot]??s.slot} · ${s.rosterCount} siswa`} meta="Buka sesi" href={`/teacher/sessions/${s.id}`} icon={<ClipboardList className="size-5"/>}/>)}</TaskList>:<EmptyState title="Belum ada sesi terjadwal hari ini" description="Absensi dan jurnal kelas tetap bisa diisi melalui tugas kelas di atas."/>}
    </section>
  </div>;
}
