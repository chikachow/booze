/* oxlint-disable typescript/no-unsafe-assignment, typescript/no-unsafe-call, typescript/no-unsafe-member-access -- Node executes this script with its built-in test runner. */
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import { compareThemeArtifacts, themeArtifacts } from "./check-theme.mjs";

describe("compareThemeArtifacts", () => {
  for (const changedArtifact of themeArtifacts) {
    it(`detects independent drift in ${changedArtifact}`, () => {
      const root = mkdtempSync(path.join(tmpdir(), "booze-theme-test-"));
      const committed = path.join(root, "committed");
      const regenerated = path.join(root, "regenerated");
      mkdirSync(committed);
      mkdirSync(regenerated);
      try {
        for (const artifact of themeArtifacts) {
          writeFileSync(path.join(committed, artifact), "generated value\n");
          writeFileSync(
            path.join(regenerated, artifact),
            artifact === changedArtifact ? "changed value\n" : "generated value\n",
          );
        }

        assert.deepEqual(compareThemeArtifacts(committed, regenerated), [changedArtifact]);
      } finally {
        rmSync(root, { force: true, recursive: true });
      }
    });
  }

  it("ignores volatile generator header fields", () => {
    const root = mkdtempSync(path.join(tmpdir(), "booze-theme-test-"));
    const committed = path.join(root, "committed");
    const regenerated = path.join(root, "regenerated");
    mkdirSync(committed);
    mkdirSync(regenerated);
    try {
      for (const artifact of themeArtifacts) {
        writeFileSync(path.join(committed, artifact), "/*\n * Generated: yesterday\n */\nvalue\n");
        writeFileSync(path.join(regenerated, artifact), "/*\n * Generated: today\n */\nvalue\n");
      }

      assert.deepEqual(compareThemeArtifacts(committed, regenerated), []);
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });
});
