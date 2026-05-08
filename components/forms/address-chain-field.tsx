"use client";

// AddressChainField — cascading Select × 4 (Provinsi → Kabupaten/Kota →
// Kecamatan → Kelurahan/Desa) + street-level inputs + Save button.
//
// Design reference: design-system.html §components/forms cascading-Select
// pattern (loading spinner, disabled state, empty-state copy per voice.md).
// Cycle: docs/cycles/2026-05-08-p2-addresses-idn-chain.md (T5)

import { useState, useEffect, useCallback } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import type { AddressInput } from "@/lib/entities/address/schema";

// --------------------------------------------------------------------------
// Types
// --------------------------------------------------------------------------

interface RegionItem {
  id: string;
  label: string;
}

interface RegionApiResponse {
  items: RegionItem[];
  hasMore: boolean;
}

export interface AddressChainFieldProps {
  initialValues?: Partial<{
    provinceId: string;
    provinceLabel?: string;
    regencyId: string;
    regencyLabel?: string;
    districtId: string;
    districtLabel?: string;
    villageId?: string;
    villageLabel?: string;
    streetLine: string;
    rt?: string;
    rw?: string;
    postalCode?: string;
    notes?: string;
  }>;
  onSave: (
    values: AddressInput,
  ) => Promise<{ ok: true; addressId: string } | { ok: false; error: string; field?: string }>;
  saveLabel?: string;
}

// --------------------------------------------------------------------------
// Helpers
// --------------------------------------------------------------------------

async function fetchRegions(url: string): Promise<RegionItem[]> {
  const res = await fetch(url);
  if (!res.ok) return [];
  const json: RegionApiResponse = await res.json();
  return json.items ?? [];
}

// --------------------------------------------------------------------------
// Component
// --------------------------------------------------------------------------

export function AddressChainField({
  initialValues,
  onSave,
  saveLabel = "Simpan Alamat",
}: AddressChainFieldProps) {
  // ── Cascading selection state ──────────────────────────────────────────
  const [provinceId, setProvinceId] = useState(initialValues?.provinceId ?? "");
  const [regencyId, setRegencyId] = useState(initialValues?.regencyId ?? "");
  const [districtId, setDistrictId] = useState(initialValues?.districtId ?? "");
  const [villageId, setVillageId] = useState(initialValues?.villageId ?? "");

  // ── Options cache: Map<parentIdOrSentinel, items[]> ───────────────────
  // Sentinel "" is used for provinces (no parent dependency).
  const [provincesCache, setProvincesCache] = useState<Map<string, RegionItem[]>>(new Map());
  const [regenciesCache, setRegenciesCache] = useState<Map<string, RegionItem[]>>(new Map());
  const [districtsCache, setDistrictsCache] = useState<Map<string, RegionItem[]>>(new Map());
  const [villagesCache, setVillagesCache] = useState<Map<string, RegionItem[]>>(new Map());

  // ── Loading flags ──────────────────────────────────────────────────────
  const [loadingProvinces, setLoadingProvinces] = useState(false);
  const [loadingRegencies, setLoadingRegencies] = useState(false);
  const [loadingDistricts, setLoadingDistricts] = useState(false);
  const [loadingVillages, setLoadingVillages] = useState(false);

  // ── Text inputs ────────────────────────────────────────────────────────
  const [streetLine, setStreetLine] = useState(initialValues?.streetLine ?? "");
  const [rt, setRt] = useState(initialValues?.rt ?? "");
  const [rw, setRw] = useState(initialValues?.rw ?? "");
  const [postalCode, setPostalCode] = useState(initialValues?.postalCode ?? "");
  const [notes, setNotes] = useState(initialValues?.notes ?? "");

  // ── UI state ───────────────────────────────────────────────────────────
  const [saving, setSaving] = useState(false);
  const [fieldError, setFieldError] = useState<{ field?: string; message: string } | null>(null);

  // ── Derived options from cache ─────────────────────────────────────────
  const provinces = provincesCache.get("") ?? [];
  const regencies = regenciesCache.get(provinceId) ?? [];
  const districts = districtsCache.get(regencyId) ?? [];
  const villages = villagesCache.get(districtId) ?? [];

  // ── Load provinces on mount ────────────────────────────────────────────
  useEffect(() => {
    if (provincesCache.has("")) return;
    setLoadingProvinces(true);
    fetchRegions("/api/regions/provinces").then((items) => {
      setProvincesCache((prev) => new Map(prev).set("", items));
      setLoadingProvinces(false);
    });
    // provincesCache intentionally excluded — sentinel guarantees single fetch
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Load regencies when provinceId changes ─────────────────────────────
  useEffect(() => {
    if (!provinceId) return;
    if (regenciesCache.has(provinceId)) return;
    setLoadingRegencies(true);
    fetchRegions(`/api/regions/regencies?provinceId=${provinceId}`).then((items) => {
      setRegenciesCache((prev) => new Map(prev).set(provinceId, items));
      setLoadingRegencies(false);
    });
  }, [provinceId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Load districts when regencyId changes ─────────────────────────────
  useEffect(() => {
    if (!regencyId) return;
    if (districtsCache.has(regencyId)) return;
    setLoadingDistricts(true);
    fetchRegions(`/api/regions/districts?regencyId=${regencyId}`).then((items) => {
      setDistrictsCache((prev) => new Map(prev).set(regencyId, items));
      setLoadingDistricts(false);
    });
  }, [regencyId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Load villages when districtId changes ─────────────────────────────
  useEffect(() => {
    if (!districtId) return;
    if (villagesCache.has(districtId)) return;
    setLoadingVillages(true);
    fetchRegions(`/api/regions/villages?districtId=${districtId}`).then((items) => {
      setVillagesCache((prev) => new Map(prev).set(districtId, items));
      setLoadingVillages(false);
    });
  }, [districtId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Cascade reset handlers ─────────────────────────────────────────────

  const handleProvinceChange = useCallback((value: string | null) => {
    setProvinceId(value ?? "");
    setRegencyId("");
    setDistrictId("");
    setVillageId("");
    setFieldError(null);
  }, []);

  const handleRegencyChange = useCallback((value: string | null) => {
    setRegencyId(value ?? "");
    setDistrictId("");
    setVillageId("");
    setFieldError(null);
  }, []);

  const handleDistrictChange = useCallback((value: string | null) => {
    setDistrictId(value ?? "");
    setVillageId("");
    setFieldError(null);
  }, []);

  // ── Save ───────────────────────────────────────────────────────────────

  const handleSave = useCallback(async () => {
    setFieldError(null);
    setSaving(true);

    const values: AddressInput = {
      provinceId,
      regencyId,
      districtId,
      ...(villageId ? { villageId } : {}),
      streetLine,
      ...(rt ? { rt } : {}),
      ...(rw ? { rw } : {}),
      ...(postalCode ? { postalCode } : {}),
      ...(notes ? { notes } : {}),
    };

    const result = await onSave(values);
    setSaving(false);

    if (result.ok) {
      toast.success("Alamat berhasil disimpan.");
    } else {
      setFieldError({ field: result.field, message: result.error });
    }
  }, [provinceId, regencyId, districtId, villageId, streetLine, rt, rw, postalCode, notes, onSave]);

  // ── Render helpers ─────────────────────────────────────────────────────

  function spinnerOrLabel(loading: boolean, label: string) {
    if (loading) {
      return (
        <span className="flex items-center gap-1.5 text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Memuat…
        </span>
      );
    }
    return label;
  }

  const isErrorFor = (field: string) =>
    fieldError?.field === field || (!fieldError?.field && false);

  // ── JSX ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4 rounded-lg border border-border bg-card p-4">
      <h3 className="text-sm font-semibold text-foreground">Alamat</h3>

      {/* Provinsi */}
      <div className="space-y-1.5">
        <Label htmlFor="acf-province">Provinsi</Label>
        <Select
          value={provinceId || null}
          onValueChange={handleProvinceChange}
          disabled={loadingProvinces}
        >
          <SelectTrigger
            id="acf-province"
            className="w-full"
            aria-invalid={isErrorFor("provinceId") ? true : undefined}
          >
            {loadingProvinces
              ? spinnerOrLabel(true, "Provinsi")
              : <SelectValue placeholder="Pilih provinsi" />}
          </SelectTrigger>
          <SelectContent>
            {provinces.length === 0
              ? <span className="block px-2 py-1.5 text-sm text-muted-foreground">Tidak ada pilihan</span>
              : provinces.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.label}
                  </SelectItem>
                ))}
          </SelectContent>
        </Select>
      </div>

      {/* Kabupaten/Kota */}
      <div className="space-y-1.5">
        <Label htmlFor="acf-regency">Kabupaten/Kota</Label>
        <Select
          value={regencyId || null}
          onValueChange={handleRegencyChange}
          disabled={!provinceId || loadingRegencies}
        >
          <SelectTrigger
            id="acf-regency"
            className="w-full"
            aria-invalid={isErrorFor("regencyId") ? true : undefined}
          >
            {loadingRegencies
              ? spinnerOrLabel(true, "Kabupaten/Kota")
              : <SelectValue placeholder="Pilih kabupaten/kota" />}
          </SelectTrigger>
          <SelectContent>
            {regencies.length === 0
              ? <span className="block px-2 py-1.5 text-sm text-muted-foreground">Tidak ada pilihan</span>
              : regencies.map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.label}
                  </SelectItem>
                ))}
          </SelectContent>
        </Select>
      </div>

      {/* Kecamatan */}
      <div className="space-y-1.5">
        <Label htmlFor="acf-district">Kecamatan</Label>
        <Select
          value={districtId || null}
          onValueChange={handleDistrictChange}
          disabled={!regencyId || loadingDistricts}
        >
          <SelectTrigger
            id="acf-district"
            className="w-full"
            aria-invalid={isErrorFor("districtId") ? true : undefined}
          >
            {loadingDistricts
              ? spinnerOrLabel(true, "Kecamatan")
              : <SelectValue placeholder="Pilih kecamatan" />}
          </SelectTrigger>
          <SelectContent>
            {districts.length === 0
              ? <span className="block px-2 py-1.5 text-sm text-muted-foreground">Tidak ada pilihan</span>
              : districts.map((d) => (
                  <SelectItem key={d.id} value={d.id}>
                    {d.label}
                  </SelectItem>
                ))}
          </SelectContent>
        </Select>
      </div>

      {/* Kelurahan/Desa */}
      <div className="space-y-1.5">
        <Label htmlFor="acf-village">Kelurahan/Desa</Label>
        <Select
          value={villageId || null}
          onValueChange={(value) => {
            setVillageId(value ?? "");
            setFieldError(null);
          }}
          disabled={!districtId || loadingVillages}
        >
          <SelectTrigger
            id="acf-village"
            className="w-full"
            aria-invalid={isErrorFor("villageId") ? true : undefined}
          >
            {loadingVillages
              ? spinnerOrLabel(true, "Kelurahan/Desa")
              : <SelectValue placeholder="Pilih kelurahan/desa (opsional)" />}
          </SelectTrigger>
          <SelectContent>
            {villages.length === 0
              ? <span className="block px-2 py-1.5 text-sm text-muted-foreground">Tidak ada pilihan</span>
              : villages.map((v) => (
                  <SelectItem key={v.id} value={v.id}>
                    {v.label}
                  </SelectItem>
                ))}
          </SelectContent>
        </Select>
      </div>

      {/* Alamat (Jalan, RT/RW) */}
      <div className="space-y-1.5">
        <Label htmlFor="acf-street">Alamat (Jalan, RT/RW)</Label>
        <Input
          id="acf-street"
          value={streetLine}
          onChange={(e) => {
            setStreetLine(e.target.value);
            setFieldError(null);
          }}
          placeholder="Contoh: Jl. Merdeka No. 12"
          aria-invalid={isErrorFor("streetLine") ? true : undefined}
        />
      </div>

      {/* RT / RW inline */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="acf-rt">RT</Label>
          <Input
            id="acf-rt"
            value={rt}
            onChange={(e) => setRt(e.target.value)}
            placeholder="001"
            maxLength={3}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="acf-rw">RW</Label>
          <Input
            id="acf-rw"
            value={rw}
            onChange={(e) => setRw(e.target.value)}
            placeholder="002"
            maxLength={3}
          />
        </div>
      </div>

      {/* Kode Pos */}
      <div className="space-y-1.5">
        <Label htmlFor="acf-postal">Kode Pos</Label>
        <Input
          id="acf-postal"
          value={postalCode}
          onChange={(e) => setPostalCode(e.target.value)}
          placeholder="12345"
          maxLength={5}
          aria-invalid={isErrorFor("postalCode") ? true : undefined}
        />
      </div>

      {/* Catatan */}
      <div className="space-y-1.5">
        <Label htmlFor="acf-notes">Catatan</Label>
        <Textarea
          id="acf-notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Patokan atau keterangan tambahan (opsional)"
          rows={2}
        />
      </div>

      {/* Inline error (server-returned) */}
      {fieldError && (
        <p className="text-sm text-destructive">
          {fieldError.message}
        </p>
      )}

      {/* Save */}
      <Button
        type="button"
        onClick={handleSave}
        disabled={saving || !provinceId || !regencyId || !districtId || !streetLine.trim()}
      >
        {saving && <Loader2 className="mr-2 size-4 animate-spin" />}
        {saveLabel}
      </Button>
    </div>
  );
}
