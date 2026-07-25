# Status

## Implementation

The project is now a usable mobile-first wine cellar catalogue rather than a scaffold.

Current package layout:

```text
apps/web
packages/db
```

`apps/web` is the deployable Cloudflare Worker application. It uses Vite, React, the Cloudflare Vite plugin, Clerk, and Hono. The Worker serves the SPA assets and API routes.

`packages/db` contains the Drizzle SQLite schema and append-only D1 migrations for the cellar catalogue, capture processing, critic reviews, awards, MCP audit events, and durable object cleanup.

## Current User Workflows

Implemented browser workflows:

1. Sign in with Clerk when Clerk keys are configured.
2. Use localhost development auth when Clerk keys are absent.
3. Manage bottles in a dedicated bottle area.
4. Manage sites and storage locations in a dedicated location area.
5. Create storage locations per site.
6. Rename existing storage locations.
7. Delete storage locations while keeping affected bottles in the same site with no location.
8. Create, rename, and delete sites.
9. Add one or more bottles with wine-vintage metadata, drink window, source URL, label text, and notes.
10. Add bottles without a location.
11. Search available inventory.
12. See bottles that are ready, soon due, or past their drink window.
13. Move bottles between known storage locations or back to no location.
14. Mark bottles consumed.
15. Upload bottle images, run multi-model label extraction, and review uncertain matches before import.
16. Record critic reviews and wine awards.
17. Delete completed captures and sites with durable R2 object cleanup.
18. Use audited MCP tools for read and write cellar operations.

Implemented Worker routes:

```text
GET    /healthz
GET    /api/healthz
GET    /api/bottles
POST   /api/bottles
PATCH  /api/bottles/:bottleId
DELETE /api/bottles/:bottleId
GET    /api/sites
POST   /api/sites
PATCH  /api/sites/:siteId
DELETE /api/sites/:siteId
GET    /api/storage-locations
POST   /api/storage-locations
PATCH  /api/storage-locations/:storageLocationId
DELETE /api/storage-locations/:storageLocationId
GET    /api/bottle-captures
POST   /api/bottle-captures
GET    /api/bottle-captures/:captureId
POST   /api/bottle-captures/:captureId/retry
POST   /api/bottle-captures/:captureId/import
DELETE /api/bottle-captures/:captureId
GET    /api/review-sources
POST   /api/review-sources
GET    /api/critic-reviews
PUT    /api/critic-reviews
PUT    /api/wines/:wineVintageId/critic-reviews
DELETE /api/critic-reviews/:reviewId
```

## Authentication and Authorisation

Production API access uses Clerk bearer tokens verified by `@clerk/backend`.

Local development can send `x-dev-user: local-browser` only when:

1. the request host is `localhost` or `127.0.0.1`; and
2. `CLERK_SECRET_KEY` is unset.

The app maps Clerk users to internal user rows. New sites receive user-scoped IDs and an owner membership, so choosing another site's name cannot grant access to it.

Server-side site roles enforce this matrix:

- `owner`: read and write cellar content, rename a site, and delete a site;
- `editor`: read and write cellar content, including captures and MCP mutations;
- `viewer`: read-only access.

Deleting a storage location removes bottle-location rows and keeps affected bottles in the same site with no location. Deleting a completed capture removes its runs and exclusive image assets. Deleting a site removes all site-owned catalogue and capture rows. Both deletion paths enqueue R2 keys in the same D1 transaction, then delete objects immediately or through an hourly retry. MCP audit rows are retained unchanged after site deletion.

## Product Gaps

Not yet implemented:

1. active-site filtering or a site switcher for bottle entry and inventory views;
2. invite/member management;
3. richer wine and bottle detail editing beyond the current capture form;
4. movement history and tasting notes;
5. CSV import/export;
6. Vectorize semantic search;
7. broader API and browser workflow coverage.

The UI stores validated label images in R2 for the capture lifetime. Multi-model extraction can import only when the reconciliation is confident and conflict-free; all other candidates remain available for explicit review. Images and run artifacts are removed only when the capture or its site is explicitly deleted.

## Deployment

The Worker is configured for Cloudflare Workers with a D1 binding and custom domain. The `workers.dev` endpoint is also enabled so deployment automation can probe the Worker independently of the custom domain.

GitHub Actions uses an orchestration workflow. `ci.yml` runs reusable format, lint, typecheck, test, and build workflows. `deploy.yml` runs after `ci` succeeds for a push to `main`; it checks out the CI-tested commit, applies remote D1 migrations, rebuilds the Vite Worker output, deploys the Worker, and probes the `workers.dev` health endpoint.

Deployment requires Cloudflare account credentials and Clerk configuration to be provided outside source control.

## Verification

Latest local verification:

```text
node --run check
```

This runs formatting, lint, typecheck, and package test scripts. The Worker suite covers authorisation roles, OCR review decisions, capture artifacts, D1 deletion with foreign keys, durable R2 retry, MCP schemas and metadata, audit rollback, and OAuth metadata. Broader route-level and browser coverage remains desirable.
