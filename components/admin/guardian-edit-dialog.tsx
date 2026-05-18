/**
 * Shared guardian / parent edit form body.
 *
 * Three admin surfaces edit the same Parent record from different entry points:
 *
 *   1. app/admin/students/[id]/page.tsx     (Student detail → guardian dialog)
 *   2. app/admin/guardians/page.tsx         (Guardians list → row edit dialog)
 *   3. app/admin/guardians/[id]/page.tsx    (Guardian detail → inline edit)
 *
 * Before T7 each surface shipped its own form body with subtly different
 * field sets — most notably `childrenTotal` and `address` were absent from
 * the student-detail guardian dialog, so any edit from that surface SILENTLY
 * DROPPED both fields even though the schema accepts them. This component is
 * the single source of truth for the field set + section layout.
 *
 * Responsibility split:
 *   - This component owns the form fields, the section break (Data Pekerjaan),
 *     and the canonical Select option sources.
 *   - The page owns the Dialog/Sheet shell, open/close state, save handler,
 *     and the desktop-vs-mobile shell switch via useIsMobile.
 *
 * Out of scope for T7: childOrder + isPrimary belong to the StudentGuardian
 * junction and are T8's responsibility — they are not part of this shared
 * body. Callsites that currently pass them through (e.g. student-detail) keep
 * their own handling outside this component.
 */

import { Input } from "@/components/ui/input";
import { Field, FieldLabel } from "@/components/ui/field";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import {
  EDUCATION_OPTIONS,
  OCCUPATION_OPTIONS,
  INCOME_OPTIONS,
  RELATIONSHIP_OPTIONS,
  REL_LABELS,
} from "@/lib/constants/parent-options";

export type GuardianForm = {
  name: string;
  relationship: string;
  phone: string;
  whatsapp: string;
  email: string;
  parentNik: string;
  education: string;
  occupation: string;
  incomeRange: string;
  employer: string;
  employerAddress: string;
  employerCity: string;
  childrenTotal: string;
  address: string;
};

export const EMPTY_GUARDIAN_FORM: GuardianForm = {
  name: "",
  relationship: "WALI",
  phone: "",
  whatsapp: "",
  email: "",
  parentNik: "",
  education: "",
  occupation: "",
  incomeRange: "",
  employer: "",
  employerAddress: "",
  employerCity: "",
  childrenTotal: "",
  address: "",
};

export function GuardianFormBody({
  form,
  setForm,
  showRelationship = true,
}: {
  form: GuardianForm;
  setForm: (next: GuardianForm) => void;
  /**
   * Relationship belongs to the StudentGuardian junction, not the Parent. Set
   * to false on Parent-level entry points (guardians list, guardian detail)
   * where the same parent can hold different relationships across siblings.
   */
  showRelationship?: boolean;
}) {
  const patch = (p: Partial<GuardianForm>) => setForm({ ...form, ...p });

  return (
    <div className="space-y-field">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field>
          <FieldLabel required>Nama</FieldLabel>
          <Input value={form.name} onChange={(e) => patch({ name: e.target.value })} placeholder="Nama wali" />
        </Field>
        {showRelationship ? (
          <Field>
            <FieldLabel>Hubungan</FieldLabel>
            <Select
              value={form.relationship}
              onValueChange={(v) => v && patch({ relationship: v })}
              items={REL_LABELS}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {RELATIONSHIP_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        ) : (
          <Field>
            <FieldLabel>NIK</FieldLabel>
            <Input value={form.parentNik} onChange={(e) => patch({ parentNik: e.target.value })} placeholder="NIK orang tua" />
          </Field>
        )}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field>
          <FieldLabel>No. HP</FieldLabel>
          <Input value={form.phone} onChange={(e) => patch({ phone: e.target.value })} placeholder="081234567890" />
        </Field>
        <Field>
          <FieldLabel>WhatsApp</FieldLabel>
          <Input value={form.whatsapp} onChange={(e) => patch({ whatsapp: e.target.value })} placeholder="081234567890" />
        </Field>
      </div>
      <Field>
        <FieldLabel>Email</FieldLabel>
        <Input type="email" value={form.email} onChange={(e) => patch({ email: e.target.value })} placeholder="email@example.com" />
      </Field>
      <Field>
        <FieldLabel>Alamat</FieldLabel>
        <Input value={form.address} onChange={(e) => patch({ address: e.target.value })} placeholder="Alamat tempat tinggal" />
      </Field>

      <div className="pt-2 border-t">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Data Pekerjaan</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field>
          <FieldLabel>Pendidikan</FieldLabel>
          <Select value={form.education || undefined} onValueChange={(v) => v && patch({ education: v })}>
            <SelectTrigger><SelectValue placeholder="Pilih" /></SelectTrigger>
            <SelectContent>
              {EDUCATION_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field>
          <FieldLabel>Pekerjaan</FieldLabel>
          <Select value={form.occupation || undefined} onValueChange={(v) => v && patch({ occupation: v })}>
            <SelectTrigger><SelectValue placeholder="Pilih" /></SelectTrigger>
            <SelectContent>
              {OCCUPATION_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field>
          <FieldLabel>Penghasilan</FieldLabel>
          <Select value={form.incomeRange || undefined} onValueChange={(v) => v && patch({ incomeRange: v })}>
            <SelectTrigger><SelectValue placeholder="Pilih" /></SelectTrigger>
            <SelectContent>
              {INCOME_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        {showRelationship ? (
          <Field>
            <FieldLabel>NIK</FieldLabel>
            <Input value={form.parentNik} onChange={(e) => patch({ parentNik: e.target.value })} placeholder="NIK orang tua" />
          </Field>
        ) : (
          <Field>
            <FieldLabel>Jumlah Anak</FieldLabel>
            <Input
              type="number"
              min={0}
              value={form.childrenTotal}
              onChange={(e) => patch({ childrenTotal: e.target.value })}
              placeholder="0"
            />
          </Field>
        )}
      </div>
      {showRelationship && (
        <Field>
          <FieldLabel>Jumlah Anak</FieldLabel>
          <Input
            type="number"
            min={0}
            value={form.childrenTotal}
            onChange={(e) => patch({ childrenTotal: e.target.value })}
            placeholder="0"
          />
        </Field>
      )}
      <Field>
        <FieldLabel>Tempat Kerja</FieldLabel>
        <Input value={form.employer} onChange={(e) => patch({ employer: e.target.value })} placeholder="Nama perusahaan / instansi" />
      </Field>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field>
          <FieldLabel>Alamat Kantor</FieldLabel>
          <Input value={form.employerAddress} onChange={(e) => patch({ employerAddress: e.target.value })} placeholder="Alamat kantor" />
        </Field>
        <Field>
          <FieldLabel>Kota/Kab</FieldLabel>
          <Input value={form.employerCity} onChange={(e) => patch({ employerCity: e.target.value })} placeholder="Kota / Kabupaten" />
        </Field>
      </div>
    </div>
  );
}
