import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { env } from "node:process";
import { DatabaseSync } from "node:sqlite";
import { it } from "node:test";
import { fileURLToPath, URL } from "node:url";
import { z } from "zod";

// oxlint-disable-next-line import/max-dependencies -- This integration test coordinates Node fixtures, Wrangler, and schema validation.
import { schemaQueries } from "../../../packages/db/src/schema-test-support.ts";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const migrationPath = "packages/db/migrations/";
const cli = fileURLToPath(new URL("../node_modules/wrangler/bin/wrangler.js", import.meta.url));

type MigrationFiles = Readonly<Record<string, string>>;

function preserveHistory(base: MigrationFiles, candidate: MigrationFiles) {
  for (const [name, sql] of Object.entries(base)) {
    assert.equal(
      candidate[name],
      sql,
      `Previously accepted migration changed or disappeared: ${name}`,
    );
  }
}

// Use Wrangler itself: its pending-file ordering, ledger, and D1 transactions
// are independent of Drizzle's snapshot checker and node:sqlite's defaults.
function verifyUpgrade(
  base: MigrationFiles,
  candidate: MigrationFiles,
  {
    seed = "",
    retainedRows = "",
    expectedFailure,
  }: {
    readonly seed?: string;
    readonly retainedRows?: string;
    readonly expectedFailure?: RegExp;
  } = {},
) {
  preserveHistory(base, candidate);
  const directory = mkdtempSync(path.join(tmpdir(), "booze-d1-upgrade-"));
  const database = "migration-test";
  try {
    for (const [layout, files] of Object.entries({ base, candidate })) {
      const folder = path.join(directory, layout);
      mkdirSync(folder);
      for (const [name, sql] of Object.entries(files)) {
        const filename = path.join(folder, "migrations", name);
        mkdirSync(path.dirname(filename), { recursive: true });
        writeFileSync(filename, sql);
      }
      writeFileSync(
        path.join(folder, "wrangler.json"),
        JSON.stringify({
          name: database,
          compatibility_date: "2026-09-22",
          d1_databases: [
            {
              binding: "DB",
              database_name: database,
              database_id: "00000000-0000-0000-0000-000000000001",
              migrations_dir: "migrations",
              migrations_pattern: "migrations/**/*.sql",
            },
          ],
        }),
      );
    }
    const run = (layout: string, state: string, args: readonly string[]) => {
      const result = spawnSync(
        "node",
        [
          cli,
          "d1",
          ...args,
          "--local",
          "--persist-to",
          path.join(directory, state),
          "--config",
          path.join(directory, layout, "wrangler.json"),
        ],
        {
          cwd: path.join(directory, layout),
          encoding: "utf8",
          timeout: 60_000,
          env: {
            ...env,
            CI: "true",
            WRANGLER_SEND_METRICS: "false",
            WRANGLER_WRITE_LOGS: "false",
          },
        },
      );
      assert.equal(
        result.status,
        0,
        `${layout}/${state}: ${result.error ?? ""}\n${result.stdout}\n${result.stderr}`,
      );
      return result.stdout;
    };
    const query = (layout: string, state: string, sql: string) => {
      return z
        .array(
          z.object({
            results: z.array(z.record(z.string(), z.union([z.string(), z.number(), z.null()]))),
          }),
        )
        .parse(JSON.parse(run(layout, state, ["execute", database, "--command", sql, "--json"])))
        .map((statement) => statement.results);
    };
    const apply = (layout: string, state: string) =>
      run(layout, state, ["migrations", "apply", database]);
    const ledger = "SELECT id, name, applied_at FROM d1_migrations ORDER BY id";
    apply("base", "existing");
    if (seed !== "") query("base", "existing", seed);
    const [beforeLedger = []] = query("base", "existing", ledger);
    assert.equal(beforeLedger.length, Object.keys(base).length);
    const beforeRows = retainedRows === "" ? [] : query("base", "existing", retainedRows);
    if (expectedFailure !== undefined) {
      const schema = "SELECT type, name, sql FROM sqlite_schema ORDER BY type, name";
      const beforeSchema = query("base", "existing", schema);
      assert.throws(() => {
        apply("candidate", "existing");
      }, expectedFailure);
      assert.deepEqual(query("candidate", "existing", ledger), [beforeLedger]);
      assert.deepEqual(query("candidate", "existing", schema), beforeSchema);
      if (retainedRows !== "") {
        assert.deepEqual(query("candidate", "existing", retainedRows), beforeRows);
      }
      assert.deepEqual(query("candidate", "existing", "PRAGMA foreign_key_check"), [[]]);
      return;
    }
    apply("candidate", "existing");
    const [afterLedger = []] = query("candidate", "existing", ledger);
    assert.deepEqual(afterLedger.slice(0, beforeLedger.length), beforeLedger);
    assert.deepEqual(
      afterLedger.map((row) => z.string().parse(row["name"])).toSorted(),
      Object.keys(candidate).toSorted(),
    );
    if (retainedRows !== "")
      assert.deepEqual(query("candidate", "existing", retainedRows), beforeRows);
    assert.deepEqual(query("candidate", "existing", "PRAGMA foreign_key_check"), [[]]);
    assert.match(apply("candidate", "existing"), /No migrations to apply/u);

    apply("candidate", "fresh");
    const inspect = (state: string) => {
      // D1 restricts some table-valued PRAGMAs. Parse its actual DDL in SQLite
      // to use the same column-order-insensitive oracle as the export test.
      const [definitions = []] = query(
        "candidate",
        state,
        `SELECT sql FROM sqlite_schema
        WHERE sql IS NOT NULL AND name NOT GLOB 'sqlite_*' AND name NOT GLOB '_cf_*'
          AND name != 'd1_migrations'
        ORDER BY CASE type WHEN 'table' THEN 0 WHEN 'index' THEN 1 ELSE 2 END, name`,
      );
      const parsed = new DatabaseSync(":memory:");
      try {
        for (const { sql } of definitions) {
          assert.equal(typeof sql, "string");
          parsed.exec(z.string().parse(sql));
        }
        return Object.fromEntries(
          Object.entries(schemaQueries).map(([name, sql]) => [name, parsed.prepare(sql).all()]),
        );
      } finally {
        parsed.close();
      }
    };
    assert.deepEqual(
      inspect("existing"),
      inspect("fresh"),
      "Upgrade from the target branch must reach the same schema as a fresh database",
    );
    const [freshLedger = []] = query("candidate", "fresh", ledger);
    assert.deepEqual(
      freshLedger.map((row) => z.string().parse(row["name"])).toSorted(),
      Object.keys(candidate).toSorted(),
    );
    assert.deepEqual(query("candidate", "fresh", "PRAGMA foreign_key_check"), [[]]);
    assert.match(apply("candidate", "fresh"), /No migrations to apply/u);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

void it("upgrades the accepted target history on populated local D1 without replaying old migrations", () => {
  // CI supplies the PR target SHA or previous main SHA, never the merge base.
  // Local runs use the fetched origin/main; fetch it before validating a PR.
  const ref = env["BOOZE_MIGRATION_BASE"] ?? "origin/main";
  const git = (...args: readonly string[]) =>
    execFileSync("git", args, { cwd: root, encoding: "utf8" });
  const sha = git("rev-parse", "--verify", "--end-of-options", `${ref}^{commit}`).trim();
  const names = git("ls-tree", "-r", "--name-only", "-z", sha, "--", migrationPath)
    .split("\0")
    .filter((name) => name.endsWith(".sql"));
  assert.ok(names.length > 0, `No migration history at target ${sha}`);
  const base = Object.fromEntries(
    names.map((name) => [name.slice(migrationPath.length), git("show", `${sha}:${name}`)]),
  );
  const folder = path.join(root, migrationPath);
  const candidate = Object.fromEntries(
    readdirSync(folder, { recursive: true, encoding: "utf8" })
      .filter((name) => name.endsWith(".sql"))
      .map((name) => [name, readFileSync(path.join(folder, name), "utf8")]),
  );
  verifyUpgrade(base, candidate, {
    seed: `INSERT INTO users (id, clerk_user_id) VALUES ('migration-user', 'migration-clerk');
      INSERT INTO sites (id, name) VALUES ('migration-site', 'Migration fixture');
      INSERT INTO site_memberships (site_id, user_id, role) VALUES ('migration-site', 'migration-user', 'owner');`,
    retainedRows: `SELECT id, clerk_user_id FROM users ORDER BY id;
      SELECT id, name FROM sites ORDER BY id;
      SELECT site_id, user_id, role FROM site_memberships ORDER BY site_id, user_id;`,
  });
});

void it("rejects removed, renamed, and edited accepted migrations", () => {
  const base = { "0000.sql": "CREATE TABLE sites (id TEXT);" };
  for (const candidate of [{}, { "renamed.sql": base["0000.sql"] }, { "0000.sql": "SELECT 1;" }]) {
    assert.throws(() => {
      preserveHistory(base, candidate);
    }, /Previously accepted migration/u);
  }
});

void it("accepts independent additions arriving in a different order than fresh replay", () => {
  const base = {
    "0000.sql": "CREATE TABLE sites (id TEXT PRIMARY KEY NOT NULL);",
    "20260101000003_b/migration.sql": "ALTER TABLE sites ADD b text;",
  };
  verifyUpgrade(base, {
    ...base,
    "20260101000002_a/migration.sql": "ALTER TABLE sites ADD a text;",
  });
});

void it("rejects the generated-chain conflict missed by RC4's snapshot checker", () => {
  const base = {
    "0000.sql": "CREATE TABLE sites (id TEXT PRIMARY KEY NOT NULL);",
    "20260101000003_b/migration.sql": "ALTER TABLE sites ADD flag text;",
  };
  verifyUpgrade(
    base,
    {
      ...base,
      "20260101000001_a1/migration.sql": "ALTER TABLE sites ADD flag text;",
      "20260101000002_a2/migration.sql": "ALTER TABLE sites DROP COLUMN flag;",
    },
    { expectedFailure: /duplicate column name: flag/u },
  );
});

const referencedSite = {
  "0000.sql": `CREATE TABLE sites (id TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL);
    CREATE TABLE memberships (site_id TEXT NOT NULL REFERENCES sites(id));`,
};
const siteFixture = {
  seed: "INSERT INTO sites VALUES ('site', 'Home'); INSERT INTO memberships VALUES ('site');",
  retainedRows: "SELECT * FROM sites ORDER BY id; SELECT * FROM memberships ORDER BY site_id;",
};
function rebuildSite(idExpression: string) {
  return `PRAGMA defer_foreign_keys=ON;
    CREATE TABLE __new_sites (id TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL DEFAULT 'Home');
    INSERT INTO __new_sites SELECT ${idExpression}, name FROM sites;
    DROP TABLE sites;
    ALTER TABLE __new_sites RENAME TO sites;
    CREATE TABLE __sites_default_fk_guard (violations INTEGER CHECK (violations = 0));
    INSERT INTO __sites_default_fk_guard SELECT count(*) FROM pragma_foreign_key_check;
    DROP TABLE __sites_default_fk_guard;
    PRAGMA defer_foreign_keys=OFF;`;
}

void it("preserves referenced rows during a D1 rebuild with explicit FK validation", () => {
  verifyUpgrade(
    referencedSite,
    {
      ...referencedSite,
      "20260101000001_rebuild/migration.sql": rebuildSite("id"),
    },
    siteFixture,
  );
});

void it("fails a corrupt rebuild inside D1 rather than committing dangling references", () => {
  verifyUpgrade(
    referencedSite,
    {
      ...referencedSite,
      "20260101000001_rebuild/migration.sql": rebuildSite("id || '-corrupted'"),
    },
    { ...siteFixture, expectedFailure: /CHECK constraint failed/u },
  );
});
