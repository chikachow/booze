# Booze Product Requirements

## Product Summary

Booze is a private, browser-based wine cellar catalogue for non-technical users. It tracks storage sites, storage locations, wineries, collapsed wine-vintage records, grape constituents, physical bottles, drinking windows, source details, label text, and notes. The app is mobile-first because bottles are usually entered, moved, or checked while standing near a rack, fridge, or box.

The product runs as a Cloudflare Worker with a React/Vite frontend, Hono API routes, Cloudflare D1 storage, and Clerk authentication. Local development may use a development auth header when Clerk keys are not configured.

## Current MVP

The current usable product supports:

1. Clerk-backed browser access, with a localhost development auth workaround.
2. Separate bottle management and storage-location management areas.
3. Mobile and desktop responsive layouts.
4. Site and storage-location creation.
5. Storage-location rename within an authorised site.
6. Storage-location deletion that leaves affected bottles in the same site without a location.
7. Site creation, rename, and deletion.
8. Bottle entry with winery, brand, wine name, vintage, grape varieties, region, wine style, drink window, source URL, label text, wine notes, bottle notes, quantity, site, optional storage location, and position.
9. Bulk bottle creation for one wine entry.
10. Available inventory search.
11. A drink queue for bottles that are ready, soon due, or past their drink window.
12. Bottle moves between known storage locations or back to no location.
13. Marking bottles consumed so they disappear from available inventory.
14. Storage-location cards with available bottle counts.

The current app intentionally keeps bottle capture, bottle display, and location management in separate UI contexts. This reduces accidental data manipulation while browsing inventory and keeps the common mobile workflows short.

## Primary Users

### Cellar Owner

The cellar owner needs to:

1. create storage sites and locations;
2. enter bottles quickly from a mobile browser;
3. find where a bottle is stored;
4. see what should be drunk now or soon;
5. mark bottles consumed;
6. keep enough notes and source links to trust the catalogue later.

### Trusted Household User

A trusted user needs to view and manage bottles in shared sites after signing in. The data model already has site memberships, but explicit invite/member management is not implemented yet.

### AI Client

An MCP-capable AI client is a stretch user. It should eventually get authenticated, read-only, site-authorised inventory tools. It must not receive arbitrary SQL access or write access in the MVP.

## Core Concepts

### Site

A top-level storage context such as `home`, `wine fridge`, `offsite storage`, or `parents house`.

### Storage Location

A storage position inside a site, such as `left rack`, `shelf 2`, or `box 4`. The data model supports parent locations so racks, shelves, bins, and slots can be represented without separate rack-specific tables. The current UI keeps entry flat for speed.

### Winery

The producer or estate record for one site catalogue. Wineries can be reused across multiple named wines and vintages.

### Wine Vintage

The bottle-facing wine record. It intentionally collapses UC Davis `Wine` and `Vintage` for v1: winery, brand, display name, designation, style, colour, geography, vintage, drink window, ABV, label text, and grape constituents live together because the app treats different vintages as distinct catalogue entries.

### Bottle

A physical bottle row with status, optional bottle facts, and notes. Its current storage position is represented by a separate bottle-location row. Multiple bottle rows are created when quantity is greater than one.

## Functional Requirements

## Authentication

The app must:

1. use Clerk for browser sessions when Clerk is configured;
2. verify Clerk session tokens on API requests;
3. map Clerk user IDs to internal users;
4. reject unauthenticated API access outside local development;
5. allow local development with `x-dev-user` only on localhost when `CLERK_SECRET_KEY` is absent.

## Authorisation

The app must:

1. enforce site membership server-side for site-scoped data;
2. prevent cross-site bottle and storage-location access;
3. create an owner membership when a user creates a site through the current upsert flow;
4. avoid frontend-only access control.

Role-specific owner/editor/viewer permission enforcement is planned but not implemented.

## Bottle Management

The app must support:

1. entering one or more bottles;
2. storing wine metadata and notes;
3. storing label text manually;
4. selecting or typing a site and location;
5. moving a bottle to another known location;
6. marking a bottle consumed;
7. searching available inventory;
8. showing drink status derived from the drink window.

## Location Management

The app must support:

1. creating locations by site;
2. editing location names;
3. deleting locations;
4. listing locations separately from bottle workflows;
5. showing available bottle counts;
6. using a location as the target for new bottle entry.

Deactivate, capacity, parent/child hierarchy, and short location codes are not implemented.

Deleting a location must set affected bottles to a location-less state while preserving their site association.

## Site Management

The app must support:

1. creating sites;
2. editing site names;
3. deleting sites;
4. listing sites with bottle and location counts.

Deleting a site removes its bottles, wine vintages, locations, memberships, and site row. This is intentionally different from deleting a location, because a bottle cannot remain associated with a deleted site.

## Drink Queue

The app must calculate:

1. `unknown` when no drink window is present;
2. `hold` when current year is before `drink_from_year`;
3. `past-window` when current year is after `drink_to_year`;
4. `drink-soon` when within two years of `drink_to_year`;
5. `drink-now` otherwise, when inside or past the start of the window.

The current drink queue displays `drink-now`, `drink-soon`, and `past-window` bottles.

## Image and Enrichment Requirements

The current UI accepts image input from a mobile camera/file picker, but it does not upload or process the image. Users can paste extracted label text manually.

Future image work should:

1. store photos in R2, not D1;
2. run OCR with a Cloudflare-compatible service or reliable on-device browser path;
3. store OCR output as label text or a searchable wine document;
4. keep D1 as the source of truth.

Trusted wine enrichment from winery pages, technical sheets, Vivino pages, or reviews is desirable but not required for MVP. Any enrichment must preserve source URLs and should not overwrite user-entered facts without review.

## MCP Requirements

MCP is a stretch requirement. The `/mcp` endpoint may expose read and write tools for authenticated users, starting with inventory lookup and bounded cellar-management operations such as:

```text
wine.search_bottles
wine.list_sites
wine.list_wines
wine.get_wine
wine.list_wineries
wine.list_storage_locations
wine.get_bottle
wine.list_drink_queue
wine.get_location_inventory
wine.get_inventory_summary
wine.set_drinking_window
wine.create_storage_location
wine.set_bottle_location
wine.mark_bottle_consumed
```

MCP tools must authenticate callers, enforce site membership, return structured JSON, avoid arbitrary SQL, and keep each write scoped to an explicit domain action. Write tools should expose narrow inputs, validate ownership before mutation, report the affected records, and persist audit context to investigate accidental or agent-triggered changes.

The Clerk OAuth application supports Clerk's built-in `email`, `offline_access`, `openid`, and `profile` scopes. Clerk does not currently support custom resource scopes, so MCP read and write authorisation is enforced by valid Clerk OAuth identity plus server-side site membership and domain-action checks. Audit event identifiers stay server-private and are not exposed in tool results.

The primary MCP client is up-to-date ChatGPT. Tool results should treat `structuredContent` as the canonical data channel and keep textual content terse instead of duplicating serialized JSON, because duplicated text risks response-size caps. Alternatives considered and rejected for the current product shape are capped JSON text, detail-only list responses, resource links for large payloads, and compressed/base64 payloads.

## Non-Functional Requirements

## Usability

The app should be comfortable on a mobile browser:

1. touch targets are large enough for one-handed use;
2. the capture form is grouped into short sections;
3. bottle management and location management are separate areas;
4. inventory and drink views avoid accidental edit fields except deliberate move/consume controls;
5. desktop layouts use available width without changing the underlying workflows.

## Security

The system must:

1. require authentication for non-health endpoints;
2. store secrets outside source control;
3. enforce membership checks on the Worker;
4. avoid arbitrary SQL or administrative endpoints;
5. validate uploaded images, store them in R2 only for the capture lifetime, and remove them through the durable deletion queue.

## Reliability and Portability

The system should:

1. keep D1 as the source of truth;
2. keep migrations in source control;
3. use explicit text IDs;
4. make future CSV export/import possible;
5. treat AI indexes and OCR output as rebuildable derived data.

## Implementation Plan

### Done

1. Worker/Vite/React application shell.
2. D1 schema for users, site memberships, sites, wineries, collapsed wine vintages, constituents, bottles, and storage locations.
3. Clerk token verification plus localhost development auth.
4. Resource-oriented REST routes for bottles, sites, storage locations, and label extractions.
5. Mobile-first responsive UI with bottle and storage-location areas.
6. Basic drink-window status calculation.
7. R2-backed bottle captures with multi-model extraction and a human-review gate.
8. Audited MCP read and write tools.
9. Owner/editor/viewer enforcement in the Worker.

### Next

1. Add focused route and UI tests for bottle creation, movement, storage-location rename, and cross-site denial.
2. Add member invitation and role-management workflows.
3. Add richer wine/bottle detail editing beyond the current capture form.
4. Add CSV export before adding AI features.
5. Add capture-retention controls and operational visibility for R2 cleanup retries.
6. Expand MCP integration tests for write-tool result shapes and authorisation denials.

## Success Criteria

The MVP is useful when:

1. adding a normal bottle takes less than 30 seconds after the user knows the wine details;
2. finding a bottle by search or location takes less than 10 seconds;
3. drink queue surfaces bottles that would otherwise be forgotten;
4. a non-technical user can manage sites, storage locations, and bottles from a phone;
5. server-side membership checks prevent cross-site data leakage.
