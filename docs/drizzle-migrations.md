# Drizzle migrations on D1

Booze uses Drizzle ORM and Kit **1.0.0-rc.4** for schema definitions, SQL export, and migration generation. Wrangler applies migrations and owns the `d1_migrations` ledger. The v1 snapshot graph allows compatible editor branches to coexist without a shared journal. It is still a release candidate: graph checking, SQL replay, and migration review serve different purposes. [Drizzle v1 guide](https://orm.drizzle.team/docs/upgrade-v1).

## Authoring and parallel changes

Edit `packages/db/src/schema.ts`, then generate and review the SQL and snapshot together:

```sh
pnpm --filter @chikachow/booze-db exec drizzle-kit generate --name=describe_change
pnpm --filter @chikachow/booze-db exec drizzle-kit check
pnpm --filter @chikachow/booze-db test
```

Commit the complete generated folder. Independent branches may each add a migration without editing a shared file. Merge their TypeScript schema changes normally, retain both migration folders, and run the checks against the combined result. A matching combined schema generates nothing; the next real change records both open leaves as parents. Contradictory schema edits require rebasing and regenerating only the unmerged, undeployed branch migrations. Preserve custom data SQL explicitly when regenerating. Never rewrite already accepted migrations or choose one snapshot to hide a conflict.

Before validating a PR locally, fetch current `origin/main`. `pnpm check` then tests migration upgrade from that reference. To pin an exact accepted target commit:

```sh
BOOZE_MIGRATION_BASE=<target-commit-sha> pnpm --filter @chikachow/booze-web test
```

CI supplies the PR's target-branch SHA, or the previous main SHA for a push, and checks out full Git history. The required `ci` status must require an up-to-date branch; the infrastructure repository manages `booze_ruleset_ci.strict_required_status_checks_policy`. Use the latest target HEAD, not an older merge base. This prevents a previously green result from authorizing a merge after another schema change lands.

Wrangler orders pending filenames rather than snapshot dependencies. Keep dependent folder names ordered after their parents, including every parent of a merge migration. Timestamp prefixes do not eliminate clock skew or same-second naming mistakes. Review the pending order before deployment. [Wrangler implementation](https://github.com/cloudflare/workers-sdk/blob/wrangler%404.135.0/packages/wrangler/src/d1/migrations/helpers.ts).

## What the checks establish

- The database tests compare Drizzle export with every SQL migration replayed into SQLite, including nullability, keys, indexes, and other schema features. They also check the snapshot graph and require no-change generation to leave a temporary copy unchanged.
- The application migration test applies the accepted target's SQL to disposable **local D1**, seeds a user, site, and membership, then applies the candidate. It rejects changed/missing accepted SQL, checks preserved ledger records and fixture rows, checks foreign keys, and compares the resulting schema with a fresh D1 database. A second application must be a no-op.
- Regression fixtures exercise independent additions arriving out of filename order, RC4's missed generated-chain conflict, and valid and deliberately corrupted D1 table rebuilds.

These are complementary checks, not a proof for every production row or custom SQL effect. Add representative fixtures and expected transformations when changing data, constraints, or referenced tables. Preserve relevant row identities/counts, especially with CASCADE or SET NULL actions. The built-in upgrade fixture covers user/site/membership retention; it does not populate the entire catalogue. Test against an appropriate private backup before a data-changing production release; see [deployment and recovery](deployment.md).

### Why SQL upgrade replay is required

RC4's checker compares a common ancestor with branch leaves. Intermediate operations can cancel in schema state while still conflicting during execution. The following independently generated histories passed `check` and no-change generation in a minimal SQLite reproduction:

```sql
-- Branch A, first migration:
ALTER TABLE sites ADD flag text;
-- Branch A, second migration:
ALTER TABLE sites DROP COLUMN flag;
-- Branch B, independently from the same baseline:
ALTER TABLE sites ADD flag text;
```

Fresh replay A1, A2, B succeeds; upgrading a database that already received B fails at A1 with a duplicate column. The local D1 regression test exercises that deployment order. Custom UPDATE/INSERT/DELETE effects are also absent from schema snapshots, so their commutativity requires explicit data review. [Pinned conflict engine](https://github.com/drizzle-team/drizzle-orm/blob/748058e837d9c4247330e3d45580cbdae52bffda/drizzle-kit/src/commutativity/engine.ts), [custom migration generation](https://github.com/drizzle-team/drizzle-orm/blob/748058e837d9c4247330e3d45580cbdae52bffda/drizzle-kit/src/cli/commands/generate-common.ts).

## D1 table rebuilds

RC4 generates `PRAGMA foreign_keys=OFF/ON` for SQLite rebuilds, even with `--driver=d1-http`. D1 runs migrations inside transactions and cannot disable enforcement this way. A generated `sites` rebuild failed on local D1 when a membership referenced the site. There is no generator setting that fixes this; review each rebuild's SQL rather than applying an automatic rewrite. [Pinned converter](https://github.com/drizzle-team/drizzle-orm/blob/748058e837d9c4247330e3d45580cbdae52bffda/drizzle-kit/src/dialects/sqlite/convertor.ts#L197-L226), [D1 foreign-key handling](https://developers.cloudflare.com/d1/sql-api/foreign-keys/).

For a reviewed rebuild that preserves its related records, the tested pattern is deferral plus an assertion that fails the migration if any foreign-key violations remain:

```sql
PRAGMA defer_foreign_keys=ON;

-- Reviewed CREATE replacement / INSERT copy / DROP old / RENAME replacement.
-- Preserve dependent rows, required columns, constraints, and indexes.

CREATE TABLE __specific_migration_fk_guard (
  violations INTEGER CHECK (violations = 0)
);
INSERT INTO __specific_migration_fk_guard
  SELECT count(*) FROM pragma_foreign_key_check;
DROP TABLE __specific_migration_fk_guard;

PRAGMA defer_foreign_keys=OFF;
```

Use a migration-specific guard table name and keep the assertion in the same SQL migration transaction. A plain `PRAGMA foreign_key_check` only returns diagnostic rows; it does not necessarily fail execution. Deferral ON/OFF alone allowed a deliberately corrupted reference to commit in the local D1 probe. The CHECK assertion rejected that case and preserved the original data and ledger through rollback. It cannot detect referentially valid but unintended deletion, so retained-row assertions are also required. [SQLite foreign-key check](https://www.sqlite.org/pragma.html#pragma_foreign_key_check).

## Preserved legacy history and v1 baseline

The original nine flat SQL files, `0000` through `0008`, remain unchanged at their deployed paths. `migrations_pattern` discovers both these files and future nested folders. Moving old SQL into v1 folders would change the relative filenames Wrangler records and make old migrations appear pending. There is no flattening bridge or alternative runtime migrator. [Cloudflare migration discovery](https://developers.cloudflare.com/d1/reference/migrations/).

`20260922015545_baseline_after_0008` starts the v1 graph with a generated snapshot of the complete current schema and comment-only SQL. The preceding historical files create its schema. Applying the baseline adds one normal Wrangler ledger entry without changing application data or schema. Fresh and already-migrated local D1 databases were verified to converge, preserve all nine historical ledger records, and become no-ops on reapplication.

The baseline was generated into a temporary directory, retaining its snapshot and replacing the redundant initial CREATE statements with an explanation. This one-time transition removes obsolete journal metadata without renaming deployed SQL. Do not run `drizzle-kit up` over the old sparse snapshot history or recreate this baseline after adoption.

### Primary-key and unique-index expressions

RC4 drops `NOT NULL` from inline TEXT primary keys, even with explicit `.notNull()`. Booze therefore declares non-null columns and table-level primary keys:

```ts
id: text("id").notNull()
// In the table configuration:
(table) => [primaryKey({ columns: [table.id] })]
```

This preserves both exported SQL and snapshot nullability. The two original unique indexes are explicitly named `uniqueIndex` declarations to preserve their existing identity. Full schema parity remains strict; the original SQL was not changed to accommodate the generator. [Upstream primary-key bug #6165](https://github.com/drizzle-team/drizzle-orm/issues/6165), [SQLite primary-key semantics](https://www.sqlite.org/lang_createtable.html#the_primary_key).

Reevaluate these expressions only after an upstream fix is verified against export, no-change generation, and populated rebuild tests. The separate RC5 build `1.0.0-rc.5-5935859` still reproduced the primary-key bug during the 2026-09-22 investigation.
