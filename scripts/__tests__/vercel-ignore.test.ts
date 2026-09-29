import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import path from "node:path";

const SCRIPT = path.resolve(__dirname, "../vercel-ignore.sh");

function exitCodeFor(ref: string | undefined): number | null {
  const env = { ...process.env };
  delete env.VERCEL_GIT_COMMIT_REF;
  if (ref !== undefined) env.VERCEL_GIT_COMMIT_REF = ref;
  return spawnSync("bash", [SCRIPT], { env, encoding: "utf8" }).status;
}

// Vercel ignoreCommand contract: exit 1 = build, exit 0 = skip.
describe("vercel-ignore.sh", () => {
  it.each(["staging", "main"])("builds the %s branch", (ref) => {
    expect(exitCodeFor(ref)).toBe(1);
  });

  it.each([
    "feat/some-cycle",
    "claude/vercel-staging-only",
    "dependabot/npm_and_yarn/next-16.4.0",
    "staging-hotfix",
    "mainline",
  ])("skips the %s branch", (ref) => {
    expect(exitCodeFor(ref)).toBe(0);
  });

  it("skips when the branch is unknown", () => {
    expect(exitCodeFor(undefined)).toBe(0);
  });
});
