import type { CaptureResource, InventoryItem, LocationItem, SiteItem } from "../inventory-model.ts";

const timestamp = "2026-07-25T00:00:00.000Z";

export const sitesFixture = [
  { bottleCount: 3, locationCount: 2, role: "owner", site: "Home cellar", siteId: "site-owner" },
  {
    bottleCount: 1,
    locationCount: 1,
    role: "editor",
    site: "Shared cellar",
    siteId: "site-editor",
  },
  { bottleCount: 8, locationCount: 1, role: "viewer", site: "Archive", siteId: "site-viewer" },
] satisfies readonly SiteItem[];

export const locationsFixture = [
  {
    bottleCount: 2,
    location: "Left rack",
    locationId: "location-left",
    locationType: "rack",
    parentId: null,
    site: "Home cellar",
    siteId: "site-owner",
  },
  {
    bottleCount: 1,
    location: "Top shelf with an intentionally very long descriptive location name",
    locationId: "location-top",
    locationType: "shelf",
    parentId: "location-left",
    site: "Home cellar",
    siteId: "site-owner",
  },
  {
    bottleCount: 1,
    location: "Cupboard",
    locationId: "location-shared",
    locationType: "cabinet",
    parentId: null,
    site: "Shared cellar",
    siteId: "site-editor",
  },
] satisfies readonly LocationItem[];

export function inventoryItemFixture(overrides: Partial<InventoryItem> = {}): InventoryItem {
  return {
    addressQualification: null,
    alcoholPercent: "13.5",
    appellation: "Orange GI",
    awards: [],
    barcode: null,
    baseName: "Pinnacle Series Shiraz",
    bottleId: "bottle-1",
    bottleNotes: null,
    bottleVolumeMl: "750",
    brandName: "Rowlee",
    classification: null,
    country: "Australia",
    createdAt: timestamp,
    criticReviews: [],
    description: "A deterministic fixture bottle used for interaction and accessibility tests.",
    designation: "Pinnacle Series",
    displayName: "Pinnacle Series Shiraz",
    drinkFromYear: 2025,
    drinkStatus: "drink-now",
    drinkToYear: 2032,
    grapeVarieties: "Shiraz",
    labelExtractionJson: null,
    labelText: null,
    location: "Left rack",
    locationId: "location-left",
    lotCode: null,
    position: "Row 3, slot 2",
    region: "Orange",
    site: "Home cellar",
    siteId: "site-owner",
    sourceUrl: "https://example.com/wine",
    status: "in_stock",
    vintageLabel: "2023",
    vintageYear: 2023,
    wineColor: "Red",
    wineNotes: null,
    wineType: "Red wine",
    wineVintageId: "vintage-1",
    wineryName: "Rowlee Wines",
    drinkingAdvice: null,
    ...overrides,
  };
}

export const inventoryFixtures = {
  empty: [] as readonly InventoryItem[],
  one: [inventoryItemFixture()],
  many: [
    inventoryItemFixture(),
    inventoryItemFixture({
      bottleId: "bottle-2",
      displayName:
        "An intentionally long wine name that exercises wrapping without destroying the action layout",
      drinkStatus: "hold",
      position: "A position note with enough content to wrap across several narrow-screen lines",
      wineVintageId: "vintage-2",
    }),
    inventoryItemFixture({
      bottleId: "bottle-3",
      drinkStatus: "past-window",
      location: null,
      locationId: null,
      site: "Archive",
      siteId: "site-viewer",
      wineVintageId: "vintage-3",
    }),
  ],
} as const;

export function captureFixture(overrides: Partial<CaptureResource> = {}): CaptureResource {
  return {
    createdAt: timestamp,
    errorMessage: null,
    id: "capture-1",
    images: [],
    importedBottleIds: [],
    latestRun: null,
    positionHint: null,
    quantity: 1,
    siteId: "site-owner",
    siteName: "Home cellar",
    status: "needs_review",
    storageLocationId: "location-left",
    storageLocationName: "Left rack",
    updatedAt: timestamp,
    ...overrides,
  };
}

export const capturesFixture = [
  captureFixture(),
  captureFixture({ id: "capture-queued", status: "queued" }),
  captureFixture({
    errorMessage: "Malformed upstream response\n" + "Detailed diagnostic content. ".repeat(24),
    id: "capture-failed",
    status: "failed",
  }),
  captureFixture({ id: "capture-imported", status: "imported" }),
] satisfies readonly CaptureResource[];
