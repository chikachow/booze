import { Badge } from "@astryxdesign/core/Badge";
import { Button } from "@astryxdesign/core/Button";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { TextInput } from "@astryxdesign/core/TextInput";
import { useState, type ReactElement } from "react";

import { LocationCreateForm } from "./LocationCreateForm.tsx";
import { DestructiveActionDialog } from "./DestructiveActionDialog.tsx";
import {
  compareLocationPath,
  locationPath,
  type LocationFormState,
  type LocationItem,
  type SiteFormState,
  type SiteItem,
} from "./inventory-model.ts";
import type { LocationController, SiteController } from "./useCatalogueControllers.ts";

export function ManagementArea({
  locationController,
  locations,
  siteController,
  sites,
  writableSiteIds,
  onUseLocation,
}: {
  readonly locationController: LocationController;
  readonly locations: readonly LocationItem[];
  readonly siteController: SiteController;
  readonly sites: readonly SiteItem[];
  readonly writableSiteIds: ReadonlySet<string>;
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
        deletingSiteId={siteController.deletingId}
        editingSiteId={siteController.editingId}
        editingSiteName={siteController.editingName}
        form={siteController.form}
        sites={sites}
        setDeletingSiteId={siteController.setDeletingId}
        setEditingSiteId={siteController.setEditingId}
        setEditingSiteName={siteController.setEditingName}
        deleteSite={siteController.remove}
        updateSiteField={siteController.updateField}
        onSaveSite={siteController.save}
        onSaveSiteName={siteController.saveName}
      />
      <LocationArea
        deletingLocationId={locationController.deletingId}
        editingLocationId={locationController.editingId}
        editingLocationName={locationController.editingName}
        form={locationController.form}
        locations={locations}
        sites={sites}
        writableSiteIds={writableSiteIds}
        setDeletingLocationId={locationController.setDeletingId}
        setEditingLocationId={locationController.setEditingId}
        setEditingLocationName={locationController.setEditingName}
        deleteLocation={locationController.remove}
        updateLocationField={locationController.updateField}
        onSaveLocation={locationController.save}
        onSaveLocationName={locationController.saveName}
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
  writableSiteIds,
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
  readonly writableSiteIds: ReadonlySet<string>;
  readonly setEditingLocationId: (value: string | null) => void;
  readonly setEditingLocationName: (value: string) => void;
  readonly setDeletingLocationId: (value: string | null) => void;
  readonly deleteLocation: (locationId: string) => Promise<boolean>;
  readonly updateLocationField: (field: keyof LocationFormState, value: string) => void;
  readonly onSaveLocation: () => Promise<boolean>;
  readonly onSaveLocationName: (locationId: string) => Promise<boolean>;
  readonly onUseLocation: (location: LocationItem) => void;
}): ReactElement {
  const [pendingRenameId, setPendingRenameId] = useState<string | null>(null);
  const [renameError, setRenameError] = useState<{
    readonly id: string;
    readonly message: string;
  } | null>(null);

  async function saveLocationName(locationId: string): Promise<void> {
    setPendingRenameId(locationId);
    setRenameError(null);
    try {
      const saved = await onSaveLocationName(locationId);
      if (!saved) {
        setRenameError({ id: locationId, message: "Location was not updated. Try again." });
      }
    } catch {
      setRenameError({
        id: locationId,
        message: "Location was not updated. Check your connection and try again.",
      });
    } finally {
      setPendingRenameId(null);
    }
  }

  return (
    <section className="management-section" aria-labelledby="locations-title">
      <div className="section-heading">
        <h3 id="locations-title">Locations</h3>
      </div>
      <LocationCreateForm
        form={form}
        locations={locations}
        sites={sites.filter((site) => writableSiteIds.has(site.siteId))}
        updateLocationField={updateLocationField}
        onSaveLocation={onSaveLocation}
      />

      {locations.length === 0 ? (
        <EmptyState
          description="Create a site and location before cataloguing the first bottle."
          title="No locations yet"
        />
      ) : (
        <div className="location-grid">
          {locations.toSorted(compareLocationPath(locations)).map((location) => (
            <article className="location-card" key={location.locationId}>
              {editingLocationId === location.locationId ? (
                <form
                  className="inline-edit"
                  onSubmit={(event) => {
                    event.preventDefault();
                    if (editingLocationName.trim() === "") {
                      setRenameError({
                        id: location.locationId,
                        message: "Location name is required.",
                      });
                      return;
                    }
                    if (pendingRenameId !== null) {
                      return;
                    }
                    void saveLocationName(location.locationId);
                  }}
                >
                  <TextInput
                    autoComplete="off"
                    htmlName="locationName"
                    isRequired
                    label="Location display name"
                    status={
                      renameError?.id === location.locationId
                        ? { message: renameError.message, type: "error" }
                        : undefined
                    }
                    value={editingLocationName}
                    onChange={(value: string) => {
                      setEditingLocationName(value);
                      setRenameError(null);
                    }}
                  />
                  <div className="card-actions">
                    <Button
                      isLoading={pendingRenameId === location.locationId}
                      label="Save"
                      type="submit"
                      variant="primary"
                    />
                    <Button
                      label="Cancel"
                      variant="ghost"
                      onClick={() => {
                        setEditingLocationId(null);
                        setEditingLocationName("");
                      }}
                    />
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
                  {writableSiteIds.has(location.siteId) ? (
                    <div className="card-actions">
                      <Button
                        label="Use for bottle"
                        onClick={() => {
                          onUseLocation(location);
                        }}
                      />
                      <Button
                        label="Edit"
                        variant="ghost"
                        onClick={() => {
                          setEditingLocationId(location.locationId);
                          setEditingLocationName(location.location);
                        }}
                      />
                      <Button
                        label="Delete"
                        variant="destructive"
                        onClick={() => {
                          setDeletingLocationId(location.locationId);
                        }}
                      />
                    </div>
                  ) : null}
                </>
              )}
              <DestructiveActionDialog
                actionLabel="Delete location"
                description={`Bottles in ${locationPath(location, locations)} will remain in ${location.site} without a storage location. This action cannot be undone.`}
                failureMessage="Location was not deleted. Try again."
                isOpen={deletingLocationId === location.locationId}
                title={`Delete ${location.location}?`}
                onAction={async () => deleteLocation(location.locationId)}
                onOpenChange={(isOpen: boolean) => {
                  setDeletingLocationId(isOpen ? location.locationId : null);
                }}
              />
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
  readonly deleteSite: (siteId: string) => Promise<boolean>;
  readonly updateSiteField: (field: keyof SiteFormState, value: string) => void;
  readonly onSaveSite: () => Promise<boolean>;
  readonly onSaveSiteName: (siteId: string) => Promise<boolean>;
}): ReactElement {
  const [isSaving, setIsSaving] = useState(false);
  const [siteError, setSiteError] = useState<string | null>(null);
  const [pendingRenameId, setPendingRenameId] = useState<string | null>(null);
  const [renameError, setRenameError] = useState<{
    readonly id: string;
    readonly message: string;
  } | null>(null);

  async function saveSite(): Promise<void> {
    setIsSaving(true);
    setSiteError(null);
    try {
      const saved = await onSaveSite();
      if (!saved) {
        setSiteError("Site was not saved. Try again.");
      }
    } catch {
      setSiteError("Site was not saved. Check your connection and try again.");
    } finally {
      setIsSaving(false);
    }
  }

  async function saveSiteName(siteId: string): Promise<void> {
    setPendingRenameId(siteId);
    setRenameError(null);
    try {
      const saved = await onSaveSiteName(siteId);
      if (!saved) {
        setRenameError({ id: siteId, message: "Site was not updated. Try again." });
      }
    } catch {
      setRenameError({
        id: siteId,
        message: "Site was not updated. Check your connection and try again.",
      });
    } finally {
      setPendingRenameId(null);
    }
  }

  return (
    <section className="management-section" aria-labelledby="sites-title">
      <div className="section-heading">
        <h3 id="sites-title">Sites</h3>
      </div>
      <form
        className="form-stack"
        onSubmit={(event) => {
          event.preventDefault();
          if (form.site.trim() === "") {
            setSiteError("Site name is required.");
            return;
          }
          if (isSaving) {
            return;
          }
          void saveSite();
        }}
      >
        <TextInput
          autoComplete="organization"
          htmlName="siteName"
          isRequired
          label="Site"
          placeholder="Home"
          status={siteError === null ? undefined : { message: siteError, type: "error" }}
          value={form.site}
          onChange={(value: string) => {
            updateSiteField("site", value);
            setSiteError(null);
          }}
        />
        <Button isLoading={isSaving} label="Save site" type="submit" variant="primary" />
      </form>

      {sites.length === 0 ? (
        <EmptyState
          description="Create a site before cataloguing bottles or locations."
          title="No sites yet"
        />
      ) : (
        <div className="location-grid">
          {sites.map((site) => (
            <article className="location-card" key={site.siteId}>
              {editingSiteId === site.siteId ? (
                <form
                  className="inline-edit"
                  onSubmit={(event) => {
                    event.preventDefault();
                    if (editingSiteName.trim() === "") {
                      setRenameError({ id: site.siteId, message: "Site name is required." });
                      return;
                    }
                    if (pendingRenameId !== null) {
                      return;
                    }
                    void saveSiteName(site.siteId);
                  }}
                >
                  <TextInput
                    autoComplete="organization"
                    htmlName="siteName"
                    isRequired
                    label="Site display name"
                    status={
                      renameError?.id === site.siteId
                        ? { message: renameError.message, type: "error" }
                        : undefined
                    }
                    value={editingSiteName}
                    onChange={(value: string) => {
                      setEditingSiteName(value);
                      setRenameError(null);
                    }}
                  />
                  <div className="card-actions">
                    <Button
                      isLoading={pendingRenameId === site.siteId}
                      label="Save"
                      type="submit"
                      variant="primary"
                    />
                    <Button
                      label="Cancel"
                      variant="ghost"
                      onClick={() => {
                        setEditingSiteId(null);
                        setEditingSiteName("");
                      }}
                    />
                  </div>
                </form>
              ) : (
                <>
                  <div>
                    <h3>{site.site}</h3>
                    <p>
                      {site.siteId} · <Badge label={site.role} variant="neutral" />
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
                      <Button
                        label="Edit"
                        onClick={() => {
                          setEditingSiteId(site.siteId);
                          setEditingSiteName(site.site);
                        }}
                      />
                      <Button
                        label="Delete"
                        variant="destructive"
                        onClick={() => {
                          setDeletingSiteId(site.siteId);
                        }}
                      />
                    </div>
                  ) : null}
                </>
              )}
              <DestructiveActionDialog
                actionLabel="Delete site"
                description="This permanently removes the site, its bottles, wine vintages, locations, and membership records. This action cannot be undone."
                failureMessage="Site was not deleted. Try again."
                isOpen={deletingSiteId === site.siteId}
                title={`Delete ${site.site}?`}
                onAction={async () => deleteSite(site.siteId)}
                onOpenChange={(isOpen: boolean) => {
                  setDeletingSiteId(isOpen ? site.siteId : null);
                }}
              />
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
