// Compare SQLite's parsed schema, not CREATE TABLE text: ALTER TABLE migrations
// can produce different column and constraint ordering from a fresh export.
export const schemaQueries = {
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
