#!/usr/bin/env tsx
//
// scaffold-check — static structural validator for the entity registry per
// spec §18.7. Reads entity source files as TEXT (regex / string scan) — never
// `require()` or `import()` them — so that side-effecting modules cannot hang
// or pollute CI. Mirrors the verify-pii-annotations.sh precedent.
//
// Validations per entity dir under `lib/entities/<name>/` (excluding
// `__fixtures__/`):
//   1. `schema.ts`, `entity.ts`, `policy.ts` files exist.
//   2. Each declares the named exports the scaffold consumes:
//        - schema.ts → `export const schema = …` (Zod schema)
//        - entity.ts → `export const entity = …` (EntityDef<T>)
//        - policy.ts → `export const policy = …` (per-resource permission map)
//   3. Every `kind: 'X'` literal in entity.ts source matches a key in the
//      runtime `FIELD_KINDS` tuple from `lib/scaffold/field-renderer.ts`.
//   4. Every scope literal in policy.ts source matches a `PermissionScope`
//      enum member from `prisma/schema.prisma`.
//
// Exit 0 on greenfield (zero entities) or fixture-only. Exit 1 with a
// descriptive error on the first violation.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const REPO_ROOT = resolve(__dirname, "..");
const ENTITIES_DIR = resolve(REPO_ROOT, "lib", "entities");
const FIELD_RENDERER_FILE = resolve(REPO_ROOT, "lib", "scaffold", "field-renderer.ts");
const SCHEMA_PRISMA = resolve(REPO_ROOT, "prisma", "schema.prisma");

const REQUIRED_FILES = ["schema.ts", "entity.ts", "policy.ts"] as const;
const REQUIRED_EXPORTS: Record<(typeof REQUIRED_FILES)[number], string> = {
  "schema.ts": "schema",
  "entity.ts": "entity",
  "policy.ts": "policy",
};

function fail(msg: string): never {
  process.stderr.write(`scaffold-check: ${msg}\n`);
  process.exit(1);
}

function readOptional(path: string): string | null {
  try {
    return readFileSync(path, "utf8");
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw e;
  }
}

function listEntityDirs(): string[] {
  let entries: string[];
  try {
    entries = readdirSync(ENTITIES_DIR);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw e;
  }
  const dirs: string[] = [];
  for (const name of entries) {
    if (name.startsWith("_")) continue; // skips __fixtures__
    if (name.startsWith(".")) continue;
    const full = join(ENTITIES_DIR, name);
    if (statSync(full).isDirectory()) dirs.push(full);
  }
  return dirs;
}

function loadFieldKinds(): Set<string> {
  const src = readOptional(FIELD_RENDERER_FILE);
  if (!src) fail(`could not read ${FIELD_RENDERER_FILE} — has the scaffold engine moved?`);
  // Match the exact tuple block: `export const FIELD_KINDS = [ … ] as const`.
  const match = src.match(/export const FIELD_KINDS\s*=\s*\[([\s\S]*?)\]\s*as const/);
  if (!match) fail("could not find FIELD_KINDS tuple in field-renderer.ts");
  const kinds = [...match[1].matchAll(/"([A-Z_]+)"/g)].map((m) => m[1]);
  if (kinds.length === 0) fail("FIELD_KINDS tuple is empty");
  return new Set(kinds);
}

function loadPermissionScopes(): Set<string> {
  const src = readOptional(SCHEMA_PRISMA);
  if (!src) fail(`could not read ${SCHEMA_PRISMA}`);
  const block = src.match(/enum PermissionScope\s*{([\s\S]*?)}/);
  if (!block) fail("could not find PermissionScope enum in prisma/schema.prisma");
  const scopes = block[1]
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("//"));
  if (scopes.length === 0) fail("PermissionScope enum is empty");
  return new Set(scopes);
}

function checkExport(src: string, name: string): boolean {
  // Match `export const name`, `export const name =`, `export { name }`,
  // `export default exampleEntity` patterns.
  const patterns = [
    new RegExp(`export\\s+const\\s+${name}\\b`),
    new RegExp(`export\\s*\\{[^}]*\\b${name}\\b[^}]*\\}`),
    new RegExp(`export\\s+default\\s+${name}\\b`),
  ];
  return patterns.some((p) => p.test(src));
}

// Strip `// line` and `/* block */` comments so the kind/scope extractors
// do not match literals quoted in JSDoc or planning notes (e.g. a comment
// like "// TODO: add kind: 'MEDIA'" must not fail the gate).
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*/g, "");
}

function extractKindLiterals(src: string): Set<string> {
  // Match `kind: "FOO"` or `kind: 'FOO'`.
  const matches = stripComments(src).matchAll(/kind:\s*["']([A-Z_]+)["']/g);
  return new Set([...matches].map((m) => m[1]));
}

function extractScopeLiterals(src: string): Set<string> {
  // Match `scope: "FOO"` or `scope: 'FOO'`.
  const matches = stripComments(src).matchAll(/scope:\s*["']([A-Z_]+)["']/g);
  return new Set([...matches].map((m) => m[1]));
}

function main(): void {
  const entityDirs = listEntityDirs();
  if (entityDirs.length === 0) {
    process.stdout.write("scaffold-check: no entities registered yet (greenfield) — OK.\n");
    return;
  }
  const fieldKinds = loadFieldKinds();
  const scopes = loadPermissionScopes();

  for (const dir of entityDirs) {
    const entityName = dir.split("/").pop()!;
    for (const file of REQUIRED_FILES) {
      const path = join(dir, file);
      const src = readOptional(path);
      if (!src) fail(`${entityName}: missing required file ${file}`);
      const expected = REQUIRED_EXPORTS[file];
      if (!checkExport(src, expected)) {
        fail(`${entityName}/${file}: missing required export \`${expected}\``);
      }
      if (file === "entity.ts") {
        const usedKinds = extractKindLiterals(src);
        for (const k of usedKinds) {
          if (!fieldKinds.has(k)) {
            fail(`${entityName}/entity.ts: references unknown FieldDef kind "${k}". Known kinds: ${[...fieldKinds].sort().join(", ")}`);
          }
        }
      }
      if (file === "policy.ts") {
        const usedScopes = extractScopeLiterals(src);
        for (const s of usedScopes) {
          if (!scopes.has(s)) {
            fail(`${entityName}/policy.ts: references unknown PermissionScope "${s}". Known scopes: ${[...scopes].sort().join(", ")}`);
          }
        }
      }
    }
    process.stdout.write(`scaffold-check: ${entityName} OK.\n`);
  }
  process.stdout.write(`scaffold-check: ${entityDirs.length} entit${entityDirs.length === 1 ? "y" : "ies"} validated.\n`);
}

main();
