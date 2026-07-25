export type AuthMode = "clerk" | "development";
export type Area = "inventory" | "captures" | "management";
export type InventoryGrouping = "winery" | "storage";

export type ApiEnvelope<T> = {
  readonly data: T;
};

export type BottleResource = {
  readonly id: string;
  readonly wineVintageId: string;
  readonly siteId: string;
  readonly siteName: string;
  readonly storageLocationId: string | null;
  readonly storageLocationName: string | null;
  readonly positionHint: string | null;
  readonly status: string;
  readonly bottleNumber: string | null;
  readonly volumeMl: number;
  readonly barcode: string | null;
  readonly lotCode: string | null;
  readonly bottleNotes: string | null;
  readonly wineryName: string;
  readonly brandName: string | null;
  readonly baseName: string;
  readonly designation: string | null;
  readonly displayName: string;
  readonly vintageYear: number | null;
  readonly vintageLabel: string;
  readonly grapeVarieties: readonly string[];
  readonly country: string | null;
  readonly region: string | null;
  readonly appellation: string | null;
  readonly classification: string | null;
  readonly wineType: string | null;
  readonly wineColor: string | null;
  readonly addressQualification: string | null;
  readonly alcoholPercent: number | null;
  readonly drinkFromYear: number | null;
  readonly drinkToYear: number | null;
  readonly description: string | null;
  readonly drinkingAdvice: string | null;
  readonly labelText: string | null;
  readonly sourceUrl: string | null;
  readonly wineNotes: string | null;
  readonly criticReviews: readonly CriticReviewResource[];
  readonly awards: readonly WineAwardResource[];
  readonly createdAt: string;
};

export type CriticReviewResource = {
  readonly id: string;
  readonly siteId: string;
  readonly wineVintageId: string;
  readonly reviewSourceId: string;
  readonly reviewSourceName: string;
  readonly ratingText: string;
  readonly ratingValue: number | null;
  readonly ratingScale: string | null;
  readonly sourceUrl: string | null;
  readonly reviewedAt: string | null;
  readonly provenance: string | null;
  readonly notes: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
};

export type WineAwardResource = {
  readonly id: string;
  readonly siteId: string;
  readonly wineVintageId: string;
  readonly awardName: string;
  readonly awardLevel: string;
  readonly awardYear: number | null;
  readonly awardBody: string | null;
  readonly category: string | null;
  readonly points: number | null;
  readonly sourceUrl: string | null;
  readonly provenance: string | null;
  readonly notes: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
};

export type StorageLocationResource = {
  readonly id: string;
  readonly siteId: string;
  readonly siteName: string;
  readonly parentId: string | null;
  readonly name: string;
  readonly locationType: string;
  readonly bottleCount: number;
};

export type SiteResource = {
  readonly id: string;
  readonly name: string;
  readonly bottleCount: number;
  readonly locationCount: number;
};

export type CaptureStatus =
  | "queued"
  | "extracting"
  | "importing"
  | "upload_failed"
  | "needs_review"
  | "imported"
  | "failed";

export type CaptureImageResource = {
  readonly imageAssetId: string;
  readonly originalFilename: string | null;
  readonly sortOrder: number;
  readonly contentType: string;
  readonly sizeBytes: number;
  readonly imageUrl: string;
};

export type CaptureRunResource = {
  readonly id: string;
  readonly status: string;
  readonly extractionR2Key: string | null;
  readonly extractionContentType: string | null;
  readonly extractionSizeBytes: number | null;
  readonly importCandidate: unknown;
  readonly matchResult: unknown;
  readonly importResult: unknown;
  readonly errorMessage: string | null;
  readonly errorDetailR2Key: string | null;
  readonly errorDetailContentType: string | null;
  readonly errorDetailSizeBytes: number | null;
  readonly createdAt: string;
  readonly completedAt: string | null;
};

export type CaptureResource = {
  readonly id: string;
  readonly siteId: string;
  readonly siteName: string;
  readonly storageLocationId: string | null;
  readonly storageLocationName: string | null;
  readonly positionHint: string | null;
  readonly quantity: number;
  readonly status: CaptureStatus;
  readonly importedBottleIds: readonly string[];
  readonly errorMessage: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly images: readonly CaptureImageResource[];
  readonly latestRun: CaptureRunResource | null;
};

export type CaptureFormState = {
  siteId: string;
  site: string;
  storageLocationId: string;
  location: string;
  position: string;
  quantity: string;
};

export type InventoryItem = {
  readonly bottleId: string;
  readonly siteId: string;
  readonly site: string;
  readonly locationId: string | null;
  readonly location: string | null;
  readonly position: string | null;
  readonly status: string;
  readonly wineVintageId: string;
  readonly wineryName: string;
  readonly brandName: string | null;
  readonly baseName: string;
  readonly designation: string | null;
  readonly displayName: string;
  readonly vintageYear: number | null;
  readonly vintageLabel: string;
  readonly grapeVarieties: string | null;
  readonly country: string | null;
  readonly region: string | null;
  readonly appellation: string | null;
  readonly classification: string | null;
  readonly wineType: string | null;
  readonly wineColor: string | null;
  readonly alcoholPercent: string | null;
  readonly bottleVolumeMl: string | null;
  readonly addressQualification: string | null;
  readonly barcode: string | null;
  readonly lotCode: string | null;
  readonly drinkFromYear: number | null;
  readonly drinkToYear: number | null;
  readonly description: string | null;
  readonly drinkingAdvice: string | null;
  readonly sourceUrl: string | null;
  readonly wineNotes: string | null;
  readonly bottleNotes: string | null;
  readonly criticReviews: readonly CriticReviewResource[];
  readonly awards: readonly WineAwardResource[];
  readonly labelText: string | null;
  readonly labelExtractionJson: string | null;
  readonly createdAt: string;
  readonly drinkStatus: "drink-now" | "drink-soon" | "hold" | "past-window" | "unknown";
};

export type InventoryResponse = {
  readonly items: readonly InventoryItem[];
};

export type LocationItem = {
  readonly siteId: string;
  readonly site: string;
  readonly locationId: string;
  readonly parentId: string | null;
  readonly location: string;
  readonly locationType: string;
  readonly bottleCount: number;
};

export type LocationsResponse = {
  readonly locations: readonly LocationItem[];
};

export type SiteItem = {
  readonly siteId: string;
  readonly site: string;
  readonly bottleCount: number;
  readonly locationCount: number;
};

export type SitesResponse = {
  readonly sites: readonly SiteItem[];
};

export type FormState = {
  siteId: string;
  site: string;
  storageLocationId: string;
  location: string;
  position: string;
  quantity: string;
  wineryName: string;
  brandName: string;
  displayName: string;
  vintageYear: string;
  grapeVarieties: string;
  country: string;
  region: string;
  appellation: string;
  classification: string;
  wineType: string;
  wineColor: string;
  alcoholPercent: string;
  bottleVolumeMl: string;
  addressQualification: string;
  barcode: string;
  lotCode: string;
  drinkFromYear: string;
  drinkToYear: string;
  description: string;
  drinkingAdvice: string;
  sourceUrl: string;
  wineNotes: string;
  labelText: string;
  labelExtractionJson: string;
  bottleNotes: string;
};

export type LocationFormState = {
  siteId: string;
  site: string;
  parentLocationId: string;
  location: string;
};

export type SiteFormState = {
  site: string;
};

export type BottlePatch = {
  readonly status?: "in_stock" | "consumed";
  readonly storageLocationId?: string | null;
  readonly positionHint?: string;
  readonly bottle?: {
    readonly volumeMl?: number | undefined;
    readonly barcode?: string;
    readonly lotCode?: string;
    readonly notes?: string;
  };
  readonly wine?: {
    readonly wineryName: string;
    readonly brandName: string;
    readonly baseName?: string | undefined;
    readonly designation: string;
    readonly displayName: string;
    readonly vintageYear?: number | undefined;
    readonly grapeVarieties: readonly string[];
    readonly country: string;
    readonly region: string;
    readonly appellation: string;
    readonly classification: string;
    readonly wineType: string;
    readonly wineColor: string;
    readonly alcoholPercent?: number | undefined;
    readonly drinkFromYear?: number | undefined;
    readonly drinkToYear?: number | undefined;
    readonly description: string;
    readonly drinkingAdvice: string;
    readonly labelText: string;
    readonly sourceUrl: string;
    readonly notes: string;
  };
  readonly labelExtraction?:
    | {
        readonly extractedFieldsJson: string;
      }
    | undefined;
  readonly criticReviews?: readonly CriticReviewInput[] | undefined;
  readonly awards?: readonly WineAwardInput[] | undefined;
};

export type CriticReviewInput = {
  readonly id?: string | undefined;
  readonly reviewSourceId?: string | undefined;
  readonly reviewSourceName?: string | undefined;
  readonly ratingText: string;
  readonly ratingValue?: number | undefined;
  readonly ratingScale?: string | undefined;
  readonly sourceUrl?: string | undefined;
  readonly reviewedAt?: string | undefined;
  readonly provenance?: string | undefined;
  readonly notes?: string | undefined;
};

export type WineAwardInput = {
  readonly id?: string | undefined;
  readonly awardName: string;
  readonly awardLevel: string;
  readonly awardYear?: number | undefined;
  readonly awardBody?: string | undefined;
  readonly category?: string | undefined;
  readonly points?: number | undefined;
  readonly sourceUrl?: string | undefined;
  readonly provenance?: string | undefined;
  readonly notes?: string | undefined;
};

export const initialFormState: FormState = {
  siteId: "",
  site: "home",
  storageLocationId: "",
  location: "",
  position: "",
  quantity: "1",
  wineryName: "",
  brandName: "",
  displayName: "",
  vintageYear: "",
  grapeVarieties: "",
  country: "",
  region: "",
  appellation: "",
  classification: "",
  wineType: "",
  wineColor: "",
  alcoholPercent: "",
  bottleVolumeMl: "",
  addressQualification: "",
  barcode: "",
  lotCode: "",
  drinkFromYear: "",
  drinkToYear: "",
  description: "",
  drinkingAdvice: "",
  sourceUrl: "",
  wineNotes: "",
  labelText: "",
  labelExtractionJson: "",
  bottleNotes: "",
};

export const initialLocationFormState: LocationFormState = {
  siteId: "",
  site: "home",
  parentLocationId: "",
  location: "",
};

export const initialSiteFormState: SiteFormState = {
  site: "home",
};

export const initialCaptureFormState: CaptureFormState = {
  siteId: "",
  site: "home",
  storageLocationId: "",
  location: "",
  position: "",
  quantity: "1",
};

export function parseOptionalYear(value: string): number | undefined {
  const trimmed = value.trim();
  if (trimmed === "") {
    return undefined;
  }
  const parsed = Number.parseInt(trimmed, 10);
  return Number.isNaN(parsed) ? undefined : parsed;
}

export function parseOptionalDecimal(value: string): number | undefined {
  const normalised = value.trim().replace("%", "");
  if (normalised === "") {
    return undefined;
  }
  const parsed = Number.parseFloat(normalised);
  return Number.isNaN(parsed) ? undefined : parsed;
}

export function parseOptionalVolumeMl(value: string): number | undefined {
  const normalised = value.trim().toLowerCase();
  if (normalised === "") {
    return undefined;
  }
  const parsed = Number.parseInt(normalised.replace("ml", ""), 10);
  return Number.isNaN(parsed) ? undefined : parsed;
}

export function parseQuantity(value: string): number {
  const quantity = Number.parseInt(value, 10);
  if (Number.isNaN(quantity)) {
    return 1;
  }
  return Math.min(Math.max(quantity, 1), 24);
}

export function wineDisplayBrand(item: InventoryItem): string {
  return item.wineryName;
}

export function bottleTitle(item: InventoryItem): string {
  return [item.vintageLabel, item.displayName].filter((value) => value !== "").join(" ");
}

export function locationPath(location: LocationItem, locations: readonly LocationItem[]): string {
  const locationsById = new Map(locations.map((candidate) => [candidate.locationId, candidate]));
  const parts = [location.location];
  let parentId = location.parentId;
  const seen = new Set([location.locationId]);

  while (parentId !== null && !seen.has(parentId)) {
    const parent = locationsById.get(parentId);
    if (parent === undefined) {
      break;
    }
    parts.unshift(parent.location);
    seen.add(parent.locationId);
    parentId = parent.parentId;
  }

  return parts.join(" / ");
}

export function compareLocationPath(
  locations: readonly LocationItem[],
): (left: LocationItem, right: LocationItem) => number {
  return (left, right) =>
    locationPath(left, locations).localeCompare(locationPath(right, locations));
}

export function storageLocationLabel({
  locationId,
  locationName,
  locations,
}: {
  readonly locationId: string | null;
  readonly locationName: string | null;
  readonly locations: readonly LocationItem[];
}): string {
  const location =
    locationId === null
      ? undefined
      : locations.find((candidate) => candidate.locationId === locationId);
  return location === undefined
    ? (locationName ?? "No storage location")
    : locationPath(location, locations);
}

export function storageLocationPath(
  item: InventoryItem,
  locations: readonly LocationItem[] = [],
): string {
  return storageLocationLabel({
    locationId: item.locationId,
    locationName: item.location,
    locations,
  });
}

export function storagePath(item: InventoryItem, locations: readonly LocationItem[] = []): string {
  return [item.site, storageLocationPath(item, locations), item.position]
    .filter((value) => value !== null && value !== "")
    .join(" / ");
}

function normaliseDisplayText(value: string): string {
  return value.trim().toLowerCase().replaceAll(/\s+/gu, " ");
}

export function bottleSubtitle(
  item: InventoryItem,
  locations: readonly LocationItem[] = [],
): string {
  const brandName = item.brandName?.trim();
  const wineryLabel =
    brandName === undefined ||
    brandName === "" ||
    normaliseDisplayText(brandName) === normaliseDisplayText(item.wineryName)
      ? item.wineryName
      : `${item.wineryName} / ${brandName}`;
  return [wineryLabel, storagePath(item, locations)].filter((value) => value !== "").join(" - ");
}

export function wineOrigin(item: InventoryItem): string {
  return [item.appellation, item.region, item.country]
    .filter((value) => value !== null && value !== "")
    .join(" / ");
}

export function grapeSummary(item: InventoryItem): string {
  return item.grapeVarieties === null || item.grapeVarieties === ""
    ? "Grapes not set"
    : item.grapeVarieties;
}

export function bottleFacts(item: InventoryItem): string {
  return [item.alcoholPercent, item.bottleVolumeMl]
    .filter((value) => value !== null && value !== "")
    .join(" / ");
}

export function drinkWindow(item: InventoryItem): string {
  if (item.drinkFromYear === null && item.drinkToYear === null) {
    return "No window";
  }
  return `${item.drinkFromYear ?? "?"}-${item.drinkToYear ?? "?"}`;
}

export function criticReviewSummary(item: InventoryItem): string {
  return item.criticReviews
    .map((review) => `${review.reviewSourceName}: ${review.ratingText}`)
    .join(" / ");
}

export function awardSummary(item: InventoryItem): string {
  return item.awards
    .map((award) =>
      [
        award.awardLevel,
        award.awardYear === null ? null : award.awardYear.toString(),
        award.awardName,
      ]
        .filter((value) => value !== null && value !== "")
        .join(" - "),
    )
    .join(" / ");
}

function calculateDrinkStatus({
  drinkFromYear,
  drinkToYear,
  now = new Date(),
}: {
  readonly drinkFromYear: number | null;
  readonly drinkToYear: number | null;
  readonly now?: Date;
}): InventoryItem["drinkStatus"] {
  if (drinkFromYear === null && drinkToYear === null) {
    return "unknown";
  }

  const currentYear = now.getUTCFullYear();
  if (drinkToYear !== null && currentYear > drinkToYear) {
    return "past-window";
  }
  if (drinkFromYear !== null && currentYear < drinkFromYear) {
    return "hold";
  }
  if (drinkToYear !== null && drinkToYear - currentYear <= 2) {
    return "drink-soon";
  }
  return "drink-now";
}

export function drinkLabel(status: InventoryItem["drinkStatus"]): string {
  switch (status) {
    case "drink-now":
      return "Drink now";
    case "drink-soon":
      return "Drink soon";
    case "hold":
      return "Hold";
    case "past-window":
      return "Past window";
    case "unknown":
      return "Unknown";
    default: {
      const exhaustive: never = status;
      return exhaustive;
    }
  }
}

function formText(value: string | null): string {
  return value ?? "";
}

function formYear(value: number | null): string {
  return value === null ? "" : String(value);
}

export function formStateForItem(item: InventoryItem): FormState {
  return {
    siteId: item.siteId,
    site: item.site,
    storageLocationId: item.locationId ?? "",
    location: formText(item.location),
    position: formText(item.position),
    quantity: "1",
    wineryName: item.wineryName,
    brandName: formText(item.brandName),
    displayName: item.displayName,
    vintageYear: formYear(item.vintageYear),
    grapeVarieties: formText(item.grapeVarieties),
    country: formText(item.country),
    region: formText(item.region),
    appellation: formText(item.appellation),
    classification: formText(item.classification),
    wineType: formText(item.wineType),
    wineColor: formText(item.wineColor),
    alcoholPercent: formText(item.alcoholPercent),
    bottleVolumeMl: formText(item.bottleVolumeMl),
    addressQualification: formText(item.addressQualification),
    barcode: formText(item.barcode),
    lotCode: formText(item.lotCode),
    drinkFromYear: formYear(item.drinkFromYear),
    drinkToYear: formYear(item.drinkToYear),
    description: formText(item.description),
    drinkingAdvice: formText(item.drinkingAdvice),
    sourceUrl: formText(item.sourceUrl),
    wineNotes: formText(item.wineNotes),
    labelText: formText(item.labelText),
    labelExtractionJson: formText(item.labelExtractionJson),
    bottleNotes: formText(item.bottleNotes),
  };
}

export function isDrinkQueueItem(item: InventoryItem): boolean {
  return (
    item.drinkStatus === "drink-now" ||
    item.drinkStatus === "drink-soon" ||
    item.drinkStatus === "past-window"
  );
}

export function isInventoryItem(value: unknown): value is InventoryItem {
  return (
    typeof value === "object" &&
    value !== null &&
    "bottleId" in value &&
    "site" in value &&
    "location" in value &&
    "wineryName" in value &&
    "brandName" in value &&
    "displayName" in value
  );
}

export function isApiEnvelope<T>(
  value: unknown,
  isData: (candidate: unknown) => candidate is T,
): value is ApiEnvelope<T> {
  return typeof value === "object" && value !== null && "data" in value && isData(value.data);
}

export function isBottleResource(value: unknown): value is BottleResource {
  return (
    typeof value === "object" &&
    value !== null &&
    "id" in value &&
    "siteName" in value &&
    "wineryName" in value &&
    "displayName" in value &&
    "grapeVarieties" in value &&
    Array.isArray(value.grapeVarieties)
  );
}

export function isStorageLocationResource(value: unknown): value is StorageLocationResource {
  return (
    typeof value === "object" &&
    value !== null &&
    "id" in value &&
    "siteId" in value &&
    "siteName" in value &&
    "name" in value
  );
}

export function isSiteResource(value: unknown): value is SiteResource {
  return (
    typeof value === "object" &&
    value !== null &&
    "id" in value &&
    "name" in value &&
    "bottleCount" in value &&
    "locationCount" in value
  );
}

export function isCaptureResource(value: unknown): value is CaptureResource {
  return (
    typeof value === "object" &&
    value !== null &&
    "id" in value &&
    "siteName" in value &&
    "status" in value &&
    "images" in value &&
    Array.isArray(value.images)
  );
}

export function apiBottleToInventoryItem(resource: BottleResource): InventoryItem {
  const grapeText = resource.grapeVarieties.join(", ");
  return {
    bottleId: resource.id,
    siteId: resource.siteId,
    site: resource.siteName,
    locationId: resource.storageLocationId,
    location: resource.storageLocationName,
    position: resource.positionHint,
    status: resource.status,
    wineVintageId: resource.wineVintageId,
    wineryName: resource.wineryName,
    brandName: resource.brandName,
    baseName: resource.baseName,
    designation: resource.designation,
    displayName: resource.displayName,
    vintageYear: resource.vintageYear,
    vintageLabel: resource.vintageLabel,
    grapeVarieties: grapeText === "" ? null : grapeText,
    country: resource.country,
    region: resource.region,
    appellation: resource.appellation,
    classification: resource.classification,
    wineType: resource.wineType,
    wineColor: resource.wineColor,
    alcoholPercent:
      resource.alcoholPercent === null ? null : `${resource.alcoholPercent.toString()}%`,
    bottleVolumeMl: `${resource.volumeMl}ml`,
    addressQualification: resource.addressQualification,
    barcode: resource.barcode,
    lotCode: resource.lotCode,
    drinkFromYear: resource.drinkFromYear,
    drinkToYear: resource.drinkToYear,
    description: resource.description,
    drinkingAdvice: resource.drinkingAdvice,
    sourceUrl: resource.sourceUrl,
    wineNotes: resource.wineNotes,
    bottleNotes: resource.bottleNotes,
    criticReviews: resource.criticReviews,
    awards: resource.awards,
    labelText: resource.labelText,
    labelExtractionJson: null,
    createdAt: resource.createdAt,
    drinkStatus: calculateDrinkStatus({
      drinkFromYear: resource.drinkFromYear,
      drinkToYear: resource.drinkToYear,
    }),
  };
}

export function apiLocationToLocationItem(resource: StorageLocationResource): LocationItem {
  return {
    siteId: resource.siteId,
    site: resource.siteName,
    locationId: resource.id,
    parentId: resource.parentId,
    location: resource.name,
    locationType: resource.locationType,
    bottleCount: resource.bottleCount,
  };
}

export function apiSiteToSiteItem(resource: SiteResource): SiteItem {
  return {
    siteId: resource.id,
    site: resource.name,
    bottleCount: resource.bottleCount,
    locationCount: resource.locationCount,
  };
}

export function isInventoryResponse(value: unknown): value is InventoryResponse {
  return (
    typeof value === "object" &&
    value !== null &&
    "items" in value &&
    Array.isArray(value.items) &&
    value.items.every(isInventoryItem)
  );
}

export function isLocationItem(value: unknown): value is LocationItem {
  return (
    typeof value === "object" &&
    value !== null &&
    "siteId" in value &&
    "site" in value &&
    "locationId" in value &&
    "parentId" in value &&
    "location" in value &&
    "locationType" in value
  );
}

export function isLocationsResponse(value: unknown): value is LocationsResponse {
  return (
    typeof value === "object" &&
    value !== null &&
    "locations" in value &&
    Array.isArray(value.locations) &&
    value.locations.every(isLocationItem)
  );
}

export function isSiteItem(value: unknown): value is SiteItem {
  return (
    typeof value === "object" &&
    value !== null &&
    "siteId" in value &&
    "site" in value &&
    "bottleCount" in value &&
    "locationCount" in value
  );
}

export function isSitesResponse(value: unknown): value is SitesResponse {
  return (
    typeof value === "object" &&
    value !== null &&
    "sites" in value &&
    Array.isArray(value.sites) &&
    value.sites.every(isSiteItem)
  );
}
