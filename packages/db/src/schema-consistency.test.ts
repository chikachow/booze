import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { it } from "node:test";
import { URL } from "node:url";

// Compare SQLite's parsed schema, not CREATE TABLE text: ALTER TABLE migrations
// can produce different column and constraint ordering from a fresh export.
const schemaQueries = {
  tables: `
    SELECT name, type, ncol, wr, strict FROM pragma_table_list
    WHERE schema = 'main' AND name NOT GLOB 'sqlite_*' ORDER BY name
  `,
  columns: `
    SELECT s.name AS table_name, c.name, c.type, c."notnull", c.dflt_value, c.pk, c.hidden
    FROM sqlite_schema s, pragma_table_xinfo(s.name) c
    WHERE s.type = 'table' AND s.name NOT GLOB 'sqlite_*'
    ORDER BY s.name, c.name
  `,
  foreignKeys: `
    SELECT s.name AS table_name, f."table" AS target_table, f.on_update, f.on_delete, f.match,
      (SELECT json_group_array(json_array(part."from", part."to") ORDER BY part.seq)
       FROM pragma_foreign_key_list(s.name) part WHERE part.id = f.id) AS columns
    FROM sqlite_schema s, pragma_foreign_key_list(s.name) f
    WHERE s.type = 'table' AND f.seq = 0
    ORDER BY table_name, target_table, columns, on_update, on_delete, match
  `,
  indexes: `
    SELECT s.name AS table_name,
      CASE WHEN i.origin = 'c' THEN i.name ELSE i.origin END AS name,
      i."unique", i.origin, i.partial,
      (SELECT json_group_array(json_array(part.name, part.desc, part.coll) ORDER BY part.seqno)
       FROM pragma_index_xinfo(i.name) part WHERE part.key = 1) AS columns,
      CASE WHEN i.partial = 1 OR EXISTS (
        SELECT 1 FROM pragma_index_xinfo(i.name) part WHERE part.cid = -2
      ) THEN (SELECT sql FROM sqlite_schema WHERE name = i.name) END AS extra_definition
    FROM sqlite_schema s, pragma_index_list(s.name) i
    WHERE s.type = 'table' AND s.name NOT GLOB 'sqlite_*'
    ORDER BY table_name, name, columns
  `,
  // PRAGMAs omit CHECK expressions, declared column collations, generated
  // expressions, conflict policies, deferrability, and AUTOINCREMENT. Compare
  // their complete definitions instead; equivalent formatting may need handling
  // when the schema first adopts one of these features.
  otherDefinitions: `
    SELECT type, name, sql FROM sqlite_schema
    WHERE type IN ('view', 'trigger') OR (type = 'table' AND (
      upper(sql) LIKE '%CHECK%' OR upper(sql) LIKE '%COLLATE%'
      OR upper(sql) LIKE '%GENERATED%' OR upper(sql) LIKE '%AUTOINCREMENT%'
      OR upper(sql) LIKE '%CONFLICT%' OR upper(sql) LIKE '%DEFERRABLE%'
      OR upper(sql) LIKE '%VIRTUAL%'
      OR EXISTS (SELECT 1 FROM pragma_table_xinfo(sqlite_schema.name) WHERE hidden IN (2, 3))
    )) ORDER BY type, name
  `,
};

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
    for (const filename of readdirSync(directory)
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
