/**
 * Fetches the emsifa Indonesian wilayah dataset at the pinned SHA,
 * validates JSON shape with zod, shards villages per district,
 * and writes everything under `public/address/`.
 *
 * Run manually: `npm run seed:address` (CTO-gated, not in CI).
 */

import { writeFile, mkdir, rm, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { z } from "zod";

const PINNED_SHA = "ebc5151c762d46d89c0679f5d61e6b5bb6db8c40";
const RAW_BASE = `https://raw.githubusercontent.com/emsifa/api-wilayah-indonesia/${PINNED_SHA}/static/api`;
const OUT_DIR = path.join(process.cwd(), "public/address");
const RAW_SIZE_LIMIT_MB = 12;

const ProvinceSchema = z.object({ id: z.string(), name: z.string() });
const RegencySchema = z.object({ id: z.string(), province_id: z.string(), name: z.string() });
const DistrictSchema = z.object({ id: z.string(), regency_id: z.string(), name: z.string() });
const VillageSchema = z.object({ id: z.string(), district_id: z.string(), name: z.string() });

async function fetchJson<T>(url: string, schema: z.ZodType<T[]>): Promise<T[]> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`fetch ${url} → ${r.status}`);
  const json = await r.json();
  return schema.parse(json);
}

async function totalSizeMb(dir: string): Promise<number> {
  let bytes = 0;
  const { readdir } = await import("node:fs/promises");
  async function walk(p: string) {
    for (const entry of await readdir(p, { withFileTypes: true })) {
      const full = path.join(p, entry.name);
      if (entry.isDirectory()) await walk(full);
      else bytes += (await stat(full)).size;
    }
  }
  await walk(dir);
  return bytes / 1024 / 1024;
}

async function main() {
  if (PINNED_SHA === "<PASTE_SHA_HERE>") {
    throw new Error("PINNED_SHA placeholder not replaced");
  }

  if (existsSync(OUT_DIR)) await rm(OUT_DIR, { recursive: true });
  await mkdir(path.join(OUT_DIR, "villages"), { recursive: true });

  const provinces = await fetchJson(`${RAW_BASE}/provinces.json`, z.array(ProvinceSchema));
  await writeFile(path.join(OUT_DIR, "provinces.json"), JSON.stringify(provinces));

  const regencies: z.infer<typeof RegencySchema>[] = [];
  for (const p of provinces) {
    const part = await fetchJson(`${RAW_BASE}/regencies/${p.id}.json`, z.array(RegencySchema));
    regencies.push(...part.map((r) => ({ ...r, province_id: p.id })));
  }
  await writeFile(path.join(OUT_DIR, "regencies.json"), JSON.stringify(regencies));

  const districts: z.infer<typeof DistrictSchema>[] = [];
  for (const r of regencies) {
    const part = await fetchJson(`${RAW_BASE}/districts/${r.id}.json`, z.array(DistrictSchema));
    districts.push(...part.map((d) => ({ ...d, regency_id: r.id })));
  }
  await writeFile(path.join(OUT_DIR, "districts.json"), JSON.stringify(districts));

  // Fetch villages in batches of 20 to reduce wall-clock time without hammering the CDN
  const VILLAGE_BATCH_SIZE = 20;
  let totalVillages = 0;
  for (let i = 0; i < districts.length; i += VILLAGE_BATCH_SIZE) {
    const batch = districts.slice(i, i + VILLAGE_BATCH_SIZE);
    const results = await Promise.all(
      batch.map((d) =>
        fetchJson(`${RAW_BASE}/villages/${d.id}.json`, z.array(VillageSchema)).then(
          (part) => ({ id: d.id, part }),
        ),
      ),
    );
    for (const { id, part } of results) {
      totalVillages += part.length;
      await writeFile(path.join(OUT_DIR, "villages", `${id}.json`), JSON.stringify(part));
    }
  }

  const mb = await totalSizeMb(OUT_DIR);
  if (mb > RAW_SIZE_LIMIT_MB) {
    throw new Error(`Address dataset is ${mb.toFixed(1)} MB — exceeds ${RAW_SIZE_LIMIT_MB} MB limit`);
  }

  // eslint-disable-next-line no-console
  console.log(`[seed-address] provinces=${provinces.length} regencies=${regencies.length} districts=${districts.length} villages=${totalVillages} sizeMb=${mb.toFixed(1)}`);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
