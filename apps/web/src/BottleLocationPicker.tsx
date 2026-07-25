import { Selector } from "@astryxdesign/core/Selector";
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

  const options = selectableSites.flatMap((site) => [
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

  return (
    <Selector
      htmlName={`${idPrefix}.storageLocation`}
      isRequired
      description={
        selectedStorageLocation === undefined
          ? "Choose the site, or the most specific known place."
          : selectedStorageLocation.locationType
      }
      disabledMessage={
        selectableSites.length === 0
          ? "Create a site before assigning a bottle location."
          : undefined
      }
      isDisabled={selectableSites.length === 0}
      label="Bottle location"
      options={options}
      placeholder={sites.length === 0 ? "Create a site first" : "Choose site or location"}
      value={selectedValue}
      onChange={(value: string) => {
        const [kind, id] = value.split(":");
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
    />
  );
}
