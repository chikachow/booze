# Wine Cellar Catalogue — Product Requirements Document and Implementation Plan

## 1. Product Summary

Build a personal wine cellar catalogue that tracks wines, physical bottles, storage sites, rack locations, tasting notes, and drinking windows. The system should recommend what to drink now, what to hold, and what is approaching the end of its drinking window.

The first production version will be a private web app hosted on Cloudflare Workers, using D1 as the relational database, Vectorize for optional semantic lookup, Clerk for sign-in with Google and Apple, and an MCP endpoint for controlled AI access.

The system is personal-first but should be designed to support explicit sharing of “sites”, where a site is a top-level storage context above locations.

Example sites:

```text
Home cellar
Wine fridge
Offsite storage
Parents’ house
Shared rack
```

Locations sit below sites.

Example:

```text
Home cellar
  Rack A
    Row 1 Column 1
    Row 1 Column 2
  Wine Fridge
    Shelf 1
    Shelf 2
```

## 2. Product Goals

### 2.1 Primary goals

1. Catalogue wines and individual bottles.
2. Track exact or approximate bottle locations.
3. Support multiple storage sites.
4. Support sharing of sites with other signed-in users.
5. Recommend bottles to drink now, drink soon, hold, or reserve for special occasions.
6. Expose safe, auditable, read-only inventory tools to AI assistants.
7. Keep the system simple enough that data entry is fast and the catalogue stays current.

### 2.2 Secondary goals

1. Support semantic search over tasting notes and food-pairing notes.
2. Support label images later.
3. Support CSV import/export.
4. Support MCP integration for ChatGPT or other MCP-capable clients.
5. Support future write actions from AI, such as marking a bottle consumed, but only with explicit confirmation.

### 2.3 Non-goals for MVP

The MVP will not include:

1. native mobile apps;
2. automatic label recognition;
3. automatic wine valuation;
4. external wine database enrichment;
5. barcode scanning;
6. complex rack visualisation;
7. public cellar sharing;
8. marketplace, buying, or selling features;
9. arbitrary SQL access by AI tools;
10. AI write access.

## 3. Recommended Technical Stack

### 3.1 Application stack

Use:

```text
Cloudflare Workers
Cloudflare D1
Cloudflare Vectorize
Cloudflare R2, later
Clerk
React or simple server-rendered frontend
Hono
Zod
Drizzle ORM or plain SQL migrations
TypeScript
```

### 3.2 Hosting

The application runs as a Cloudflare Worker.

Responsibilities:

1. serve API routes;
2. serve frontend assets or proxy to static assets;
3. verify Clerk sessions;
4. enforce site-level authorisation;
5. execute D1 queries;
6. call Vectorize for semantic search;
7. expose MCP tools.

### 3.3 Database

Use Cloudflare D1 for the MVP.

D1 is sufficient because the product has small relational data volumes:

```text
hundreds or thousands of wines
hundreds or thousands of bottles
moderate tasting-note volume
small user/membership table
small audit log
```

Store photos in R2 later, not D1.

### 3.4 Vector database

Use Cloudflare Vectorize only for semantic search.

Vectorize should index derived text documents such as:

```text
wine profile
tasting note
producer note
pairing note
preference note
label OCR text, later
```

It should not be the source of truth for:

```text
location
quantity
bottle status
price
ownership
membership
drinking-window logic
```

### 3.5 Authentication

Use Clerk.

Required sign-in methods:

```text
Google
Apple
```

Optional later:

```text
email magic link
passkeys
password
```

The app must maintain its own internal user and site membership tables. Clerk authenticates users; the application authorises access to sites.

## 4. Core Concepts

## 4.1 User

A person who signs in through Clerk.

The application stores a local user row mapped to the Clerk user ID.

## 4.2 Site

A top-level cellar/storage context.

Examples:

```text
Home cellar
Offsite storage
Wine fridge
Shared family cellar
```

A site owns:

```text
locations
wines
bottles
tastings
movement history
wine documents
```

A user accesses a site through a membership.

## 4.3 Site membership

A user’s role in a site.

Initial roles:

```text
owner
editor
viewer
```

Future role:

```text
admin
```

Recommended MVP permissions:

| Role   | Permissions                                                 |
| ------ | ----------------------------------------------------------- |
| owner  | Full control, including members and site settings           |
| editor | Add/edit wines, bottles, locations, tastings, and movements |
| viewer | Read inventory and recommendations only                     |

## 4.4 Location

A physical or logical storage position inside a site.

Examples:

```text
Rack A
Rack A / Row 3
Rack A / Row 3 / Column 5
Wine Fridge / Shelf 2 / Left
Box 4 / Slot 7
```

Locations are hierarchical.

## 4.5 Wine

The canonical wine/vintage record.

Example:

```text
2017 Tyrrell’s Vat 1 Semillon
Hunter Valley
Semillon
Drink 2024–2037
```

## 4.6 Bottle

A physical bottle of a wine.

A bottle has:

```text
status
location
purchase price
source
condition
special flag
notes
```

For reliable location tracking, use one database row per physical bottle.

## 4.7 Tasting

A record of a consumed bottle or wine tasting.

Includes:

```text
consumed date
rating
notes
meal
occasion
would buy again
```

## 4.8 Wine document

A text document derived from wine/tasting/pairing/preference data and optionally embedded in Vectorize.

## 5. Users and Use Cases

## 5.1 Primary user

The cellar owner.

Needs to:

1. add bottles quickly;
2. find bottles physically;
3. know what to drink;
4. avoid forgetting older bottles;
5. share a cellar/site with trusted people;
6. ask an AI assistant for recommendations grounded in real inventory.

## 5.2 Secondary user

A trusted partner, family member, or friend.

Needs to:

1. view available bottles in a shared site;
2. find a bottle by location;
3. optionally add or mark bottles consumed if granted editor access.

## 5.3 AI assistant

Needs controlled read access to:

1. available bottles;
2. wine metadata;
3. drink windows;
4. locations;
5. tasting notes;
6. semantic search results;
7. recommendation endpoints.

The AI assistant must not invent inventory state or mutate the catalogue during MVP.

## 6. User Stories

### 6.1 Catalogue

As a cellar owner, I want to add a wine so that I can catalogue bottles of it.

Acceptance criteria:

```text
Given I am signed in
And I have access to a site as owner or editor
When I create a wine with producer, name, vintage, region, style, and drink window
Then the wine is saved under that site
And it appears in site inventory search
```

### 6.2 Add bottles

As a cellar owner, I want to add multiple bottles of the same wine at once.

Acceptance criteria:

```text
Given a wine exists
When I add quantity = 6 bottles and choose a location
Then 6 bottle rows are created
And each bottle has status = available
And each bottle belongs to the selected site
```

### 6.3 Move bottle

As a cellar owner, I want to move a bottle between locations.

Acceptance criteria:

```text
Given a bottle is available in Location A
When I move it to Location B
Then the bottle’s current location changes to Location B
And a movement record is written
```

### 6.4 Mark consumed

As a cellar owner, I want to mark a bottle consumed and optionally add a tasting note.

Acceptance criteria:

```text
Given a bottle is available
When I mark it consumed
Then its status changes to consumed
And it no longer appears in available inventory
And an optional tasting note can be recorded
```

### 6.5 Drink-now list

As a cellar owner, I want to see bottles that are ready to drink.

Acceptance criteria:

```text
Given bottles have drink windows
When I open Drink Now
Then I see available bottles whose current year is inside the drinking window
And each result includes the location and reason codes
```

### 6.6 Drink-soon list

As a cellar owner, I want to see bottles approaching the end of their drinking window.

Acceptance criteria:

```text
Given bottles have drink_to_year values
When a bottle is within two years of drink_to_year
Then it appears in Drink Soon
```

### 6.7 Site sharing

As a site owner, I want to invite another user to a site.

Acceptance criteria:

```text
Given I am an owner of a site
When I invite an email address with viewer or editor role
Then a site invitation is created
And the recipient can accept after signing in
And they receive the assigned role only for that site
```

### 6.8 AI recommendation

As a cellar owner, I want to ask an AI assistant what to drink with dinner.

Acceptance criteria:

```text
Given the AI client has authenticated read access
When it calls recommend_for_context with meal and constraints
Then the API returns available bottles only
And each result includes exact bottle ID, location, drink status, score, and reason codes
And no unavailable bottle is returned
```

## 7. Functional Requirements

## 7.1 Authentication

The app must:

1. support Google sign-in through Clerk;
2. support Apple sign-in through Clerk;
3. verify Clerk session tokens on API requests;
4. map Clerk user IDs to internal users;
5. reject unauthenticated API access;
6. handle first-time sign-in by creating an internal user row.

## 7.2 Authorisation

The app must:

1. require site membership for every site-scoped operation;
2. enforce role permissions on the server;
3. prevent cross-site access;
4. prevent frontend-only authorisation;
5. include `site_id` on all site-owned records.

Minimum permissions:

```text
site:read
site:update
member:invite
member:remove
wine:read
wine:write
bottle:read
bottle:write
location:read
location:write
recommendation:read
```

## 7.3 Site management

The app must support:

1. create site;
2. rename site;
3. list sites for signed-in user;
4. select active site;
5. invite user to site;
6. accept site invitation;
7. remove site member;
8. change member role.

MVP may restrict destructive site deletion to manual database/admin action.

## 7.4 Location management

The app must support:

1. create location;
2. edit location;
3. deactivate location;
4. nest location under parent;
5. assign short code;
6. list inventory by location;
7. validate unique location code per site.

## 7.5 Wine management

The app must support:

1. create wine;
2. edit wine;
3. search wines;
4. filter by producer, vintage, region, grape, colour, style, and drink status;
5. store drink window;
6. store notes.

## 7.6 Bottle management

The app must support:

1. add bottle;
2. add multiple bottles;
3. move bottle;
4. mark bottle consumed;
5. mark bottle gifted, sold, missing, disposed, or reserved;
6. update purchase price;
7. update source;
8. update condition;
9. mark special;
10. list available bottles.

## 7.7 Tasting notes

The app must support:

1. create tasting note;
2. associate tasting note with wine;
3. optionally associate tasting note with bottle;
4. store rating;
5. store meal;
6. store occasion;
7. store would-buy-again flag.

## 7.8 Recommendations

The app must support:

1. drink now;
2. drink soon;
3. hold;
4. past window;
5. contextual recommendation for meal/occasion;
6. exact location in every recommendation;
7. reason codes in every recommendation;
8. deterministic priority score.

## 7.9 Semantic search

The app should support:

1. embedding wine profile documents;
2. embedding tasting notes;
3. embedding personal preference notes;
4. semantic query over those documents;
5. hybrid recommendation using SQL filters plus vector matches.

Semantic search must never override availability, ownership, or location from SQL.

## 7.10 Import/export

The app must support:

1. CSV export of sites, locations, wines, bottles, tastings, and movements;
2. CSV import of wines and bottles;
3. import preview before committing records;
4. error reporting for malformed rows.

## 7.11 MCP integration

The app should expose read-only MCP tools.

Initial MCP tools:

```text
wine.search_bottles
wine.get_bottle
wine.list_drink_now
wine.list_drink_soon
wine.get_location_inventory
wine.recommend_for_context
```

MCP tools must:

1. require authentication;
2. enforce site memberships;
3. return structured JSON;
4. log tool calls;
5. avoid arbitrary SQL;
6. avoid write actions in MVP.

## 8. Non-Functional Requirements

## 8.1 Security

The system must:

1. require authentication for all non-health endpoints;
2. enforce server-side authorisation;
3. prevent cross-site data leakage;
4. store secrets outside source control;
5. audit meaningful actions;
6. avoid raw SQL endpoints;
7. keep MCP tools narrow;
8. start MCP as read-only.

## 8.2 Reliability

The system must:

1. keep D1 as the source of truth;
2. allow Vectorize index rebuild from D1;
3. support manual export backup;
4. preserve movement history;
5. avoid destructive deletes where soft delete is safer.

## 8.3 Performance

MVP performance target:

```text
Inventory list: under 500 ms server-side for typical personal cellar
Recommendation response: under 2 seconds without AI-generated prose
Semantic search: under 3 seconds
```

## 8.4 Portability

The schema should be portable to Postgres.

Design choices:

1. use explicit text IDs;
2. keep JSON fields limited and documented;
3. avoid Cloudflare-only business logic in the database;
4. keep migrations in source control;
5. support full CSV/JSON export.

## 8.5 Usability

The app must minimise data-entry friction.

Priorities:

1. fast add bottle;
2. fast search;
3. fast location assignment;
4. partial wine records allowed;
5. later enrichment possible.

## 9. Data Model

## 9.1 Entity relationship overview

```text
users
  └── site_memberships
          └── sites
                ├── locations
                ├── wines
                │     ├── bottles
                │     ├── tastings
                │     └── wine_documents
                ├── bottle_movements
                └── audit_log
```

## 9.2 Tables

### users

```sql
create table users (
  id text primary key,
  clerk_user_id text not null unique,
  primary_email text not null,
  display_name text,
  created_at text not null default current_timestamp,
  updated_at text not null default current_timestamp
);
```

### sites

```sql
create table sites (
  id text primary key,
  name text not null,
  owner_user_id text not null references users(id),
  default_currency text not null default 'AUD',
  notes text,
  created_at text not null default current_timestamp,
  updated_at text not null default current_timestamp
);
```

### site_memberships

```sql
create table site_memberships (
  id text primary key,
  site_id text not null references sites(id),
  user_id text not null references users(id),
  role text not null,
  created_at text not null default current_timestamp,
  updated_at text not null default current_timestamp,
  unique(site_id, user_id)
);
```

### site_invitations

```sql
create table site_invitations (
  id text primary key,
  site_id text not null references sites(id),
  email text not null,
  role text not null,
  invited_by_user_id text not null references users(id),
  accepted_by_user_id text references users(id),
  status text not null default 'pending',
  token_hash text,
  expires_at text,
  created_at text not null default current_timestamp,
  accepted_at text
);
```

### locations

```sql
create table locations (
  id text primary key,
  site_id text not null references sites(id),
  parent_location_id text references locations(id),
  code text not null,
  name text not null,
  type text not null,
  capacity integer,
  sort_order integer,
  active integer not null default 1,
  notes text,
  created_at text not null default current_timestamp,
  updated_at text not null default current_timestamp,
  unique(site_id, code)
);
```

### wines

```sql
create table wines (
  id text primary key,
  site_id text not null references sites(id),

  producer text not null,
  name text,
  vintage integer,
  country text,
  region text,
  subregion text,
  appellation text,

  colour text,
  style text,
  sweetness text,
  body text,
  grapes_json text,

  drink_from_year integer,
  drink_to_year integer,
  drink_window_confidence text,

  personal_priority text,
  special_policy text,
  notes text,

  created_at text not null default current_timestamp,
  updated_at text not null default current_timestamp
);
```

### bottles

```sql
create table bottles (
  id text primary key,
  site_id text not null references sites(id),
  wine_id text not null references wines(id),
  location_id text references locations(id),

  bottle_size_ml integer not null default 750,
  status text not null default 'available',

  purchase_date text,
  purchase_price_aud real,
  replacement_value_aud real,
  source text,

  condition text,
  special integer not null default 0,
  label_image_key text,
  notes text,

  created_at text not null default current_timestamp,
  updated_at text not null default current_timestamp
);
```

### bottle_movements

```sql
create table bottle_movements (
  id text primary key,
  site_id text not null references sites(id),
  bottle_id text not null references bottles(id),
  from_location_id text references locations(id),
  to_location_id text references locations(id),
  reason text,
  moved_at text not null default current_timestamp
);
```

### tastings

```sql
create table tastings (
  id text primary key,
  site_id text not null references sites(id),
  wine_id text not null references wines(id),
  bottle_id text references bottles(id),

  consumed_at text not null,
  rating integer,
  notes text,
  occasion text,
  meal text,
  would_buy_again integer,

  created_at text not null default current_timestamp
);
```

### wine_documents

```sql
create table wine_documents (
  id text primary key,
  site_id text not null references sites(id),
  wine_id text not null references wines(id),
  tasting_id text references tastings(id),

  document_type text not null,
  source text not null,
  text text not null,
  content_hash text not null,

  vector_id text,
  embedding_status text not null default 'pending',
  embedded_at text,

  created_at text not null default current_timestamp,
  updated_at text not null default current_timestamp
);
```

### audit_log

```sql
create table audit_log (
  id text primary key,
  site_id text references sites(id),
  user_id text references users(id),
  actor_type text not null,
  actor_id text,
  action text not null,
  resource_type text,
  resource_id text,
  request_json text,
  result_json text,
  created_at text not null default current_timestamp
);
```

## 10. API Requirements

## 10.1 Auth/session routes

```text
GET /api/me
GET /api/sites
POST /api/sites
```

## 10.2 Site routes

```text
GET    /api/sites
POST   /api/sites
GET    /api/sites/:siteId
PATCH  /api/sites/:siteId
GET    /api/sites/:siteId/members
POST   /api/sites/:siteId/invitations
POST   /api/invitations/:invitationId/accept
```

## 10.3 Location routes

```text
GET    /api/sites/:siteId/locations
POST   /api/sites/:siteId/locations
PATCH  /api/sites/:siteId/locations/:locationId
GET    /api/sites/:siteId/locations/:locationId/inventory
```

## 10.4 Wine routes

```text
GET    /api/sites/:siteId/wines
POST   /api/sites/:siteId/wines
GET    /api/sites/:siteId/wines/:wineId
PATCH  /api/sites/:siteId/wines/:wineId
```

## 10.5 Bottle routes

```text
GET    /api/sites/:siteId/bottles
POST   /api/sites/:siteId/bottles
GET    /api/sites/:siteId/bottles/:bottleId
PATCH  /api/sites/:siteId/bottles/:bottleId
POST   /api/sites/:siteId/bottles/:bottleId/move
POST   /api/sites/:siteId/bottles/:bottleId/consume
```

## 10.6 Recommendation routes

```text
GET  /api/sites/:siteId/recommendations/drink-now
GET  /api/sites/:siteId/recommendations/drink-soon
POST /api/sites/:siteId/recommendations/contextual
```

## 10.7 Import/export routes

```text
POST /api/sites/:siteId/import/csv/preview
POST /api/sites/:siteId/import/csv/commit
GET  /api/sites/:siteId/export/csv
```

## 11. Recommendation Logic

## 11.1 Drink status

Calculate drink status from current year and drink window.

```text
if no drink_from_year or no drink_to_year:
  unknown

else if current_year < drink_from_year:
  too_young

else if current_year > drink_to_year:
  past_window

else if current_year >= drink_to_year - 2:
  drink_soon

else:
  ready
```

## 11.2 Priority score

Initial scoring:

```text
ready: +30
drink_soon: +45
past_window: +20
too_young: -50
unknown: 0

within 1 year of drink_to_year: +20
within 2 years of drink_to_year: +10

multiple bottles available: +10
special bottle: -20 unless occasion is special
replacement value > threshold: -10 unless occasion is special
matches requested style: +15
matches semantic query: +0 to +25
```

## 11.3 Recommendation response shape

```json
{
  "recommendations": [
    {
      "bottle_id": "btl_123",
      "wine_id": "wine_456",
      "display_name": "2017 Tyrrell’s Vat 1 Semillon",
      "location": {
        "id": "loc_123",
        "code": "FRIDGE-S2-L",
        "name": "Wine Fridge Shelf 2 Left"
      },
      "drink_status": "ready",
      "priority_score": 74,
      "reason_codes": [
        "available",
        "inside_drinking_window",
        "multiple_bottles_available",
        "matches_meal",
        "not_marked_special"
      ]
    }
  ]
}
```

## 12. AI and MCP Requirements

## 12.1 MCP endpoint

Expose:

```text
/mcp
```

The endpoint must be authenticated.

## 12.2 Read-only MCP tools

### wine.search_bottles

Search available bottles by structured filters and optional semantic query.

### wine.get_bottle

Return detailed bottle, wine, location, and status information.

### wine.list_drink_now

Return drink-now candidates for a site.

### wine.list_drink_soon

Return drink-soon candidates for a site.

### wine.get_location_inventory

Return bottles in a location.

### wine.recommend_for_context

Return bottle recommendations for a meal, occasion, style, or price constraint.

## 12.3 MCP access rules

Every MCP call must:

1. authenticate the caller;
2. resolve internal user;
3. check site membership;
4. enforce read-only permissions;
5. log the tool call;
6. return only authorised site data.

## 12.4 Future MCP write tools

Do not include these in MVP.

Future tools:

```text
wine.move_bottle
wine.mark_bottle_consumed
wine.add_tasting_note
wine.reserve_bottle
```

Before adding these, implement confirmation, strict validation, and audit logging.

## 13. UI Requirements

## 13.1 MVP screens

Build:

1. Sign in
2. Site switcher
3. Dashboard
4. Inventory
5. Add Wine
6. Wine Detail
7. Bottle Detail
8. Locations
9. Drink Now
10. Drink Soon
11. Site Members
12. Import/Export

## 13.2 Dashboard

Show:

```text
available bottle count
drink-now count
drink-soon count
past-window count
special bottle count
recently added
recently consumed
```

## 13.3 Inventory

Filters:

```text
producer
vintage
region
grape
colour
style
drink status
location
price band
special flag
status
```

## 13.4 Add wine and bottles

Fast path:

```text
Search existing wine
If not found, create wine
Add quantity
Select site
Select location
Optionally enter purchase price/source
Save
```

## 13.5 Locations

Show hierarchy and inventory count.

Example:

```text
Home Cellar
  Rack A — 48 bottles
    Row 1 — 12 bottles
    Row 2 — 12 bottles
  Wine Fridge — 26 bottles
    Shelf 1 — 8 bottles
    Shelf 2 — 9 bottles
```

## 14. Implementation Plan

## Phase 0 — Project setup

### Objectives

Create a deployable baseline.

### Tasks

1. Create repository.
2. Set up TypeScript.
3. Add Hono.
4. Add Zod.
5. Add Drizzle or SQL migration runner.
6. Configure Wrangler.
7. Create dev and prod Cloudflare environments.
8. Create D1 databases.
9. Create Vectorize indexes.
10. Configure Clerk application.
11. Configure Google social login.
12. Configure Apple social login.
13. Add CI checks.

### Acceptance criteria

```text
Worker deploys successfully
Health endpoint responds
D1 binding works
Clerk test sign-in works
Local development works
```

## Phase 1 — Authentication and site model

### Objectives

Implement sign-in, user mapping, sites, memberships, and role checks.

### Tasks

1. Implement Clerk token verification middleware.
2. Create `users`, `sites`, `site_memberships`, and `site_invitations` tables.
3. Implement `GET /api/me`.
4. Implement first-sign-in user creation.
5. Implement create site.
6. Implement list sites.
7. Implement site membership lookup.
8. Implement permission middleware.
9. Implement invitation creation.
10. Implement invitation acceptance.

### Acceptance criteria

```text
A user can sign in with Google
A user can sign in with Apple
A new user row is created
A user can create a site
A user can list only their sites
A non-member cannot access a site
An owner can invite another user
A recipient can accept an invitation
```

## Phase 2 — Locations

### Objectives

Implement hierarchical site locations.

### Tasks

1. Create `locations` table.
2. Implement create location.
3. Implement edit location.
4. Implement deactivate location.
5. Implement list location tree.
6. Implement unique code validation per site.
7. Build Locations UI.

### Acceptance criteria

```text
A site editor can create locations
Locations can be nested
Location codes are unique per site
A viewer can list locations
A non-member cannot list locations
```

## Phase 3 — Wines and bottles

### Objectives

Implement core catalogue and inventory.

### Tasks

1. Create `wines` table.
2. Create `bottles` table.
3. Implement wine CRUD.
4. Implement bottle create.
5. Implement add multiple bottles.
6. Implement bottle edit.
7. Implement bottle status changes.
8. Implement inventory list.
9. Build Add Wine screen.
10. Build Wine Detail screen.
11. Build Inventory screen.
12. Build Bottle Detail screen.

### Acceptance criteria

```text
An editor can create a wine
An editor can add bottles to a wine
An editor can assign bottles to locations
A viewer can see inventory
A bottle belongs to exactly one site
A bottle cannot be assigned to a location in another site
```

## Phase 4 — Movements and consumption

### Objectives

Track bottle movements and consumption history.

### Tasks

1. Create `bottle_movements` table.
2. Create `tastings` table.
3. Implement move bottle endpoint.
4. Implement consume bottle endpoint.
5. Add optional tasting note during consumption.
6. Show movement history on bottle detail.
7. Show tasting history on wine detail.

### Acceptance criteria

```text
Moving a bottle changes its current location
Moving a bottle records movement history
Consuming a bottle changes status to consumed
Consumed bottles disappear from available inventory
A tasting note can be created during consumption
```

## Phase 5 — Deterministic recommendations

### Objectives

Implement drink-now, drink-soon, and contextual recommendations without vector search.

### Tasks

1. Implement drink status calculation.
2. Implement priority score.
3. Implement reason-code generation.
4. Implement drink-now endpoint.
5. Implement drink-soon endpoint.
6. Implement contextual recommendation endpoint using structured filters.
7. Build Drink Now UI.
8. Build Drink Soon UI.

### Acceptance criteria

```text
Drink Now lists available bottles inside their drink window
Drink Soon lists available bottles near the end of their window
Recommendations include location
Recommendations include priority score
Recommendations include reason codes
Unavailable bottles are never recommended
Too-young bottles are not recommended unless explicitly requested
```

## Phase 6 — Import/export

### Objectives

Make data portable and easy to seed.

### Tasks

1. Define CSV import format.
2. Implement CSV parser.
3. Implement import preview.
4. Implement import commit.
5. Implement CSV export.
6. Add export UI.
7. Add import UI.
8. Add validation errors.

### Acceptance criteria

```text
A user can export all site data
A user can preview CSV import
A user can commit valid import rows
Invalid rows are reported clearly
Import does not create cross-site data
```

## Phase 7 — Vectorize semantic search

### Objectives

Add semantic lookup over notes and profiles.

### Tasks

1. Create `wine_documents` table.
2. Generate wine profile documents.
3. Generate tasting note documents.
4. Add embedding worker/service.
5. Upsert vectors into Vectorize.
6. Implement semantic search service.
7. Implement hybrid recommendation merge.
8. Add semantic query field to contextual recommendation.

### Acceptance criteria

```text
Wine documents are generated from source records
Documents are embedded and indexed
Vector search returns wine IDs
Final recommendations still require available bottles from D1
Semantic search improves meal/style matching
Vector index can be rebuilt from D1
```

## Phase 8 — Read-only MCP

### Objectives

Expose safe AI tools.

### Tasks

1. Implement `/mcp` endpoint.
2. Implement MCP auth flow.
3. Implement read-only MCP tools.
4. Add Zod schemas for tool inputs.
5. Add audit logging for MCP calls.
6. Test with MCP-compatible client.
7. Test with ChatGPT Developer Mode if available.

### Acceptance criteria

```text
MCP endpoint requires authentication
MCP tools enforce site membership
MCP tools are read-only
MCP search returns authorised bottles only
MCP recommendations include exact location and reason codes
MCP calls are logged
```

## Phase 9 — R2 images and OCR, later

### Objectives

Support label images and searchable OCR.

### Tasks

1. Create R2 bucket.
2. Add image upload.
3. Store image key on bottle.
4. Add image display on bottle detail.
5. Add OCR pipeline.
6. Store OCR output as wine document.
7. Embed OCR text.

### Acceptance criteria

```text
Photos are stored in R2, not D1
Bottle detail can show label image
OCR text is searchable
OCR-derived documents can be rebuilt
```

## 15. MVP Definition

The MVP is complete when the following are true:

```text
User can sign in with Google or Apple
User can create a site
User can create locations
User can create wines
User can add bottles
User can move bottles
User can mark bottles consumed
User can view inventory
User can view Drink Now
User can view Drink Soon
User can invite another user to a site
Site permissions are enforced server-side
CSV export works
The app is deployed to Cloudflare
```

MCP and Vectorize are important but can be classified as MVP-plus if schedule pressure exists.

## 16. Suggested Delivery Order

Recommended delivery sequence:

```text
1. Auth + site model
2. Locations
3. Wines + bottles
4. Movement + consumption
5. Recommendation rules
6. Import/export
7. Vectorize
8. MCP
9. Images/OCR
```

Do not implement Vectorize or MCP before the inventory model is stable. AI recommendations are only useful once the underlying cellar data is correct.

## 17. Engineering Milestones

### Milestone 1 — Private cellar foundation

Deliver:

```text
Clerk auth
users
sites
memberships
locations
wines
bottles
basic UI
```

### Milestone 2 — Reliable inventory

Deliver:

```text
move bottle
consume bottle
tastings
inventory search
location inventory
CSV export
```

### Milestone 3 — Useful recommendations

Deliver:

```text
drink status
priority score
reason codes
drink now
drink soon
contextual recommendations
```

### Milestone 4 — Sharing

Deliver:

```text
site invitations
role changes
member removal
viewer/editor enforcement
```

### Milestone 5 — AI readiness

Deliver:

```text
wine documents
Vectorize search
hybrid recommendation
read-only MCP tools
audit logs
```

## 18. Risks and Mitigations

## 18.1 Data entry friction

Risk:

```text
The catalogue becomes stale because adding and moving bottles is too slow.
```

Mitigation:

```text
Fast add workflow
Bulk bottle creation
CSV import
Simple location codes
Partial records allowed
```

## 18.2 Incorrect recommendations

Risk:

```text
The system recommends bottles based on poor drink windows or incomplete data.
```

Mitigation:

```text
Drink-window confidence field
Manual override
Reason codes
Conservative recommendation language
Structured rules before AI explanation
```

## 18.3 Cross-site data leakage

Risk:

```text
A shared user can see bottles from a site they do not belong to.
```

Mitigation:

```text
site_id on every site-owned table
server-side membership checks
permission middleware
integration tests for cross-site denial
```

## 18.4 MCP security

Risk:

```text
An AI client can access or mutate more data than intended.
```

Mitigation:

```text
Read-only MCP first
No arbitrary SQL
Authentication required
Site membership required
Audit every tool call
No write tools until explicit confirmation is implemented
```

## 18.5 Apple private relay email

Risk:

```text
A user invited by real email signs in with Apple private relay email, causing invitation matching to fail.
```

Mitigation:

```text
Use invite tokens
Allow manual approval by owner
Allow users to add secondary emails later
Recommend Google sign-in for invited users if email matching matters
```

## 18.6 Cloudflare portability

Risk:

```text
The app becomes too coupled to Cloudflare.
```

Mitigation:

```text
Keep business logic in TypeScript services
Keep SQL portable
Use explicit IDs
Keep migrations in source control
Support export
Treat Vectorize as rebuildable
```

## 19. Initial Task Breakdown

## 19.1 Repository and infrastructure

```text
Create Cloudflare Worker project
Configure Wrangler
Configure D1 dev/prod
Configure Clerk app
Configure environment variables
Set up migrations
Set up CI lint/test/build
```

## 19.2 Backend foundation

```text
Add Hono router
Add request context
Add Clerk auth middleware
Add current-user resolver
Add permission middleware
Add error handling
Add audit logger
```

## 19.3 Database migrations

```text
001_users_sites_memberships.sql
002_locations.sql
003_wines_bottles.sql
004_movements_tastings.sql
005_wine_documents.sql
006_audit_log.sql
```

## 19.4 Frontend foundation

```text
Sign-in page
Authenticated layout
Site switcher
Navigation
API client
Form components
Table components
```

## 19.5 Core workflows

```text
Create site
Create location
Create wine
Add bottles
Move bottle
Consume bottle
Search inventory
View recommendations
```

## 20. Implementation Notes

## 20.1 IDs

Use application-generated text IDs.

Example prefixes:

```text
usr_
site_
mem_
inv_
loc_
wine_
btl_
mov_
taste_
doc_
audit_
```

This improves debugging and portability.

## 20.2 Status values

Bottle statuses:

```text
available
reserved
consumed
gifted
sold
missing
disposed
```

Invitation statuses:

```text
pending
accepted
revoked
expired
```

Drink statuses:

```text
unknown
too_young
ready
drink_soon
past_window
```

## 20.3 Site-scoped queries

Every site-scoped query should include `site_id`.

Example:

```sql
select *
from bottles
where site_id = ?
  and status = 'available';
```

Do not rely only on joins to infer site access.

## 20.4 Validation

Use Zod for every incoming API request.

Validate:

```text
site ID
role
status
year range
price range
location belongs to site
wine belongs to site
bottle belongs to site
```

## 20.5 Audit logging

Audit:

```text
site created
member invited
member role changed
wine created
bottle added
bottle moved
bottle consumed
MCP tool called
CSV export
CSV import committed
```

Do not audit full auth tokens or secrets.

## 21. Product Success Criteria

The product is successful when:

```text
Adding a normal bottle takes less than 30 seconds
Finding a bottle by location takes less than 10 seconds
Drink Soon reveals bottles the owner would otherwise forget
Recommendations are explainable through reason codes
Site sharing works without data leakage
CSV export gives confidence that data is not locked in
AI recommendations are grounded in actual inventory
```

## 22. Final Build Recommendation

Build the system in this order:

```text
Cloudflare Worker app
Clerk auth
D1 schema
site-based sharing
locations
wines
bottles
recommendation rules
CSV export/import
Vectorize semantic search
read-only MCP
images/OCR
write-capable AI tools
```

The critical architectural decision is to keep D1 as the source of truth and treat AI, MCP, and Vectorize as controlled access and ranking layers. The app should be useful before AI is added; AI should make good data easier to query, not compensate for weak data modelling.
