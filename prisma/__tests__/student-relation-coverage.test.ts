import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Student relation coverage — every `studentId` column must declare a FK.
 *
 * `StudentJournalEntry.studentId` and `StudentJournalNote.studentId` shipped
 * with no `@relation` to `Student`. Prisma is happy to treat such a field as a
 * plain string, so `npx prisma validate` stays green and no foreign key is
 * emitted. Deleting a Student then left the journal rows behind as silent
 * orphans — 7,560 entries + 50 notes were found stranded on staging during the
 * 2026-07-29 data cleanup, and had to be removed with a hand-written DELETE.
 *
 * This test parses schema.prisma and asserts that every model carrying a
 * `studentId` scalar also declares a relation binding it to `Student`. The
 * referential action is deliberately NOT asserted — the codebase uses Cascade
 * (owned child rows), SetNull (Admission, EnrollmentApplication) and Restrict
 * (Invoice, StudentAssessment) intentionally. The invariant under test is that
 * a FK exists at all, not which action it uses.
 */

const SCHEMA = readFileSync(
  join(__dirname, "..", "schema.prisma"),
  "utf-8"
);

type Model = { name: string; body: string };

function parseModels(schema: string): Model[] {
  const models: Model[] = [];
  // Models are top-level `model Name {` ... `}` blocks; the closing brace of a
  // model is the only `}` at column 0 inside the block, so a line-wise scan is
  // sufficient and avoids pulling in a Prisma parser dependency.
  const lines = schema.split("\n");
  let current: { name: string; lines: string[] } | null = null;
  for (const line of lines) {
    const open = /^model\s+(\w+)\s*\{/.exec(line);
    if (open) {
      current = { name: open[1], lines: [] };
      continue;
    }
    if (current) {
      if (/^\}/.test(line)) {
        models.push({ name: current.name, body: current.lines.join("\n") });
        current = null;
      } else {
        current.lines.push(line);
      }
    }
  }
  return models;
}

const models = parseModels(SCHEMA);

// Guard the parser itself — a silent parse failure would make every
// assertion below vacuously pass.
describe("schema parser", () => {
  it("finds the known models", () => {
    const names = models.map((m) => m.name);
    expect(names).toContain("Student");
    expect(names).toContain("StudentJournalEntry");
    expect(names).toContain("StudentJournalNote");
    expect(models.length).toBeGreaterThan(40);
  });
});

describe("every studentId column has a Student foreign key", () => {
  const withStudentId = models.filter((m) =>
    /^\s*studentId\s+String/m.test(m.body)
  );

  it("finds the models that carry a studentId scalar", () => {
    // Sanity floor: if this drops to near-zero the regex has drifted and the
    // per-model assertions below would stop testing anything.
    expect(withStudentId.length).toBeGreaterThanOrEqual(10);
  });

  it.each(withStudentId.map((m) => m.name))(
    "%s declares a relation on studentId",
    (modelName) => {
      const model = models.find((m) => m.name === modelName)!;
      const hasRelation =
        /@relation\([^)]*fields:\s*\[\s*studentId\s*\]/.test(model.body);

      expect(
        hasRelation,
        `${modelName}.studentId has no @relation to Student. Without it Prisma ` +
          `emits no foreign key and deleting a Student silently orphans these ` +
          `rows. Add: student Student @relation(fields: [studentId], ` +
          `references: [id], onDelete: <Cascade|SetNull|Restrict>)`
      ).toBe(true);
    }
  );
});
