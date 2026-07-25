# Status

## Implementation

The project is now a usable mobile-first wine cellar catalogue rather than a scaffold.

Current package layout:

```text
apps/web
packages/db
```

`apps/web` is the deployable Cloudflare Worker application. It uses Vite, React, the Cloudflare Vite plugin, Clerk, and Hono. The Worker serves the SPA assets and API routes.

`packages/db` contains the Drizzle SQLite schema and D1 migrations for users, site memberships, sites, wineries, collapsed wine vintages, grape varieties, wine constituents, bottles, storage locations, bottle locations, and label extractions.

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
```

## Authentication and Authorisation

Production API access uses Clerk bearer tokens verified by `@clerk/backend`.

Local development can send `x-dev-user: local-browser` only when:

1. the request host is `localhost` or `127.0.0.1`; and
2. `CLERK_SECRET_KEY` is unset.

The app maps Clerk users to internal user rows and creates owner memberships through the current site and storage-location upsert flow. API routes enforce site membership before returning inventory or changing existing bottle, storage-location, or site records.

Deleting a storage location removes bottle-location rows and keeps affected bottles in the same site with no location. Deleting a site removes site-owned bottle locations, bottles, wine constituents, wine vintages, wineries, storage locations, memberships, and the site row.

Role-specific owner/editor/viewer enforcement is not implemented yet.

## Product Gaps

Not yet implemented:

1. active-site filtering or a site switcher for bottle entry and inventory views;
2. invite/member management;
3. richer wine and bottle detail editing beyond the current capture form;
4. movement history and tasting notes;
5. CSV import/export;
6. R2 storage for label images and automated wine enrichment;
7. Vectorize semantic search;
8. MCP endpoint;
9. automated test coverage for the current workflows.

The UI accepts label photos from mobile browsers and sends them to the label-extraction endpoint for OCR-style field suggestions. The image remains transient; it is not stored in R2 yet.

## Deployment

The Worker is configured for Cloudflare Workers with a D1 binding and custom domain. The `workers.dev` endpoint is also enabled so deployment automation can probe the Worker independently of the custom domain.

GitHub Actions uses an orchestration workflow. `ci.yml` runs reusable format, lint, typecheck, test, and build workflows. `deploy.yml` runs after `ci` succeeds for a push to `main`; it checks out the CI-tested commit, applies remote D1 migrations, rebuilds the Vite Worker output, deploys the Worker, and probes the `workers.dev` health endpoint.

Deployment requires Cloudflare account credentials and Clerk configuration to be provided outside source control.

## Verification

Latest local verification:

```text
node --run check
```

This runs formatting, lint, typecheck, and package test scripts. The current package test suites contain no tests, so the next engineering priority is workflow coverage for the API and browser behavior.
