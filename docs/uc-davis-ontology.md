Use a smaller schema with **UC Davis ontology concepts as the spine**, then add only the personal-inventory concepts UC Davis does not model.

Implementation note: the current v1 schema deliberately collapses UC Davis `Wine` and `Vintage` into the `wine_vintages` table. A `wine_vintages` row is the bottle-facing catalogue entry for a labelled wine product, including its vintage or NV label. This keeps wineries, constituents, bottles, locations, and extraction evidence aligned with UC Davis while avoiding a separate parent `wine` table until cross-vintage grouping becomes useful.

UC Davis’s ontology is centred around `Wine`, `Winery`, `Vintage`, `WineType`, `WineColor`, `brandName`, `otherDesignation`, `nameAndAddress`, `alcohol`, `addressQualification`, and `constituent`/`varietal`/`blend`. It also shows shared winery records across wines and vintage-specific blend information. ([GitHub][1]) ([GitHub][1])

## Simplified model

```text
winery
  └── wine_vintage  -- collapsed UC Davis Wine + Vintage
        ├── wine_constituent
        └── bottle
              └── bottle_location
storage_location
label_extraction
```

This removes the earlier over-modelled pieces:

```text
Remove: generic party
Remove: wine_party_role
Remove: wine_format, unless you later need serious format/pack tracking
Remove: external_identifier table, unless you actually integrate LWIN/GTIN/Vivino/etc
Keep: bottle rows, because bottle-specific number/location/status require them
```

## Recommended tables

### 1. `winery`

Aligns to UC Davis `w:Winery`.

```sql
create table winery (
  id uuid primary key,
  name text not null,
  address_text text,
  country text,
  region text,
  established_year int,
  notes text,

  unique (name, coalesce(region, ''))
);
```

UC Davis examples model winery separately and reuse it across multiple wines, for example Inglenook is defined once and referenced by multiple wine records. ([GitHub][1])

### 2. `wine_vintage`

Aligns to UC Davis `w:Wine` plus `w:Vintage` for v1.

This represents the **specific labelled wine product**, including vintage if one exists. Different vintages are distinct rows.

```sql
create table wine_vintage (
  id uuid primary key,
  winery_id uuid references winery(id),

  brand_name text,             -- UC Davis: brandName
  base_name text not null,      -- grouping key for future cross-vintage views
  designation text,            -- UC Davis: otherDesignation
  display_name text not null,  -- practical combined display name
  vintage_year int,             -- null for NV
  vintage_label text not null,  -- '2019', 'NV', 'Solera', etc.

  wine_type text,              -- still, sparkling, fortified, dessert
  wine_color text,             -- red, white, rose
  country text,
  region text,
  appellation text,
  classification text,
  address_qualification text,  -- produced, produced_and_bottled, vinted, etc.
  alcohol_percent numeric(4,2),
  drink_from_year int,
  drink_to_year int,
  description text,
  drinking_advice text,
  label_text text,
  source_url text,

  notes text
);
```

Mapping:

```text
UC Davis w:brandName          → wine_vintage.brand_name
UC Davis w:otherDesignation   → wine_vintage.designation
UC Davis w:type               → wine_vintage.wine_type
UC Davis w:color              → wine_vintage.wine_color
UC Davis w:nameAndAddress     → wine_vintage.winery_id
UC Davis w:addressQualification → wine_vintage.address_qualification
```

This is enough to answer “show me all wine vintages from this winery”:

```sql
select *
from wine_vintage
where winery_id = :winery_id;
```

### 4. `grape_variety`

```sql
create table grape_variety (
  id uuid primary key,
  name text not null unique
);
```

### 5. `wine_constituent`

Aligns to UC Davis `w:constituent`, `w:varietal`, and `w:blend`.

```sql
create table wine_constituent (
  wine_vintage_id uuid not null references wine_vintage(id),
  grape_variety_id uuid not null references grape_variety(id),

  blend_text text,             -- 'Prominent', '82%', 'dominant', etc.
  percentage numeric(5,2),     -- optional parsed value

  primary key (wine_vintage_id, grape_variety_id)
);
```

Do not reduce this to `wine.varietal text`. UC Davis models constituents as structured entries with varietal and blend value; its examples include Cabernet Sauvignon, Cabernet Franc, and Merlot with percentages for a given vintage. ([GitHub][1])

### 6. `bottle`

This is not in the UC Davis wine ontology; it is your inventory layer.

```sql
create table bottle (
  id uuid primary key,
  wine_vintage_id uuid not null references wine_vintage(id),

  bottle_number text,
  volume_ml int default 750,
  barcode text,
  lot_code text,

  status text not null default 'in_stock',
  acquired_at date,
  purchase_price numeric(12,2),
  purchase_currency char(3),

  notes text
);
```

I would put `volume_ml` here for now. It is slightly less pure than a separate `wine_format` table, but much simpler. Add `wine_format` later only if you regularly track 375ml, 750ml, magnum, half-dozen packs, cases, etc.

### 7. `storage_location`

Keep this as a self-referencing tree. This is simpler and more flexible than separate `site`, `location`, `rack`, `shelf`, and `slot` tables.

```sql
create table storage_location (
  id uuid primary key,
  parent_id uuid references storage_location(id),

  name text not null,
  location_type text not null, -- site, area, rack, shelf, bin, slot, other
  notes text,

  unique (parent_id, name)
);
```

Example:

```text
Apartment                     site
  Bar                         area
  Wine racks under stairs     area
    Left rack                 rack
      Shelf 2                 shelf
```

### 8. `bottle_location`

```sql
create table bottle_location (
  bottle_id uuid primary key references bottle(id),
  storage_location_id uuid not null references storage_location(id),

  position_hint text, -- "back left", "middle row", "near the champagne"
  updated_at timestamptz not null default now()
);
```

Keep fuzzy position as text. Do not model exact rack coordinates until you actually need them.

### 9. `label_extraction`

This is evidence/workflow data, not catalogue truth.

```sql
create table label_extraction (
  id uuid primary key,

  bottle_id uuid references bottle(id),
  wine_vintage_id uuid references wine_vintage(id),

  raw_text jsonb,
  extracted_fields jsonb,
  confidence numeric(4,3),
  requires_review boolean not null default false,

  created_at timestamptz not null default now()
);
```

This aligns with your extraction workflow: preserve raw OCR, canonical fields, confidence, and disagreement/review information rather than immediately collapsing AI output into final catalogue data. UC Davis also separates suggested/derived label annotations from the core wine metadata and records where text was found on the label. ([GitHub][1]) ([GitHub][1])

## Practical field mapping from AI extraction

Your extractor fields map cleanly into this simplified model:

```text
producer / winery        → winery.name
brand                    → wine.brand_name
wine_name_or_cuvee       → wine.designation or wine.display_name
vintage                  → wine_vintage.vintage_year / vintage_label
wine_type                → wine.wine_type
grape_varieties          → wine_constituent + grape_variety
alcohol_abv              → wine_vintage.alcohol_percent
volume                   → bottle.volume_ml
barcode                  → bottle.barcode
lot_code                 → bottle.lot_code
region/appellation       → wine.designation or notes for now
```

For now, I would **not** create separate `region`, `appellation`, `classification`, `importer`, `bottler`, or `distributor` tables. Store those in `wine.notes`, `wine_vintage.notes`, or `label_extraction.extracted_fields` until you have enough real bottles to justify normalising them.

## Final simplified schema

```text
winery
wine
wine_vintage
grape_variety
wine_constituent
bottle
storage_location
bottle_location
label_extraction
```

This is the right simplification: UC Davis-aligned wine semantics, plus a thin inventory layer for physical bottles and locations. It avoids turning a personal catalogue into a commercial wine-product master-data system too early.

[1]: https://github.com/UCDavisLibrary/wine-ontology/blob/master/wine-ontology.org "wine-ontology/wine-ontology.org at master · UCDavisLibrary/wine-ontology · GitHub"
