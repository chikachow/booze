# Deployment and data recovery

## Configuration

The GitHub `production` environment supplies `VITE_CLERK_PUBLISHABLE_KEY` as a variable and `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` as secrets. The publishable key is compiled into browser assets; setting only a Worker runtime key cannot configure the browser.

Worker secrets include `CLERK_SECRET_KEY` and, for photo extraction, `CF_AIG_TOKEN`. Configure them through Cloudflare outside source control. Non-secret bindings and `CLERK_OAUTH_ISSUER` live in `apps/web/wrangler.jsonc`. The Worker fails closed for MCP OAuth metadata when the issuer is absent or blank.

Local Worker secrets belong in `apps/web/.dev.vars`; browser build variables belong in `apps/web/.env.local`. Both are ignored. See [Cloudflare's environment-variable guidance](https://developers.cloudflare.com/workers/local-development/environment-variables/).

## Release sequence

`deploy.yml` runs after successful CI for a push to `main` and checks out that tested commit. It checks browser authentication configuration, builds the Worker and browser assets, applies pending D1 migrations, deploys the built output, and probes `/healthz`.

The health route confirms that the Worker responds; it does not verify Clerk sign-in, D1 schema, R2 access, or model extraction. Verify sign-in and a catalogue read after deployment. Use a dedicated test site for any write smoke test.

## D1 migration lineage

Migrations `0000` through `0008` establish the original lineage. A comment-only v1 baseline follows them; subsequent generated migrations use timestamped folders. Keep every existing SQL file unchanged and in order. Schema changes append a new migration; do not replace history with a generated initial migration, rename old files, or hide mismatches with `IF NOT EXISTS`.

Drizzle Kit exports the current TypeScript schema as SQL DDL for inspection and database management:

```sh
pnpm --filter @chikachow/booze-db exec drizzle-kit export
```

Export describes the desired schema; it does not export stored data or apply a database change. Wrangler applies the checked-in SQL migrations and tracks their application. See the [Drizzle export documentation](https://orm.drizzle.team/docs/drizzle-kit-export).

`pnpm --filter @chikachow/booze-db test` compares that export with a fresh SQLite database built from every checked-in SQL migration. It checks tables, columns, keys, indexes, and table options while allowing column order and foreign-key numbering to differ. The database tests also validate the snapshot graph and no-change generation. `pnpm check` additionally tests upgrade from the accepted target history on populated local D1. These checks do not read production. See [migration authoring, concurrent edits, and D1 rebuilds](drizzle-migrations.md).

Before a release that adds a migration, compare the remote ledger with the checked-in filenames:

```sh
pnpm --filter @chikachow/booze-web exec wrangler d1 migrations list booze --remote
```

Stop if the histories disagree. Reconcile the repository against the deployed lineage before applying anything. Migration `0008` adds the durable R2 deletion queue; earlier migrations established the catalogue, captures, reviews, awards, and audit log.

Migration `0003` historically removed inline OCR evidence columns. Do not apply it to an old database that still holds that evidence without first exporting and retaining it. This audit preserves the checked-in lineage; it does not reverse historical evidence removal.

## Recovery preparation

Keep a D1 export and its recovery bookmark in a private backup directory outside the repository before a data-changing release. These commands read the remote database; choose an output filename that does not overwrite an existing backup:

```sh
pnpm --filter @chikachow/booze-web exec wrangler d1 time-travel info booze --json
pnpm --filter @chikachow/booze-web exec wrangler d1 export booze --remote --output /absolute/private/backup/booze-before-release.sql
```

D1 [Time Travel](https://developers.cloudflare.com/d1/reference/time-travel/) has a retention window determined by the account plan. An [SQL export](https://developers.cloudflare.com/d1/best-practices/import-export-data/) provides a separate portable snapshot. Neither includes R2 image bytes.

Preserve original images independently when preparing a full recovery point. A D1 rollback alone cannot restore an object already deleted from R2, and restoring an old deletion queue can reintroduce pending deletions. Pause capture processing and cleanup before a coordinated recovery; restore D1 and R2 to a consistent point, inspect pending cleanup keys, then resume. Rehearse recovery against a separate database and bucket before using it on production.

No production restore, migration, or object cleanup is part of the project audit. Existing metadata or photos lost before a fix require recovery from an available backup; code changes cannot reconstruct them reliably.
