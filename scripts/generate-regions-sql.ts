// One-shot generator for prisma/seed/01-regions.sql. Fetches the 4 CSVs from
// fityannugroho/idn-area-data at a pinned commit SHA (immutable snapshot),
// strips dots from BPS codes, derives Regency.type from name prefix, and
// emits multi-row INSERT … ON CONFLICT … DO UPDATE blocks chunked at 1000
// rows per statement.
//
// Usage:  npx tsx scripts/generate-regions-sql.ts
// Output: prisma/seed/01-regions.sql (overwrites)
//
// Cycle: docs/cycles/2026-05-05-p1-regions-seed.md
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

const SOURCE_REPO = "fityannugroho/idn-area-data";
const SOURCE_SHA = "b36d0792e039555eee86bda3d3092cdfcacb16f4";
const SOURCE_VERSION = "v4.0.1";
const RAW_BASE = `https://raw.githubusercontent.com/${SOURCE_REPO}/${SOURCE_SHA}/data`;

const OUTPUT = resolve(__dirname, "..", "prisma", "seed", "01-regions.sql");
const CHUNK_SIZE = 1000;

type ProvinceRow = { id: string; name: string };
type RegencyRow = { id: string; provinceId: string; name: string; type: "KABUPATEN" | "KOTA" };
type DistrictRow = { id: string; regencyId: string; name: string };
type VillageRow = { id: string; districtId: string; name: string };

async function fetchCsv(filename: string): Promise<string[][]> {
  const url = `${RAW_BASE}/${filename}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch ${url}: ${res.status} ${res.statusText}`);
  }
  const text = await res.text();
  return parseCsv(text);
}

// Minimal RFC-4180 CSV parser: handles quoted fields with embedded commas/quotes.
// idn-area-data CSVs are well-formed and rarely use quoting, but the parser is
// defensive against future data shifts (e.g., a name with a comma).
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n") {
      row.push(field);
      field = "";
      if (row.length > 1 || row[0] !== "") rows.push(row);
      row = [];
    } else if (ch === "\r") {
      // skip
    } else {
      field += ch;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    if (row.length > 1 || row[0] !== "") rows.push(row);
  }
  return rows;
}

function stripDots(code: string): string {
  return code.replace(/\./g, "");
}

function escapeSql(s: string): string {
  return s.replace(/'/g, "''");
}

function deriveRegencyType(name: string): "KABUPATEN" | "KOTA" {
  return name.startsWith("Kota ") ? "KOTA" : "KABUPATEN";
}

function chunked<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function emitInsertChunks(
  table: string,
  cols: string[],
  rows: string[][],
  conflictUpdate: string[],
): string {
  // rows: each row is an array of pre-quoted/literal SQL value expressions matching `cols` order.
  const chunks = chunked(rows, CHUNK_SIZE);
  const updateClause = conflictUpdate.map((c) => `"${c}" = EXCLUDED."${c}"`).join(", ");
  return chunks
    .map(
      (chunk) =>
        `INSERT INTO "${table}" (${cols.map((c) => `"${c}"`).join(", ")}) VALUES\n` +
        chunk.map((vals) => `  (${vals.join(", ")})`).join(",\n") +
        `\nON CONFLICT ("id") DO UPDATE SET ${updateClause}, "updatedAt" = NOW();`,
    )
    .join("\n\n");
}

async function main(): Promise<void> {
  console.log(`→ fetch ${SOURCE_REPO}@${SOURCE_SHA.slice(0, 8)} CSVs ...`);

  const [provincesCsv, regenciesCsv, districtsCsv, villagesCsv] = await Promise.all([
    fetchCsv("provinces.csv"),
    fetchCsv("regencies.csv"),
    fetchCsv("districts.csv"),
    fetchCsv("villages.csv"),
  ]);

  // Drop header row, project to typed records.
  const provinces: ProvinceRow[] = provincesCsv.slice(1).map(([code, name]) => ({
    id: stripDots(code),
    name,
  }));

  const regencies: RegencyRow[] = regenciesCsv.slice(1).map(([code, provinceCode, name]) => ({
    id: stripDots(code),
    provinceId: stripDots(provinceCode),
    name,
    type: deriveRegencyType(name),
  }));

  const districts: DistrictRow[] = districtsCsv.slice(1).map(([code, regencyCode, name]) => ({
    id: stripDots(code),
    regencyId: stripDots(regencyCode),
    name,
  }));

  const villages: VillageRow[] = villagesCsv.slice(1).map(([code, districtCode, name]) => ({
    id: stripDots(code),
    districtId: stripDots(districtCode),
    name,
  }));

  // Validate fixed-width PK invariants.
  for (const p of provinces) if (p.id.length !== 2) throw new Error(`Province ${p.id} not 2 chars`);
  for (const r of regencies) if (r.id.length !== 4) throw new Error(`Regency ${r.id} not 4 chars`);
  for (const d of districts) if (d.id.length !== 6) throw new Error(`District ${d.id} not 6 chars`);
  for (const v of villages) if (v.id.length !== 10) throw new Error(`Village ${v.id} not 10 chars`);

  const kotaCount = regencies.filter((r) => r.type === "KOTA").length;
  const kabupatenCount = regencies.length - kotaCount;
  console.log(
    `✓ parsed: Province ${provinces.length}, Regency ${regencies.length} (${kotaCount} KOTA + ${kabupatenCount} KABUPATEN), District ${districts.length}, Village ${villages.length}`,
  );

  const today = new Date().toISOString().slice(0, 10);
  const header = `-- prisma/seed/01-regions.sql
-- Indonesian administrative regions reference data — Province / Regency / District / Village.
-- Source: ${SOURCE_REPO} ${SOURCE_VERSION} (commit ${SOURCE_SHA})
-- Extracted: ${today}
-- Counts: Province ${provinces.length} | Regency ${regencies.length} (${kotaCount} KOTA + ${kabupatenCount} KABUPATEN) | District ${districts.length} | Village ${villages.length}
-- Generator: scripts/generate-regions-sql.ts (regenerate via "npx tsx scripts/generate-regions-sql.ts")
-- BPS codes: dots stripped from source (idn-area-data uses 'PP.RR.DDDD' format).
-- Idempotent: ON CONFLICT (id) DO UPDATE refreshes name + (Regency only) type + updatedAt.
-- Wrapped in a single transaction.

BEGIN;

`;

  const provinceSql = emitInsertChunks(
    "Province",
    ["id", "name", "updatedAt"],
    provinces.map((p) => [`'${p.id}'`, `'${escapeSql(p.name)}'`, "NOW()"]),
    ["name"],
  );

  const regencySql = emitInsertChunks(
    "Regency",
    ["id", "provinceId", "name", "type", "updatedAt"],
    regencies.map((r) => [
      `'${r.id}'`,
      `'${r.provinceId}'`,
      `'${escapeSql(r.name)}'`,
      `'${r.type}'`,
      "NOW()",
    ]),
    ["name", "type"],
  );

  const districtSql = emitInsertChunks(
    "District",
    ["id", "regencyId", "name", "updatedAt"],
    districts.map((d) => [`'${d.id}'`, `'${d.regencyId}'`, `'${escapeSql(d.name)}'`, "NOW()"]),
    ["name"],
  );

  const villageSql = emitInsertChunks(
    "Village",
    ["id", "districtId", "name", "updatedAt"],
    villages.map((v) => [`'${v.id}'`, `'${v.districtId}'`, `'${escapeSql(v.name)}'`, "NOW()"]),
    ["name"],
  );

  const sql = [
    header,
    "-- ── Province ────────────────────────────────────────────────",
    provinceSql,
    "",
    "-- ── Regency ─────────────────────────────────────────────────",
    regencySql,
    "",
    "-- ── District ────────────────────────────────────────────────",
    districtSql,
    "",
    "-- ── Village ─────────────────────────────────────────────────",
    villageSql,
    "",
    "COMMIT;",
    "",
  ].join("\n");

  writeFileSync(OUTPUT, sql, "utf8");
  const sizeMb = (Buffer.byteLength(sql, "utf8") / 1024 / 1024).toFixed(2);
  console.log(`✓ wrote ${OUTPUT} (${sizeMb} MB)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
