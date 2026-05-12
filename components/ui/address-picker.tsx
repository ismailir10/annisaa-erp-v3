"use client";

import { useEffect, useState, useCallback } from "react";
import {
  AddressValue,
  DEFAULT_PROVINCE_CODE,
  DEFAULT_PROVINCE_NAME,
  Regency,
  District,
  Village,
} from "@/lib/address/types";
import {
  getProvinces,
  getRegencies,
  getDistricts,
  fetchVillages,
} from "@/lib/address/resolve";
import { Field, FieldLabel } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Props = {
  prefix: string;
  value: AddressValue;
  onChange: (v: AddressValue) => void;
  required?: boolean;
};

export function AddressPicker({ prefix, value, onChange, required }: Props) {
  const [provinces, setProvinces] = useState<{ id: string; name: string }[]>([]);
  const [regencies, setRegencies] = useState<Regency[]>([]);
  const [districts, setDistricts] = useState<District[]>([]);
  const [villages, setVillages] = useState<Village[]>([]);

  // 1. Load provinces eagerly; default Jabar if empty
  useEffect(() => {
    let mounted = true;
    getProvinces().then((list) => {
      if (!mounted) return;
      setProvinces(list);
      if (!value.provinceCode) {
        onChange({
          ...value,
          provinceCode: DEFAULT_PROVINCE_CODE,
          provinceName: DEFAULT_PROVINCE_NAME,
        });
      }
    });
    return () => {
      mounted = false;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // 2. Cascade: regencies follow provinceCode
  useEffect(() => {
    if (!value.provinceCode) {
      setRegencies([]);
      return;
    }
    getRegencies(value.provinceCode).then(setRegencies);
  }, [value.provinceCode]);

  // 3. Cascade: districts follow regencyCode
  useEffect(() => {
    if (!value.regencyCode) {
      setDistricts([]);
      return;
    }
    getDistricts(value.regencyCode).then(setDistricts);
  }, [value.regencyCode]);

  // 4. Cascade: villages follow districtCode (lazy fetch)
  useEffect(() => {
    if (!value.districtCode) {
      setVillages([]);
      return;
    }
    fetchVillages(value.districtCode).then(setVillages);
  }, [value.districtCode]);

  const setProvince = useCallback(
    (id: string | null) => {
      if (!id) return;
      const p = provinces.find((x) => x.id === id);
      if (!p) return;
      onChange({
        ...value,
        provinceCode: p.id,
        provinceName: p.name,
        regencyCode: "",
        regencyName: "",
        districtCode: "",
        districtName: "",
        villageCode: "",
        villageName: "",
      });
    },
    [provinces, value, onChange]
  );

  const setRegency = useCallback(
    (id: string | null) => {
      if (!id) return;
      const r = regencies.find((x) => x.id === id);
      if (!r) return;
      onChange({
        ...value,
        regencyCode: r.id,
        regencyName: r.name,
        districtCode: "",
        districtName: "",
        villageCode: "",
        villageName: "",
      });
    },
    [regencies, value, onChange]
  );

  const setDistrict = useCallback(
    (id: string | null) => {
      if (!id) return;
      const d = districts.find((x) => x.id === id);
      if (!d) return;
      onChange({
        ...value,
        districtCode: d.id,
        districtName: d.name,
        villageCode: "",
        villageName: "",
      });
    },
    [districts, value, onChange]
  );

  const setVillage = useCallback(
    (id: string | null) => {
      if (!id) return;
      const v = villages.find((x) => x.id === id);
      if (!v) return;
      onChange({ ...value, villageCode: v.id, villageName: v.name });
    },
    [villages, value, onChange]
  );

  const addressLineId = `${prefix}-addressLine`;

  return (
    <div className="space-y-4" data-prefix={prefix}>
      {/* Address line textarea */}
      <Field>
        <FieldLabel htmlFor={addressLineId} required={required}>
          Jalan, RT/RW, Blok
        </FieldLabel>
        <Textarea
          id={addressLineId}
          rows={2}
          value={value.addressLine}
          onChange={(e) => onChange({ ...value, addressLine: e.target.value })}
          placeholder="Contoh: Perum Metland Cibitung Blok D1/5"
        />
      </Field>

      {/* Province */}
      <Field>
        <FieldLabel>Provinsi</FieldLabel>
        <Select value={value.provinceCode || ""} onValueChange={setProvince}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="— pilih —" />
          </SelectTrigger>
          <SelectContent>
            {provinces.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      {/* Regency / Kab/Kota */}
      <Field>
        <FieldLabel>Kab/Kota</FieldLabel>
        <Select
          value={value.regencyCode || ""}
          onValueChange={setRegency}
          disabled={!value.provinceCode}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder="— pilih —" />
          </SelectTrigger>
          <SelectContent>
            {regencies.map((r) => (
              <SelectItem key={r.id} value={r.id}>
                {r.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      {/* District / Kecamatan */}
      <Field>
        <FieldLabel>Kecamatan</FieldLabel>
        <Select
          value={value.districtCode || ""}
          onValueChange={setDistrict}
          disabled={!value.regencyCode}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder="— pilih —" />
          </SelectTrigger>
          <SelectContent>
            {districts.map((d) => (
              <SelectItem key={d.id} value={d.id}>
                {d.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      {/* Village / Kelurahan/Desa */}
      <Field>
        <FieldLabel>Kelurahan/Desa</FieldLabel>
        <Select
          value={value.villageCode || ""}
          onValueChange={setVillage}
          disabled={!value.districtCode}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder="— pilih —" />
          </SelectTrigger>
          <SelectContent>
            {villages.map((v) => (
              <SelectItem key={v.id} value={v.id}>
                {v.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
    </div>
  );
}
