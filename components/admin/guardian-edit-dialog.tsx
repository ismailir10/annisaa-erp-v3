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
import { Switch } from "@/components/ui/switch";
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
  // T8: per-StudentGuardian junction fields. Editable only on entry points
  // that own the student↔guardian link (student detail). On Parent-level
  // entry points (guardians list, guardian detail) these stay out of the
  // form via `showRelationship={false}` which also hides the junction row.
  childOrder: string;
  isPrimary: boolean;
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
  childOrder: "",
  isPrimary: false,
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
          <FieldLabel required htmlFor="guardian-name">Nama</FieldLabel>
          <Input id="guardian-name" required aria-required="true" value={form.name} onChange={(e) => patch({ name: e.target.value })} placeholder="Nama wali" />
        </Field>
        {showRelationship ? (
          <Field>
            <FieldLabel htmlFor="guardian-relationship">Hubungan</FieldLabel>
            <Select
              value={form.relationship}
              onValueChange={(v) => v && patch({ relationship: v })}
              items={REL_LABELS}
            >
              <SelectTrigger id="guardian-relationship"><SelectValue /></SelectTrigger>
              <SelectContent>
                {RELATIONSHIP_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        ) : (
          <Field>
            <FieldLabel htmlFor="guardian-nik">NIK</FieldLabel>
            <Input id="guardian-nik" value={form.parentNik} onChange={(e) => patch({ parentNik: e.target.value })} placeholder="NIK orang tua" />
          </Field>
        )}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field>
          <FieldLabel htmlFor="guardian-phone">No. HP</FieldLabel>
          <Input id="guardian-phone" value={form.phone} onChange={(e) => patch({ phone: e.target.value })} placeholder="081234567890" />
        </Field>
        <Field>
          <FieldLabel htmlFor="guardian-whatsapp">WhatsApp</FieldLabel>
          <Input id="guardian-whatsapp" value={form.whatsapp} onChange={(e) => patch({ whatsapp: e.target.value })} placeholder="081234567890" />
        </Field>
      </div>
      <Field>
        <FieldLabel htmlFor="guardian-email">Email</FieldLabel>
        <Input id="guardian-email" type="email" value={form.email} onChange={(e) => patch({ email: e.target.value })} placeholder="email@example.com" />
      </Field>
      <Field>
        <FieldLabel htmlFor="guardian-address">Alamat</FieldLabel>
        <Input id="guardian-address" value={form.address} onChange={(e) => patch({ address: e.target.value })} placeholder="Alamat tempat tinggal" />
      </Field>

      <div className="pt-2 border-t">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Data Pekerjaan</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field>
          <FieldLabel htmlFor="guardian-education">Pendidikan</FieldLabel>
          <Select value={form.education || undefined} onValueChange={(v) => v && patch({ education: v })}>
            <SelectTrigger id="guardian-education"><SelectValue placeholder="Pilih" /></SelectTrigger>
            <SelectContent>
              {EDUCATION_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field>
          <FieldLabel htmlFor="guardian-occupation">Pekerjaan</FieldLabel>
          <Select value={form.occupation || undefined} onValueChange={(v) => v && patch({ occupation: v })}>
            <SelectTrigger id="guardian-occupation"><SelectValue placeholder="Pilih" /></SelectTrigger>
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
          <FieldLabel htmlFor="guardian-income">Penghasilan</FieldLabel>
          <Select value={form.incomeRange || undefined} onValueChange={(v) => v && patch({ incomeRange: v })}>
            <SelectTrigger id="guardian-income"><SelectValue placeholder="Pilih" /></SelectTrigger>
            <SelectContent>
              {INCOME_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        {showRelationship ? (
          <Field>
            <FieldLabel htmlFor="guardian-nik">NIK</FieldLabel>
            <Input id="guardian-nik" value={form.parentNik} onChange={(e) => patch({ parentNik: e.target.value })} placeholder="NIK orang tua" />
          </Field>
        ) : (
          <Field>
            <FieldLabel htmlFor="guardian-children-total">Jumlah Anak</FieldLabel>
            <Input
              id="guardian-children-total"
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
          <FieldLabel htmlFor="guardian-children-total">Jumlah Anak</FieldLabel>
          <Input
            id="guardian-children-total"
            type="number"
            min={0}
            value={form.childrenTotal}
            onChange={(e) => patch({ childrenTotal: e.target.value })}
            placeholder="0"
          />
        </Field>
      )}
      <Field>
        <FieldLabel htmlFor="guardian-employer">Tempat Kerja</FieldLabel>
        <Input id="guardian-employer" value={form.employer} onChange={(e) => patch({ employer: e.target.value })} placeholder="Nama perusahaan / instansi" />
      </Field>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field>
          <FieldLabel htmlFor="guardian-employer-address">Alamat Kantor</FieldLabel>
          <Input id="guardian-employer-address" value={form.employerAddress} onChange={(e) => patch({ employerAddress: e.target.value })} placeholder="Alamat kantor" />
        </Field>
        <Field>
          <FieldLabel htmlFor="guardian-employer-city">Kota/Kab</FieldLabel>
          <Input id="guardian-employer-city" value={form.employerCity} onChange={(e) => patch({ employerCity: e.target.value })} placeholder="Kota / Kabupaten" />
        </Field>
      </div>

      {/* T8: Junction fields (childOrder + isPrimary) only render on entry
          points that own the student↔guardian link. Server enforces the
          single-primary invariant in a serializable transaction. */}
      {showRelationship && (
        <>
          <div className="pt-2 border-t">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Data Anak</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field>
              <FieldLabel htmlFor="guardian-child-order">Anak ke-</FieldLabel>
              <Input
                id="guardian-child-order"
                type="number"
                min={1}
                value={form.childOrder}
                onChange={(e) => patch({ childOrder: e.target.value })}
                placeholder="1"
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="guardian-primary">Wali Utama</FieldLabel>
              <div className="flex items-center gap-3 pt-2">
                <Switch
                  id="guardian-primary"
                  checked={form.isPrimary}
                  onCheckedChange={(checked) => patch({ isPrimary: checked === true })}
                  aria-label="Tandai sebagai wali utama"
                />
                <span className="text-sm text-muted-foreground">
                  {form.isPrimary ? "Ya — wali utama" : "Bukan wali utama"}
                </span>
              </div>
            </Field>
          </div>
        </>
      )}
    </div>
  );
}
