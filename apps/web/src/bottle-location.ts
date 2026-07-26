import {
  compareLocationPath,
  locationPath,
  type LocationItem,
  type SiteItem,
} from "./inventory-model.ts";

export type BottleLocationAssignment = {
  readonly location: string;
  readonly site: string;
  readonly siteId: string;
  readonly storageLocationId: string;
};

export function bottleLocationOptions(
  sites: readonly SiteItem[],
  locations: readonly LocationItem[],
): readonly { readonly label: string; readonly value: string }[] {
  return sites.flatMap((site) => [
    {
      label: `${site.site} / No specific location`,
      value: `site:${site.siteId}`,
    },
    ...locations
      .filter((location) => location.siteId === site.siteId)
      .toSorted(compareLocationPath(locations))
      .map((location) => ({
        label: `${site.site} / ${locationPath(location, locations)}`,
        value: `location:${location.locationId}`,
      })),
  ]);
}

export function bottleLocationValue(
  selectedSiteId: string,
  selectedStorageLocationId: string,
  sites: readonly SiteItem[],
  locations: readonly LocationItem[],
): string {
  const siteExists = sites.some((site) => site.siteId === selectedSiteId);
  if (!siteExists) {
    return "";
  }
  return locations.some((location) => location.locationId === selectedStorageLocationId)
    ? `location:${selectedStorageLocationId}`
    : `site:${selectedSiteId}`;
}

export function resolveBottleLocation(
  value: string,
  sites: readonly SiteItem[],
  locations: readonly LocationItem[],
): BottleLocationAssignment {
  if (value.startsWith("site:")) {
    const siteId = value.slice("site:".length);
    const site = sites.find((candidate) => candidate.siteId === siteId);
    return {
      location: "",
      site: site?.site ?? "",
      siteId: site?.siteId ?? "",
      storageLocationId: "",
    };
  }
  if (value.startsWith("location:")) {
    const locationId = value.slice("location:".length);
    const location = locations.find((candidate) => candidate.locationId === locationId);
    const site = sites.find((candidate) => candidate.siteId === location?.siteId);
    return {
      location: location === undefined ? "" : locationPath(location, locations),
      site: site?.site ?? "",
      siteId: site?.siteId ?? "",
      storageLocationId: location?.locationId ?? "",
    };
  }
  return { location: "", site: "", siteId: "", storageLocationId: "" };
}
