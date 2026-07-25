// oxlint-disable eslint/no-use-before-define
import type { ReactElement } from "react";

import { LocationCreateForm } from "./LocationCreateForm.tsx";
import {
  compareLocationPath,
  locationPath,
  type LocationFormState,
  type LocationItem,
  type SiteFormState,
  type SiteItem,
} from "./inventory-model.ts";

export function ManagementArea({
  deletingLocationId,
  deletingSiteId,
  editingLocationId,
  editingLocationName,
  editingSiteId,
  editingSiteName,
  locationForm,
  locations,
  siteForm,
  sites,
  setDeletingLocationId,
  setDeletingSiteId,
  setEditingLocationId,
  setEditingLocationName,
  setEditingSiteId,
  setEditingSiteName,
  deleteLocation,
  deleteSite,
  updateLocationField,
  updateSiteField,
  onSaveLocation,
  onSaveLocationName,
  onSaveSite,
  onSaveSiteName,
  onUseLocation,
}: {
  readonly deletingLocationId: string | null;
  readonly deletingSiteId: string | null;
  readonly editingLocationId: string | null;
  readonly editingLocationName: string;
  readonly editingSiteId: string | null;
  readonly editingSiteName: string;
  readonly locationForm: LocationFormState;
  readonly locations: readonly LocationItem[];
  readonly siteForm: SiteFormState;
  readonly sites: readonly SiteItem[];
  readonly setDeletingLocationId: (value: string | null) => void;
  readonly setDeletingSiteId: (value: string | null) => void;
  readonly setEditingLocationId: (value: string | null) => void;
  readonly setEditingLocationName: (value: string) => void;
  readonly setEditingSiteId: (value: string | null) => void;
  readonly setEditingSiteName: (value: string) => void;
  readonly deleteLocation: (locationId: string) => Promise<void>;
  readonly deleteSite: (siteId: string) => Promise<void>;
  readonly updateLocationField: (field: keyof LocationFormState, value: string) => void;
  readonly updateSiteField: (field: keyof SiteFormState, value: string) => void;
  readonly onSaveLocation: () => Promise<void>;
  readonly onSaveLocationName: (locationId: string) => Promise<void>;
  readonly onSaveSite: () => Promise<void>;
  readonly onSaveSiteName: (siteId: string) => Promise<void>;
  readonly onUseLocation: (location: LocationItem) => void;
}): ReactElement {
  return (
    <section className="workspace management-workspace" aria-labelledby="management-title">
      <div className="workspace-header">
        <div>
          <p>Management</p>
          <h2 id="management-title">Sites and locations</h2>
        </div>
      </div>
      <SiteArea
        deletingSiteId={deletingSiteId}
        editingSiteId={editingSiteId}
        editingSiteName={editingSiteName}
        form={siteForm}
        sites={sites}
        setDeletingSiteId={setDeletingSiteId}
        setEditingSiteId={setEditingSiteId}
        setEditingSiteName={setEditingSiteName}
        deleteSite={deleteSite}
        updateSiteField={updateSiteField}
        onSaveSite={onSaveSite}
        onSaveSiteName={onSaveSiteName}
      />
      <LocationArea
        deletingLocationId={deletingLocationId}
        editingLocationId={editingLocationId}
        editingLocationName={editingLocationName}
        form={locationForm}
        locations={locations}
        sites={sites}
        setDeletingLocationId={setDeletingLocationId}
        setEditingLocationId={setEditingLocationId}
        setEditingLocationName={setEditingLocationName}
        deleteLocation={deleteLocation}
        updateLocationField={updateLocationField}
        onSaveLocation={onSaveLocation}
        onSaveLocationName={onSaveLocationName}
        onUseLocation={onUseLocation}
      />
    </section>
  );
}

function LocationArea({
  deletingLocationId,
  editingLocationId,
  editingLocationName,
  form,
  locations,
  sites,
  setEditingLocationId,
  setEditingLocationName,
  setDeletingLocationId,
  deleteLocation,
  updateLocationField,
  onSaveLocation,
  onSaveLocationName,
  onUseLocation,
}: {
  readonly editingLocationId: string | null;
  readonly deletingLocationId: string | null;
  readonly editingLocationName: string;
  readonly form: LocationFormState;
  readonly locations: readonly LocationItem[];
  readonly sites: readonly SiteItem[];
  readonly setEditingLocationId: (value: string | null) => void;
  readonly setEditingLocationName: (value: string) => void;
  readonly setDeletingLocationId: (value: string | null) => void;
  readonly deleteLocation: (locationId: string) => Promise<void>;
  readonly updateLocationField: (field: keyof LocationFormState, value: string) => void;
  readonly onSaveLocation: () => Promise<void>;
  readonly onSaveLocationName: (locationId: string) => Promise<void>;
  readonly onUseLocation: (location: LocationItem) => void;
}): ReactElement {
  return (
    <section className="management-section" aria-labelledby="locations-title">
      <div className="section-heading">
        <h3 id="locations-title">Locations</h3>
      </div>
      <LocationCreateForm
        form={form}
        locations={locations}
        sites={sites}
        updateLocationField={updateLocationField}
        onSaveLocation={onSaveLocation}
      />

      {locations.length === 0 ? (
        <div className="empty-state">
          <h3>No locations yet</h3>
          <p>Create a site and location before cataloguing the first bottle.</p>
        </div>
      ) : (
        <div className="location-grid">
          {locations.toSorted(compareLocationPath(locations)).map((location) => (
            <article className="location-card" key={location.locationId}>
              {deletingLocationId === location.locationId ? (
                <div className="inline-edit">
                  <div>
                    <h3>Delete {locationPath(location, locations)}?</h3>
                    <p>Bottles in this location will stay in {location.site} with no location.</p>
                  </div>
                  <div className="card-actions">
                    <button
                      type="button"
                      onClick={() => {
                        // oxlint-disable-next-line no-void
                        void deleteLocation(location.locationId);
                      }}
                    >
                      Delete
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setDeletingLocationId(null);
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : editingLocationId === location.locationId ? (
                <form
                  className="inline-edit"
                  onSubmit={(event) => {
                    event.preventDefault();
                    // oxlint-disable-next-line no-void
                    void onSaveLocationName(location.locationId);
                  }}
                >
                  <label>
                    Location displayName
                    <input
                      required
                      value={editingLocationName}
                      onChange={(event) => {
                        setEditingLocationName(event.currentTarget.value);
                      }}
                    />
                  </label>
                  <div className="card-actions">
                    <button type="submit">Save</button>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingLocationId(null);
                        setEditingLocationName("");
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              ) : (
                <>
                  <div>
                    <h3>{locationPath(location, locations)}</h3>
                    <p>{location.site}</p>
                  </div>
                  <dl>
                    <div>
                      <dt>Available</dt>
                      <dd>{location.bottleCount} bottles</dd>
                    </div>
                  </dl>
                  <div className="card-actions">
                    <button
                      type="button"
                      onClick={() => {
                        onUseLocation(location);
                      }}
                    >
                      Use for bottle
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingLocationId(location.locationId);
                        setEditingLocationName(location.location);
                      }}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setDeletingLocationId(location.locationId);
                      }}
                    >
                      Delete
                    </button>
                  </div>
                </>
              )}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function SiteArea({
  deletingSiteId,
  editingSiteId,
  editingSiteName,
  form,
  sites,
  setEditingSiteId,
  setEditingSiteName,
  setDeletingSiteId,
  deleteSite,
  updateSiteField,
  onSaveSite,
  onSaveSiteName,
}: {
  readonly editingSiteId: string | null;
  readonly deletingSiteId: string | null;
  readonly editingSiteName: string;
  readonly form: SiteFormState;
  readonly sites: readonly SiteItem[];
  readonly setEditingSiteId: (value: string | null) => void;
  readonly setEditingSiteName: (value: string) => void;
  readonly setDeletingSiteId: (value: string | null) => void;
  readonly deleteSite: (siteId: string) => Promise<void>;
  readonly updateSiteField: (field: keyof SiteFormState, value: string) => void;
  readonly onSaveSite: () => Promise<void>;
  readonly onSaveSiteName: (siteId: string) => Promise<void>;
}): ReactElement {
  return (
    <section className="management-section" aria-labelledby="sites-title">
      <div className="section-heading">
        <h3 id="sites-title">Sites</h3>
      </div>
      <form
        className="entry-form compact-form"
        onSubmit={(event) => {
          event.preventDefault();
          // oxlint-disable-next-line no-void
          void onSaveSite();
        }}
      >
        <label>
          Site
          <input
            required
            autoComplete="off"
            value={form.site}
            onChange={(event) => {
              updateSiteField("site", event.currentTarget.value);
            }}
            placeholder="home"
          />
        </label>
        <button className="primary-action" type="submit">
          Save site
        </button>
      </form>

      {sites.length === 0 ? (
        <div className="empty-state">
          <h3>No sites yet</h3>
          <p>Create a site before cataloguing bottles or locations.</p>
        </div>
      ) : (
        <div className="location-grid">
          {sites.map((site) => (
            <article className="location-card" key={site.siteId}>
              {deletingSiteId === site.siteId ? (
                <div className="inline-edit">
                  <div>
                    <h3>Delete {site.site}?</h3>
                    <p>
                      Bottles, wine vintages, locations, and membership records for this site will
                      be removed.
                    </p>
                  </div>
                  <div className="card-actions">
                    <button
                      type="button"
                      onClick={() => {
                        // oxlint-disable-next-line no-void
                        void deleteSite(site.siteId);
                      }}
                    >
                      Delete
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setDeletingSiteId(null);
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : editingSiteId === site.siteId ? (
                <form
                  className="inline-edit"
                  onSubmit={(event) => {
                    event.preventDefault();
                    // oxlint-disable-next-line no-void
                    void onSaveSiteName(site.siteId);
                  }}
                >
                  <label>
                    Site displayName
                    <input
                      required
                      value={editingSiteName}
                      onChange={(event) => {
                        setEditingSiteName(event.currentTarget.value);
                      }}
                    />
                  </label>
                  <div className="card-actions">
                    <button type="submit">Save</button>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingSiteId(null);
                        setEditingSiteName("");
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              ) : (
                <>
                  <div>
                    <h3>{site.site}</h3>
                    <p>
                      {site.siteId} · {site.role}
                    </p>
                  </div>
                  <dl>
                    <div>
                      <dt>Available</dt>
                      <dd>{site.bottleCount} bottles</dd>
                    </div>
                    <div>
                      <dt>Locations</dt>
                      <dd>{site.locationCount}</dd>
                    </div>
                  </dl>
                  {site.role === "owner" ? (
                    <div className="card-actions">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingSiteId(site.siteId);
                          setEditingSiteName(site.site);
                        }}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setDeletingSiteId(site.siteId);
                        }}
                      >
                        Delete
                      </button>
                    </div>
                  ) : null}
                </>
              )}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
