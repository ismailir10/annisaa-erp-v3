"use client";

import { useWatch, type Control } from "react-hook-form";
import type * as z4 from "zod/v4/core";
import { Input } from "@/components/ui/input";
import { DatePicker } from "@/components/ui/date-picker";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import {
  EDUCATION_OPTIONS,
  OCCUPATION_OPTIONS,
  INCOME_OPTIONS,
  RELATIONSHIP_OPTIONS,
} from "@/lib/constants/parent-options";
import { FormField } from "@/components/ui/form";
import { formatAgeFromDob } from "@/lib/admission/age";
import { createAdmissionSchema } from "@/lib/validations/admission";
import type { Program, Campus } from "./types";

// ------------------------------------------------------------------
// Form body (shared between Dialog on desktop and Sheet on mobile)
// Split out of `app/admin/admissions/page.tsx` (T5, cycle
// 2026-09-27-admin-finish-standard). No behaviour change — moved verbatim.
// ------------------------------------------------------------------

export type AdmissionFormValues = z4.input<typeof createAdmissionSchema>;
export type AdmissionFormOutput = z4.output<typeof createAdmissionSchema>;

export const EMPTY_ADMISSION_FORM: AdmissionFormValues = {
  childName: "",
  dateOfBirth: "",
  childGender: "",
  parentName: "",
  parentPhone: "",
  parentWhatsapp: "",
  parentEmail: "",
  parentEducation: "",
  parentOccupation: "",
  parentIncome: "",
  parentRelationship: "",
  programId: "",
  campusPreference: "",
  source: "WHATSAPP",
  notes: "",
  followUpDate: "",
};

export type AdmissionFormBodyProps = {
  control: Control<AdmissionFormValues, unknown, AdmissionFormOutput>;
  programs: Program[];
  campuses: Campus[];
};

export function AdmissionFormBody({ control, programs, campuses }: AdmissionFormBodyProps) {
  const dateOfBirth = useWatch({ control, name: "dateOfBirth" }) as string | undefined;
  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        <FormField
          control={control}
          name="childName"
          label="Nama Anak"
          required
          id="admission-childName"
          render={({ field, controlProps }) => (
            <Input {...field} {...controlProps} placeholder="Aisyah" />
          )}
        />
        <FormField
          control={control}
          name="dateOfBirth"
          label="Tanggal Lahir"
          id="admission-dateOfBirth"
          description={dateOfBirth ? `Usia: ${formatAgeFromDob(dateOfBirth) ?? "—"}` : undefined}
          render={({ field, controlProps }) => (
            <DatePicker
              {...controlProps}
              value={(field.value as string | undefined) ?? ""}
              onChange={field.onChange}
            />
          )}
        />
      </div>
      <FormField
        control={control}
        name="childGender"
        label="Jenis Kelamin"
        id="admission-childGender"
        render={({ field, controlProps }) => (
          <Select
            value={(field.value as string | undefined) ?? ""}
            onValueChange={(v) => v != null && field.onChange(v)}
            items={{ L: "Laki-laki", P: "Perempuan" }}
          >
            <SelectTrigger {...controlProps} onBlur={field.onBlur}>
              <SelectValue placeholder="Pilih" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="L">Laki-laki</SelectItem>
              <SelectItem value="P">Perempuan</SelectItem>
            </SelectContent>
          </Select>
        )}
      />
      <div className="grid grid-cols-2 gap-3">
        <FormField
          control={control}
          name="parentName"
          label="Nama Orang Tua"
          required
          id="admission-parentName"
          render={({ field, controlProps }) => (
            <Input {...field} {...controlProps} placeholder="Ibu Fatimah" />
          )}
        />
        <FormField
          control={control}
          name="parentWhatsapp"
          label="WhatsApp"
          id="admission-parentWhatsapp"
          render={({ field, controlProps }) => (
            <Input
              {...field}
              {...controlProps}
              value={(field.value as string | undefined) ?? ""}
              placeholder="081234567890"
            />
          )}
        />
      </div>
      <FormField
        control={control}
        name="parentRelationship"
        label="Hubungan dengan Anak"
        id="admission-parentRelationship"
        render={({ field, controlProps }) => (
          <Select
            value={(field.value as string | undefined) ?? ""}
            onValueChange={(v) => v != null && field.onChange(v)}
            items={Object.fromEntries(RELATIONSHIP_OPTIONS.map((o) => [o.value, o.label]))}
          >
            <SelectTrigger {...controlProps} onBlur={field.onBlur}>
              <SelectValue placeholder="Pilih" />
            </SelectTrigger>
            <SelectContent>
              {RELATIONSHIP_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <FormField
          control={control}
          name="parentEmail"
          label="Email"
          id="admission-parentEmail"
          render={({ field, controlProps }) => (
            <Input
              {...field}
              {...controlProps}
              type="email"
              value={(field.value as string | undefined) ?? ""}
              placeholder="email@contoh.com"
            />
          )}
        />
        <FormField
          control={control}
          name="parentPhone"
          label="No. HP"
          id="admission-parentPhone"
          render={({ field, controlProps }) => (
            <Input
              {...field}
              {...controlProps}
              value={(field.value as string | undefined) ?? ""}
              placeholder="081234567890"
            />
          )}
        />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <FormField
          control={control}
          name="parentEducation"
          label="Pendidikan Orang Tua"
          id="admission-parentEducation"
          render={({ field, controlProps }) => (
            <Select
              value={(field.value as string | undefined) ?? ""}
              onValueChange={(v) => v != null && field.onChange(v)}
              items={Object.fromEntries(EDUCATION_OPTIONS.map((o) => [o.value, o.label]))}
            >
              <SelectTrigger {...controlProps} onBlur={field.onBlur}>
                <SelectValue placeholder="Pilih" />
              </SelectTrigger>
              <SelectContent>
                {EDUCATION_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
        <FormField
          control={control}
          name="parentOccupation"
          label="Pekerjaan"
          id="admission-parentOccupation"
          render={({ field, controlProps }) => (
            <Select
              value={(field.value as string | undefined) ?? ""}
              onValueChange={(v) => v != null && field.onChange(v)}
              items={Object.fromEntries(OCCUPATION_OPTIONS.map((o) => [o.value, o.label]))}
            >
              <SelectTrigger {...controlProps} onBlur={field.onBlur}>
                <SelectValue placeholder="Pilih" />
              </SelectTrigger>
              <SelectContent>
                {OCCUPATION_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
        <FormField
          control={control}
          name="parentIncome"
          label="Penghasilan"
          id="admission-parentIncome"
          render={({ field, controlProps }) => (
            <Select
              value={(field.value as string | undefined) ?? ""}
              onValueChange={(v) => v != null && field.onChange(v)}
              items={Object.fromEntries(INCOME_OPTIONS.map((o) => [o.value, o.label]))}
            >
              <SelectTrigger {...controlProps} onBlur={field.onBlur}>
                <SelectValue placeholder="Pilih" />
              </SelectTrigger>
              <SelectContent>
                {INCOME_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <FormField
          control={control}
          name="programId"
          label="Program Diminati"
          id="admission-programId"
          render={({ field, controlProps }) => (
            <Select
              value={(field.value as string | undefined) ?? ""}
              onValueChange={(v) => v != null && field.onChange(v)}
              items={programs.map((p) => ({ label: p.name, value: p.id }))}
            >
              <SelectTrigger {...controlProps} onBlur={field.onBlur}>
                <SelectValue placeholder="Pilih program" />
              </SelectTrigger>
              <SelectContent>
                {programs.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
        <FormField
          control={control}
          name="campusPreference"
          label="Preferensi Kampus"
          id="admission-campusPreference"
          render={({ field, controlProps }) => (
            <Select
              value={(field.value as string | undefined) ?? ""}
              onValueChange={(v) => v != null && field.onChange(v)}
              items={campuses.map((c) => ({ label: c.name, value: c.id }))}
            >
              <SelectTrigger {...controlProps} onBlur={field.onBlur}>
                <SelectValue placeholder="Pilih kampus" />
              </SelectTrigger>
              <SelectContent>
                {campuses.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <FormField
          control={control}
          name="source"
          label="Sumber"
          required
          id="admission-source"
          render={({ field, controlProps }) => (
            <Select
              value={field.value as string}
              onValueChange={(v) => v != null && field.onChange(v)}
              items={{
                WHATSAPP: "WhatsApp",
                WALK_IN: "Datang Langsung",
                WEBSITE: "Website",
                REFERRAL: "Referensi",
                OTHER: "Lainnya",
              }}
            >
              <SelectTrigger {...controlProps} onBlur={field.onBlur}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="WHATSAPP">WhatsApp</SelectItem>
                <SelectItem value="WALK_IN">Datang Langsung</SelectItem>
                <SelectItem value="WEBSITE">Website</SelectItem>
                <SelectItem value="REFERRAL">Referensi</SelectItem>
                <SelectItem value="OTHER">Lainnya</SelectItem>
              </SelectContent>
            </Select>
          )}
        />
        <FormField
          control={control}
          name="followUpDate"
          label="Tanggal Tindak Lanjut"
          id="admission-followUpDate"
          render={({ field, controlProps }) => (
            <DatePicker
              {...controlProps}
              value={(field.value as string | undefined) ?? ""}
              onChange={field.onChange}
            />
          )}
        />
      </div>
      <FormField
        control={control}
        name="notes"
        label="Catatan"
        id="admission-notes"
        render={({ field, controlProps }) => (
          <Input
            {...field}
            {...controlProps}
            value={(field.value as string | undefined) ?? ""}
            placeholder="Catatan tambahan..."
          />
        )}
      />
    </>
  );
}
