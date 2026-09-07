# Implementation status

Booze is a private mobile-first wine-cellar catalogue with a React/Vite browser application and a Cloudflare Worker. `packages/db` contains the Drizzle schema and append-only D1 migrations. See [product intent](product.md) for the domain and [project audit](audit.md) for findings, regression evidence, and priorities.

## Available workflows

- Clerk browser sign-in and localhost-only development authentication.
- Inventory search by wine, vintage, location, notes, and other recorded facts; a drink queue derived from drinking windows.
- Bottle entry with quantity, wine metadata, source details, critic reviews, awards, and optional storage position.
- Individual bottle selection within grouped wines, editing, movement, consumption, and deletion.
- Site and nested-location creation, renaming, and deletion. Deleting a location preserves its bottles, captures, and child locations within the site.
- Photo capture with stored originals, bounded image preparation, independent model extraction steps, automatic import of confident results, and manual review for uncertainty.
- Capture progress refresh, retry, and deletion with durable R2 cleanup.
- Site-authorised MCP inventory and management tools, with atomic mutation audit records.

## Data and permissions

Owners can manage their site and its content. Editors can change content but cannot rename or delete the site. Viewers are read-only. The Worker enforces these roles independently of the browser.

Wine metadata is shared by a wine-vintage record. Individual bottles retain their own status, notes, barcode, lot, and location. Adding stock preserves existing wine facts; explicit edits and clears follow different rules from additions. Related bottle mutations commit atomically. Capture completion receipts make import retries recoverable.

D1 is the source of truth. Original images and extraction artifacts live in R2. Explicit capture/site deletion queues object cleanup transactionally; the hourly Worker retries cleanup. MCP audit rows survive site deletion. Existing migrations and IDs remain valid.

## Remaining product work

The highest priorities are export/recovery, consumed-history browsing, a full details view for viewers, and measured pagination of large catalogues. Member invitations, movement history, richer enrichment, and semantic search remain extensions. The [audit](audit.md#remaining-priorities) records the tradeoffs and validation limits.

## Development and deployment

[README](../README.md) has local setup and verification commands. `pnpm check` runs formatting, lint, TypeScript, Worker/SQLite tests, React tests, theme validation, and Chrome interaction/accessibility tests. A separate production build enforces client bundle budgets.

GitHub CI gates production deployment. Deployment checks browser authentication configuration and builds before applying D1 migrations, then deploys and probes Worker liveness. See [deployment and recovery](deployment.md) for configuration, migration lineage, and backup procedures. Live Clerk, hosted extraction, and production recovery need environment-specific validation.
