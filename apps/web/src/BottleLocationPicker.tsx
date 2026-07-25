import type { ReactElement } from "react";

import {
  compareLocationPath,
  locationPath,
  type LocationItem,
  type SiteItem,
} from "./inventory-model.ts";

type BottleLocationPickerProps = {
  readonly idPrefix: string;
  readonly locations: readonly LocationItem[];
  readonly selectedSiteId: string;
  readonly selectedStorageLocationId: string;
  readonly sites: readonly SiteItem[];
  readonly disabledSite?: boolean | undefined;
  readonly onChange: (selection: {
    readonly siteId: string;
    readonly site: string;
    readonly storageLocationId: string;
    readonly location: string;
  }) => void;
};

export function BottleLocationPicker({
  disabledSite = false,
  idPrefix,
  locations,
  selectedSiteId,
  selectedStorageLocationId,
  sites,
  onChange,
}: BottleLocationPickerProps): ReactElement {
  const selectedSite = sites.find((site) => site.siteId === selectedSiteId);
  const selectableSites = disabledSite && selectedSite !== undefined ? [selectedSite] : sites;
  const siteLocations = locations
    .filter((location) => location.siteId === selectedSiteId)
    .toSorted(compareLocationPath(locations));
  const selectedStorageLocation = siteLocations.find(
    (location) => location.locationId === selectedStorageLocationId,
  );
  const selectedValue =
    selectedSite === undefined
      ? ""
      : selectedStorageLocation === undefined
        ? `site:${selectedSiteId}`
        : `location:${selectedStorageLocationId}`;

  return (
    <label htmlFor={`${idPrefix}-bottle-location`}>
      Bottle location
      <select
        required
        disabled={selectableSites.length === 0}
        id={`${idPrefix}-bottle-location`}
        value={selectedValue}
        onChange={(event) => {
          const [kind, id] = event.currentTarget.value.split(":");
          if (kind === "site") {
            const site = sites.find((candidate) => candidate.siteId === id);
            onChange({
              siteId: site?.siteId ?? "",
              site: site?.site ?? "",
              storageLocationId: "",
              location: "",
            });
            return;
          }

          const location = locations.find((candidate) => candidate.locationId === id);
          const site = sites.find((candidate) => candidate.siteId === location?.siteId);
          onChange({
            siteId: site?.siteId ?? "",
            site: site?.site ?? "",
            storageLocationId: location?.locationId ?? "",
            location: location === undefined ? "" : locationPath(location, locations),
          });
        }}
      >
        <option value="" disabled>
          {sites.length === 0 ? "Create a site first" : "Choose site or location…"}
        </option>
        {selectableSites.map((site) => (
          <optgroup key={site.siteId} label={site.site}>
            <option value={`site:${site.siteId}`}>{site.site} / No specific location</option>
            {locations
              .filter((location) => location.siteId === site.siteId)
              .toSorted(compareLocationPath(locations))
              .map((location) => (
                <option key={location.locationId} value={`location:${location.locationId}`}>
                  {site.site} / {locationPath(location, locations)}
                </option>
              ))}
          </optgroup>
        ))}
      </select>
      <span className="field-hint">
        {selectedStorageLocation === undefined
          ? "Choose the site, or the most specific known place."
          : selectedStorageLocation.locationType}
      </span>
    </label>
  );
}
