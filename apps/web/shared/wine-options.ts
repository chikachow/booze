import type { VintageStatus } from "./wine-identity.ts";

export type WineOption = {
  readonly wineVintageId: string;
  readonly siteId: string;
  readonly displayName: string;
  readonly wineryName: string;
  readonly grapeVarieties: readonly string[];
  readonly vintageYear: number | null;
  readonly vintageStatus: VintageStatus;
  readonly vintageLabel: string;
  readonly region: string | null;
};

export function isWineOption(value: unknown): value is WineOption {
  return (
    typeof value === "object" &&
    value !== null &&
    "wineVintageId" in value &&
    typeof value.wineVintageId === "string" &&
    "siteId" in value &&
    typeof value.siteId === "string" &&
    "displayName" in value &&
    typeof value.displayName === "string" &&
    "wineryName" in value &&
    typeof value.wineryName === "string" &&
    "grapeVarieties" in value &&
    isStringArray(value.grapeVarieties) &&
    "vintageYear" in value &&
    isNullableNumber(value.vintageYear) &&
    "vintageStatus" in value &&
    isVintageStatus(value.vintageStatus) &&
    "vintageLabel" in value &&
    typeof value.vintageLabel === "string" &&
    "region" in value &&
    isNullableString(value.region)
  );
}

export function wineOptionLabel(wine: WineOption): string {
  return [wine.vintageStatus === "unknown" ? "" : wine.vintageLabel, wine.displayName]
    .filter(Boolean)
    .join(" ");
}

function isVintageStatus(value: unknown): value is VintageStatus {
  return value === "year" || value === "non_vintage" || value === "unknown";
}
function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}
function isNullableNumber(value: unknown): value is number | null {
  return value === null || typeof value === "number";
}

function isStringArray(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every((item: unknown) => typeof item === "string");
}
