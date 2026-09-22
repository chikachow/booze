import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { cpSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { it } from "node:test";
import { fileURLToPath, URL } from "node:url";

void it("accepts the migration graph and generates no changes from the committed schema", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "booze-migration-check-"));
  const migrations = path.join(directory, "migrations");
  const cli = fileURLToPath(new URL("../node_modules/drizzle-kit/bin.cjs", import.meta.url));
  try {
    cpSync(new URL("../migrations/", import.meta.url), migrations, { recursive: true });
    const files = readdirSync(migrations, { recursive: true, encoding: "utf8" })
      .filter((name) => name.endsWith(".sql") || name.endsWith(".json"))
      .toSorted();
    const before = files.map((name) => readFileSync(path.join(migrations, name), "utf8"));
    const options = { encoding: "utf8", timeout: 30_000 } as const;
    execFileSync("node", [cli, "check", "--dialect=sqlite", `--out=${migrations}`], options);
    const output = execFileSync(
      "node",
      [
        cli,
        "generate",
        "--dialect=sqlite",
        `--schema=${fileURLToPath(new URL("schema.ts", import.meta.url))}`,
        `--out=${migrations}`,
        "--name=consistency_check",
      ],
      options,
    );
    assert.deepEqual(
      readdirSync(migrations, { recursive: true, encoding: "utf8" })
        .filter((name) => name.endsWith(".sql") || name.endsWith(".json"))
        .toSorted(),
      files,
      `The schema requires an uncommitted migration:\n${output}`,
    );
    assert.deepEqual(
      files.map((name) => readFileSync(path.join(migrations, name), "utf8")),
      before,
      "Generation must not rewrite migration history",
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
