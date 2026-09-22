import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  cpSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { it } from "node:test";
import { fileURLToPath, URL } from "node:url";

interface MigrationJournal {
  entries: { idx: number; tag: string; when: number }[];
}

function readJournal(directory: string): MigrationJournal {
  const contents = readFileSync(path.join(directory, "meta/_journal.json"), "utf8");
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- The tests below verify this checked-in Drizzle journal and its generated successor.
  return JSON.parse(contents) as MigrationJournal;
}

function readMigrationFiles(directory: string) {
  return readdirSync(directory, { recursive: true, encoding: "utf8" })
    .filter((name) => name.endsWith(".sql") || name.endsWith(".json"))
    .toSorted()
    .map((name) => [name, readFileSync(path.join(directory, name), "utf8")] as const);
}

void it("records every SQL migration in the generator journal in order", () => {
  const directory = fileURLToPath(new URL("../migrations/", import.meta.url));
  const { entries } = readJournal(directory);
  const filenames = readdirSync(directory)
    .filter((name) => name.endsWith(".sql"))
    .toSorted();
  assert.deepEqual(
    entries.map(({ tag }) => `${tag}.sql`),
    filenames,
  );
  let previousTimestamp = 0;
  for (const [index, entry] of entries.entries()) {
    assert.equal(entry.idx, index);
    assert.ok(entry.tag.startsWith(`${String(index).padStart(4, "0")}_`));
    assert.ok(Number.isSafeInteger(entry.when));
    assert.ok(entry.when > previousTimestamp);
    previousTimestamp = entry.when;
  }
});

void it("generates only a deliberate schema change after the existing migration history", (test) => {
  const directory = mkdtempSync(path.join(tmpdir(), "booze-migration-generation-"));
  test.after(() => {
    rmSync(directory, { recursive: true, force: true });
  });
  for (const name of ["drizzle.config.ts", "package.json", "src", "migrations"]) {
    cpSync(new URL(`../${name}`, import.meta.url), path.join(directory, name), { recursive: true });
  }
  symlinkSync(
    new URL("../node_modules", import.meta.url),
    path.join(directory, "node_modules"),
    "dir",
  );
  const migrations = path.join(directory, "migrations");
  const originalFiles = readMigrationFiles(migrations);
  const originalJournal = readJournal(migrations);
  const generate = () =>
    execFileSync("pnpm", ["exec", "drizzle-kit", "generate", "--name=generation_probe"], {
      cwd: directory,
      encoding: "utf8",
      timeout: 30_000,
    });

  // Drizzle Kit can report errors with exit status zero. Require its no-change
  // result as well as byte-for-byte preservation of the migration directory.
  assert.match(generate(), /No schema changes, nothing to migrate/u);
  assert.deepEqual(readMigrationFiles(migrations), originalFiles);

  const schemaPath = path.join(directory, "src/schema.ts");
  const schema = readFileSync(schemaPath, "utf8");
  const siteDeclaration = 'export const sites = sqliteTable("sites", {';
  assert.equal(schema.split(siteDeclaration).length, 2);
  writeFileSync(
    schemaPath,
    schema.replace(
      siteDeclaration,
      `${siteDeclaration}\n  generationProbe: text("generation_probe"),`,
    ),
  );
  generate();
  const nextIndex = originalJournal.entries.length;
  const nextTag = `${String(nextIndex).padStart(4, "0")}_generation_probe`;
  const generatedJournal = readJournal(migrations);
  assert.deepEqual(generatedJournal.entries.slice(0, -1), originalJournal.entries);
  assert.equal(generatedJournal.entries.length, nextIndex + 1);
  assert.equal(generatedJournal.entries.at(-1)?.idx, nextIndex);
  assert.equal(generatedJournal.entries.at(-1)?.tag, nextTag);
  const sql = readFileSync(path.join(migrations, `${nextTag}.sql`), "utf8");
  assert.equal(sql.trim(), "ALTER TABLE `sites` ADD `generation_probe` text;");
  for (const [name, content] of originalFiles) {
    if (name !== "meta/_journal.json") {
      assert.equal(readFileSync(path.join(migrations, name), "utf8"), content);
    }
  }

  const database = new DatabaseSync(":memory:");
  try {
    for (const { tag } of originalJournal.entries) {
      database.exec(readFileSync(path.join(migrations, `${tag}.sql`), "utf8"));
    }
    database.exec("INSERT INTO sites (id, name) VALUES ('existing-site', 'Home')");
    database.exec(sql);
    assert.deepEqual(
      { ...database.prepare("SELECT id, name, generation_probe FROM sites").get() },
      { id: "existing-site", name: "Home", generation_probe: null },
    );
  } finally {
    database.close();
  }

  const generatedFiles = readMigrationFiles(migrations);
  assert.match(generate(), /No schema changes, nothing to migrate/u);
  assert.deepEqual(readMigrationFiles(migrations), generatedFiles);
});
