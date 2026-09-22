# Wine identity release checklist

This checklist covers `20260922034734_wine_identity_and_capture_review/migration.sql` and its accompanying Worker/browser change. It is a release prerequisite, not a record that production checks have passed. Local tests and CI cannot establish the remote migration history, backup recoverability, or absence of active old writers.

## Compatibility boundary

The migration keeps existing IDs and makes producer relationships nullable, removes descriptive uniqueness, adds capture review revisions, and distinguishes unknown from explicit non-vintage. Known-year reads tolerate an old writer omitting the new status. That compatibility does not make the whole release safe for mixed writers:

- The previous Worker selects wines by descriptive fields with `LIMIT 1`. After legitimate duplicate descriptions exist, old adds/edits can choose an arbitrary matching record.
- Its inventory and MCP queries inner-join wineries. Wines created without a producer become invisible through those old reads, although the rows still exist.
- Old capture code does not enforce the new manual-review revision contract. Do not assume deploying the HTTP Worker has drained existing Workflow executions or cached steps.
- Existing browser tabs can retain the old edit payload. The new API deliberately rejects shared edits without their scope/count guards. Refresh those tabs before editing; do not relax server guards to accept old payloads.

Therefore, do not use gradual traffic splitting or a Worker-only rollback to the old implementation after enabling new writes. Prefer a forward fix on the new schema. A return to the old application requires a separately rehearsed, coordinated data recovery with an explicit decision about writes made since the recovery point.

## Before merge: go/no-go evidence

1. Record the exact tested release SHA, current production Worker version/source SHA, and all queued or running deployment jobs. Prevent unrelated merges and older deployment reruns through this release. The existing CI deployment concurrency serializes jobs but does not guarantee commit order. Cancel or hold stale jobs before proceeding, and verify the exact checkout in the selected deployment log.
2. Establish a verified write freeze covering both the custom domain and `workers.dev`, authenticated REST and MCP traffic, capture intake/retry, and scheduled R2 cleanup. Include ostensibly read-only authenticated requests: authentication can create user rows, so blocking only POST/PATCH/DELETE is insufficient. Finish existing in-flight writes and capture Workflows before the backup. Inventory Workflow instances, including paused/waiting/retrying instances, and their associated capture IDs; do not blindly resume or restart old instances after release. Resolve each unfinished capture explicitly without deleting photos or fabricating an import receipt. The application currently has no built-in maintenance switch: if the operator cannot demonstrate this freeze and drain using available controls, **do not merge**; implement and review a compatibility/maintenance stage first. Pausing only a browser is insufficient.
3. Query and retain the actual `d1_migrations` ledger as described in [deployment](deployment.md), alongside the deployed source revision and proposed ordered pending SQL. Reject unknown or renamed history. Do not substitute `migrations list` for this comparison.
4. With writers and cleanup quiescent, retain a private D1 export, recovery bookmark, capture/Workflow inventory, and original R2 images needed for recovery. Record database/bucket identifiers, timestamps, and export checksum. Check export completion and readability. Keep private data outside Git and CI artifacts. A bookmark and an export taken at different moments are not automatically a consistent recovery point; the write freeze supplies that boundary.
5. Rehearse the exact candidate migrations against that export in a separate local D1 database, then test rollback/recovery in an isolated environment. Never point the rehearsal at production. First verify the export can be restored unchanged, or prepare and verify a separate restore copy using the [export recovery procedure](deployment.md#test-the-export-as-a-restore-input). The production rehearsal required schema-first ordering and bounded updates for large extraction text; the raw export was not directly importable. Keep the original export unchanged. From the tested checkout, use the verified restore copy and a fresh private persistence directory:

   ```sh
   umask 077
   BOOZE_REHEARSAL=$(mktemp -d)
   pnpm --filter @chikachow/booze-web exec wrangler d1 execute booze --local --persist-to "$BOOZE_REHEARSAL" --file /absolute/private/backup/recovery/before-bounded.sql
   pnpm --filter @chikachow/booze-web exec wrangler d1 execute booze --local --persist-to "$BOOZE_REHEARSAL" --command 'SELECT id, name, applied_at FROM d1_migrations ORDER BY id' --json
   pnpm --filter @chikachow/booze-web exec wrangler d1 migrations apply booze --local --persist-to "$BOOZE_REHEARSAL"
   pnpm --filter @chikachow/booze-web exec wrangler d1 execute booze --local --persist-to "$BOOZE_REHEARSAL" --command 'PRAGMA foreign_key_check' --json
   pnpm --filter @chikachow/booze-web exec wrangler d1 migrations apply booze --local --persist-to "$BOOZE_REHEARSAL"
   ```

   Stop if the imported ledger differs from the captured ledger. Compare every original wine/bottle ID and all unaffected row data before/after, including composition measurements, reviews, awards, extraction evidence, capture runs, image links, and the deletion queue. Check that known years remain known; every legacy yearless wine becomes unknown; existing names, timestamps, and relationships remain intact; review revisions start at zero with no corrections. Require an empty foreign-key result, the exact expected new ledger entry, schema parity, and a no-op second application. Row counts and foreign-key checks alone cannot detect value changes or valid-but-wrong reassignment. If schema or application code changes after rehearsal, repeat the affected checks against the new release SHA.

6. Record a recovery owner, a tested recovery procedure and estimated outage, and the verification results. Merge only when these prerequisites are complete. The GitHub workflow does not enforce this checklist and may begin deploying automatically after merge.

## Release while the freeze remains in effect

Confirm the release CI passed, the deployment uses the recorded SHA, and only the reviewed pending migrations are applied. Keep the freeze through Worker replacement and verification. If migration fails, inspect its actual ledger/schema/data state; do not assume previously successful pending migrations were also rolled back. If migration succeeds but deployment fails, keep writes blocked and deploy the tested compatible Worker or a forward fix. Do not reopen writes on the old Worker merely because `/healthz` returns 200.

Verify the deployed Worker version, final ledger, foreign keys, preserved IDs/relationships, and vintage transformations. For smoke tests, grant a controlled exception to the release operator and dedicated test site while ordinary traffic and cleanup remain blocked; log the resulting test writes separately from the migration comparisons. Authenticate through the UI and MCP, read both normal and producerless fixtures, and test explicit create/reuse, saved corrections plus extraction retry, shared correction, and one-bottle reassignment. Verify distinct same-description wines and consumed-only wine selection. Confirm retrying a completed test import does not add bottles. Use freshly loaded browser assets and separately check that old-tab edits fail without mutating data.

Only then reopen writers and cleanup. Inspect each retained capture before retrying it under the new release. Do not retry the production Rikard capture as a smoke test; importing it is a separate user action. Observe capture failures and application logs after reopening.

## Recovery

Keep writes, Workflow processing, and cleanup stopped during recovery. A Worker rollback does not itself restore D1 data or R2 objects; old application reads/writes have the incompatibilities above. Preserve any post-release records before deciding whether to restore the pre-release recovery point. A restore may discard later changes, and replay must respect capture receipts. Reconcile D1 image references and pending deletion keys against the retained R2 objects before resuming cleanup. Follow the rehearsed coordinated procedure in [deployment and data recovery](deployment.md), not an untested sequence improvised during the incident.

Cloudflare references: [D1 import/export](https://developers.cloudflare.com/d1/best-practices/import-export-data/), [Time Travel](https://developers.cloudflare.com/d1/reference/time-travel/), [Workflow instance inspection](https://developers.cloudflare.com/workflows/reference/wrangler-commands/), and [Worker rollback scope and limits](https://developers.cloudflare.com/workers/versions-and-deployments/rollbacks/).
