import { useEffect, useMemo, type ReactElement } from "react";

import {
  compareLocationPath,
  locationPath,
  type LocationFormState,
  type LocationItem,
  type SiteItem,
} from "./inventory-model.ts";

type LocationCreateFormProps = {
  readonly form: LocationFormState;
  readonly locations: readonly LocationItem[];
  readonly sites: readonly SiteItem[];
  readonly updateLocationField: (field: keyof LocationFormState, value: string) => void;
  readonly onSaveLocation: () => Promise<void>;
};

export function LocationCreateForm({
  form,
  locations,
  sites,
  updateLocationField,
  onSaveLocation,
}: LocationCreateFormProps): ReactElement {
  const siteLocations = useMemo(
    () =>
      locations
        .filter((location) => location.siteId === form.siteId)
        .toSorted(compareLocationPath(locations)),
    [form.siteId, locations],
  );
  const parentLocationId = siteLocations.some(
    (location) => location.locationId === form.parentLocationId,
  )
    ? form.parentLocationId
    : "";

  useEffect(() => {
    if (form.parentLocationId !== parentLocationId) {
      updateLocationField("parentLocationId", parentLocationId);
    }
  }, [form.parentLocationId, parentLocationId, updateLocationField]);

  return (
    <form
      className="entry-form compact-form"
      onSubmit={(event) => {
        event.preventDefault();
        // oxlint-disable-next-line no-void
        void onSaveLocation();
      }}
    >
      <div className="field-row">
        <label>
          Site
          <select
            required
            value={form.siteId}
            onChange={(event) => {
              const site = sites.find(
                (candidate) => candidate.siteId === event.currentTarget.value,
              );
              updateLocationField("siteId", site?.siteId ?? "");
              updateLocationField("site", site?.site ?? "");
              updateLocationField("parentLocationId", "");
            }}
          >
            <option value="" disabled>
              {sites.length === 0 ? "Create a site first" : "Select site…"}
            </option>
            {sites.map((site) => (
              <option key={site.siteId} value={site.siteId}>
                {site.site}
              </option>
            ))}
          </select>
        </label>
        <label>
          Inside
          <select
            value={parentLocationId}
            disabled={form.siteId === ""}
            onChange={(event) => {
              updateLocationField("parentLocationId", event.currentTarget.value);
            }}
          >
            <option value="">Top level</option>
            {siteLocations.map((location) => (
              <option key={location.locationId} value={location.locationId}>
                {locationPath(location, locations)}
              </option>
            ))}
          </select>
          <span className="field-hint">
            Choose a containing location only when this is a smaller place inside it.
          </span>
        </label>
      </div>
      <label>
        New location
        <input
          required
          autoComplete="off"
          value={form.location}
          onChange={(event) => {
            updateLocationField("location", event.currentTarget.value);
          }}
          placeholder="left rack"
        />
      </label>
      <button className="primary-action" type="submit">
        Save location
      </button>
    </form>
  );
}
