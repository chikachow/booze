import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { it } from "node:test";
import { URL } from "node:url";

import { schemaQueries } from "./schema-test-support.ts";

void it("keeps the exported Drizzle schema consistent with the SQL migration history", () => {
  const exported = new DatabaseSync(":memory:");
  const migrated = new DatabaseSync(":memory:");
  try {
    exported.exec(
      execFileSync("pnpm", ["exec", "drizzle-kit", "export"], {
        cwd: new URL("../", import.meta.url),
        encoding: "utf8",
      }),
    );
    const directory = new URL("../migrations/", import.meta.url);
    for (const filename of readdirSync(directory, { recursive: true, encoding: "utf8" })
      .filter((name) => name.endsWith(".sql"))
      .toSorted()) {
      migrated.exec(readFileSync(new URL(filename, directory), "utf8"));
    }
    for (const [component, query] of Object.entries(schemaQueries)) {
      assert.deepEqual(
        exported.prepare(query).all(),
        migrated.prepare(query).all(),
        `Drizzle export and SQL migrations differ in ${component}`,
      );
    }
  } finally {
    exported.close();
    migrated.close();
  }
});

void it("ignores column order and foreign-key numbering while preserving composite keys", () => {
  const original = new DatabaseSync(":memory:");
  const reordered = new DatabaseSync(":memory:");
  try {
    const parent = "CREATE TABLE parent (id TEXT PRIMARY KEY, site TEXT, UNIQUE (id, site));";
    original.exec(`${parent}
      CREATE TABLE child (id TEXT, site TEXT, owner TEXT,
        FOREIGN KEY (id, site) REFERENCES parent(id, site),
        FOREIGN KEY (owner) REFERENCES parent(id));
    `);
    reordered.exec(`${parent}
      CREATE TABLE child (owner TEXT, site TEXT, id TEXT,
        FOREIGN KEY (owner) REFERENCES parent(id),
        FOREIGN KEY (id, site) REFERENCES parent(id, site));
    `);
    for (const query of Object.values(schemaQueries)) {
      assert.deepEqual(original.prepare(query).all(), reordered.prepare(query).all());
    }

    // Identical individual column pairs must still differ if one composite
    // relationship has been replaced with separate foreign keys.
    reordered.exec(`DROP TABLE child;
      CREATE TABLE child (id TEXT, site TEXT, owner TEXT,
        FOREIGN KEY (id) REFERENCES parent(id),
        FOREIGN KEY (site) REFERENCES parent(site),
        FOREIGN KEY (owner) REFERENCES parent(id));
    `);
    assert.notDeepEqual(
      original.prepare(schemaQueries.foreignKeys).all(),
      reordered.prepare(schemaQueries.foreignKeys).all(),
    );
  } finally {
    original.close();
    reordered.close();
  }
});

for (const { name, before, after, component } of [
  {
    name: "includes user tables whose names resemble SQLite internal tables",
    before: "",
    after: "CREATE TABLE sqlitex_example (id INTEGER)",
    component: "tables",
  },
  {
    name: "detects generated-column expression changes without the GENERATED keyword",
    before: "CREATE TABLE example (id INTEGER, calculated INTEGER AS (id + 1))",
    after: "CREATE TABLE example (id INTEGER, calculated INTEGER AS (id + 2))",
    component: "otherDefinitions",
  },
] as const) {
  void it(name, () => {
    const original = new DatabaseSync(":memory:");
    const changed = new DatabaseSync(":memory:");
    try {
      original.exec(before);
      changed.exec(after);
      const query = schemaQueries[component];
      assert.notDeepEqual(original.prepare(query).all(), changed.prepare(query).all());
    } finally {
      original.close();
      changed.close();
    }
  });
}
