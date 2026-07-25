import { RedirectToSignIn, Show, UserButton, useAuth } from "@clerk/react";
import { useCallback, useEffect, useMemo, useState, type ReactElement } from "react";

/* oxlint-disable eslint/no-use-before-define */
// oxlint-disable-next-line import/no-unassigned-import
import "./App.css";
import { BottleModal, type BottleModalSubmit } from "./BottleModal.tsx";
import { CaptureArea, type CaptureSubmitResult } from "./CaptureView.tsx";
import { InventoryArea } from "./InventoryView.tsx";
import { ManagementArea } from "./ManagementView.tsx";
import { useCatalogue } from "./useCatalogue.ts";
import {
  awardSummary,
  criticReviewSummary,
  drinkLabel,
  formStateForItem,
  initialFormState,
  initialCaptureFormState,
  initialLocationFormState,
  initialSiteFormState,
  isDrinkQueueItem,
  locationPath,
  storageLocationPath,
  parseOptionalDecimal,
  parseOptionalVolumeMl,
  parseOptionalYear,
  parseQuantity,
  type Area,
  type AuthMode,
  type BottlePatch,
  type CaptureFormState,
  type FormState,
  type InventoryGrouping,
  type InventoryItem,
  type LocationFormState,
  type LocationItem,
  type SiteFormState,
} from "./inventory-model.ts";

type AppProps = {
  readonly authMode: AuthMode;
};

type CatalogueProps = {
  readonly authMode: AuthMode;
  readonly authControl: ReactElement;
  readonly getAuthHeaders: () => Promise<Record<string, string>>;
};

const drinkStatusOrder = [
  "drink-now",
  "drink-soon",
  "hold",
  "past-window",
  "unknown",
] satisfies readonly InventoryItem["drinkStatus"][];

async function getDevelopmentAuthHeaders(): Promise<Record<string, string>> {
  return { "x-dev-user": "local-browser" };
}

async function setDevelopmentAuthCookie(): Promise<void> {
  if (!("cookieStore" in window)) {
    return;
  }

  await window.cookieStore.set({
    name: "booze_dev_user",
    path: "/",
    sameSite: "lax",
    value: "local-browser",
  });
}

export function App({ authMode }: AppProps): ReactElement {
  useEffect(() => {
    if (authMode === "development") {
      // oxlint-disable-next-line no-void
      void setDevelopmentAuthCookie();
    }
  }, [authMode]);

  if (authMode === "development") {
    return (
      <Catalogue
        authControl={<span className="dev-badge">dev</span>}
        authMode={authMode}
        getAuthHeaders={getDevelopmentAuthHeaders}
      />
    );
  }

  return (
    <>
      <Show when="signed-out">
        <RedirectToSignIn />
      </Show>
      <Show when="signed-in">
        <ClerkCatalogue authMode={authMode} />
      </Show>
    </>
  );
}

function ClerkCatalogue({ authMode }: { readonly authMode: AuthMode }): ReactElement {
  const { getToken } = useAuth();

  const getAuthHeaders = useCallback(async (): Promise<Record<string, string>> => {
    const token = await getToken();
    if (token === null) {
      throw new Error("No Clerk session token available");
    }
    return { authorization: `Bearer ${token}` };
  }, [getToken]);

  return (
    <Catalogue authControl={<UserButton />} authMode={authMode} getAuthHeaders={getAuthHeaders} />
  );
}

function BrandMark(): ReactElement {
  return (
    <div className="brandName-mark" aria-hidden="true">
      <span />
      <span />
      <span />
      <span />
      <span />
      <span />
    </div>
  );
}

function errorMessageFromPayload(value: unknown): string | null {
  if (
    typeof value === "object" &&
    value !== null &&
    "message" in value &&
    typeof value.message === "string" &&
    value.message !== ""
  ) {
    return value.message;
  }
  return null;
}

function captureSubmitErrorMessage(value: unknown): string | null {
  if (
    typeof value === "object" &&
    value !== null &&
    "data" in value &&
    typeof value.data === "object" &&
    value.data !== null &&
    "errorMessage" in value.data &&
    typeof value.data.errorMessage === "string" &&
    value.data.errorMessage !== ""
  ) {
    return value.data.errorMessage;
  }
  return null;
}

function grapeVarietiesFromForm(value: string): readonly string[] {
  return value
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part !== "");
}

function grapeVarieties(item: InventoryItem): readonly string[] {
  return item.grapeVarieties === null ? [] : grapeVarietiesFromForm(item.grapeVarieties);
}

function uniqueSorted(values: readonly string[]): readonly string[] {
  return [...new Set(values.filter((value) => value !== ""))].toSorted((left, right) =>
    left.localeCompare(right),
  );
}

async function responseErrorMessage(response: Response): Promise<string | null> {
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    return null;
  }

  try {
    return errorMessageFromPayload(await response.json());
  } catch {
    return null;
  }
}

function Catalogue({ authMode, authControl, getAuthHeaders }: CatalogueProps): ReactElement {
  const { captures, items, loadCaptures, loadCatalogue, locations, sites, status, setStatus } =
    useCatalogue(getAuthHeaders);
  const [addFormDefaults, setAddFormDefaults] = useState<FormState>(initialFormState);
  const [captureForm, setCaptureForm] = useState<CaptureFormState>(initialCaptureFormState);
  const [editingBottle, setEditingBottle] = useState<InventoryItem | null>(null);
  const [locationForm, setLocationForm] = useState<LocationFormState>(initialLocationFormState);
  const [siteForm, setSiteForm] = useState<SiteFormState>(initialSiteFormState);
  const [editingLocationId, setEditingLocationId] = useState<string | null>(null);
  const [editingLocationName, setEditingLocationName] = useState("");
  const [deletingLocationId, setDeletingLocationId] = useState<string | null>(null);
  const [editingSiteId, setEditingSiteId] = useState<string | null>(null);
  const [editingSiteName, setEditingSiteName] = useState("");
  const [deletingSiteId, setDeletingSiteId] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [varietalFilter, setVarietalFilter] = useState("");
  const [locationFilter, setLocationFilter] = useState("");
  const [drinkStatusFilter, setDrinkStatusFilter] = useState("");
  const [area, setArea] = useState<Area>("inventory");
  const [grouping, setGrouping] = useState<InventoryGrouping>("winery");
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    const defaultSite = sites[0];
    if (defaultSite === undefined) {
      return;
    }
    setAddFormDefaults((current) =>
      current.siteId === ""
        ? { ...current, siteId: defaultSite.siteId, site: defaultSite.site }
        : current,
    );
    setCaptureForm((current) =>
      current.siteId === ""
        ? { ...current, siteId: defaultSite.siteId, site: defaultSite.site }
        : current,
    );
    setLocationForm((current) =>
      current.siteId === ""
        ? { ...current, siteId: defaultSite.siteId, site: defaultSite.site }
        : current,
    );
  }, [sites]);
  const drinkItems = useMemo(() => items.filter((item) => isDrinkQueueItem(item)), [items]);
  const editingForm = useMemo(
    () => (editingBottle === null ? null : formStateForItem(editingBottle)),
    [editingBottle],
  );

  const listedItems = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    return items.filter(
      (item) =>
        (needle === "" ||
          [
            item.site,
            storageLocationPath(item, locations),
            item.position,
            item.wineryName,
            item.brandName,
            item.displayName,
            item.grapeVarieties,
            item.country,
            item.region,
            item.appellation,
            item.classification,
            item.wineType,
            item.alcoholPercent,
            item.bottleVolumeMl,
            item.addressQualification,
            item.barcode,
            item.lotCode,
            item.description,
            item.drinkingAdvice,
            item.labelText,
            item.wineNotes,
            item.bottleNotes,
            criticReviewSummary(item),
            awardSummary(item),
          ]
            .filter((value) => value !== null)
            .some((value) => value.toLowerCase().includes(needle))) &&
        (varietalFilter === "" || grapeVarieties(item).includes(varietalFilter)) &&
        (locationFilter === "" || storageLocationPath(item, locations) === locationFilter) &&
        (drinkStatusFilter === "" || item.drinkStatus === drinkStatusFilter),
    );
  }, [drinkStatusFilter, filter, items, locationFilter, locations, varietalFilter]);

  const varietalOptions = useMemo(
    () => uniqueSorted(items.flatMap((item) => grapeVarieties(item))),
    [items],
  );
  const locationOptions = useMemo(
    () => uniqueSorted(items.map((item) => storageLocationPath(item, locations))),
    [items, locations],
  );
  const drinkStatusOptions = useMemo(
    () =>
      drinkStatusOrder
        .filter((value) => items.some((item) => item.drinkStatus === value))
        .map((value) => ({
          label: drinkLabel(value),
          value,
        })),
    [items],
  );

  function updateLocationField(field: keyof LocationFormState, value: string): void {
    setLocationForm((current) => ({ ...current, [field]: value }));
  }

  function updateSiteField(field: keyof SiteFormState, value: string): void {
    setSiteForm((current) => ({ ...current, [field]: value }));
  }

  async function saveBottle({ awards, criticReviews, form }: BottleModalSubmit): Promise<void> {
    if (form.siteId === "") {
      setStatus("Choose a site before saving the bottle.");
      return;
    }
    setIsSaving(true);
    setStatus("Saving bottle...");

    const response = await fetch("/api/bottles", {
      method: "POST",
      headers: { "content-type": "application/json", ...(await getAuthHeaders()) },
      body: JSON.stringify({
        siteId: form.siteId,
        storageLocationId: form.storageLocationId === "" ? null : form.storageLocationId,
        positionHint: form.position,
        quantity: parseQuantity(form.quantity),
        wine: {
          wineryName: form.wineryName,
          brandName: form.brandName,
          baseName: form.displayName,
          designation: form.displayName,
          displayName: form.displayName,
          vintageYear: parseOptionalYear(form.vintageYear),
          grapeVarieties: grapeVarietiesFromForm(form.grapeVarieties),
          country: form.country,
          region: form.region,
          appellation: form.appellation,
          classification: form.classification,
          wineType: form.wineType,
          wineColor: form.wineColor,
          addressQualification: form.addressQualification,
          alcoholPercent: parseOptionalDecimal(form.alcoholPercent),
          drinkFromYear: parseOptionalYear(form.drinkFromYear),
          drinkToYear: parseOptionalYear(form.drinkToYear),
          description: form.description,
          drinkingAdvice: form.drinkingAdvice,
          labelText: form.labelText,
          sourceUrl: form.sourceUrl,
          notes: form.wineNotes,
        },
        bottle: {
          volumeMl: parseOptionalVolumeMl(form.bottleVolumeMl),
          barcode: form.barcode,
          lotCode: form.lotCode,
          notes: form.bottleNotes,
        },
        labelExtraction:
          form.labelExtractionJson.trim() === ""
            ? undefined
            : { extractedFieldsJson: form.labelExtractionJson },
        criticReviews,
        awards,
      }),
    });

    if (!response.ok) {
      setIsSaving(false);
      setStatus("Bottle was not saved. Check required fields.");
      return;
    }

    setAddFormDefaults({
      ...initialFormState,
      siteId: form.siteId,
      site: form.site,
      storageLocationId: form.storageLocationId,
      location: form.location,
      position: form.position,
    });
    setIsAddOpen(false);
    await loadCatalogue();
    setIsSaving(false);
  }

  async function submitCapture(
    form: CaptureFormState,
    files: readonly File[],
  ): Promise<CaptureSubmitResult> {
    if (form.siteId === "") {
      const message = "Choose a site before submitting the capture.";
      setStatus(message);
      return { kind: "failed", message };
    }
    setIsSaving(true);
    setStatus("Submitting capture...");
    const formData = new FormData();
    formData.append("siteId", form.siteId);
    if (form.storageLocationId !== "") {
      formData.append("storageLocationId", form.storageLocationId);
    }
    formData.append("positionHint", form.position);
    formData.append("quantity", form.quantity);
    for (const file of files) {
      formData.append("images", file);
    }

    const response = await fetch("/api/bottle-captures", {
      method: "POST",
      headers: await getAuthHeaders(),
      body: formData,
    });
    setIsSaving(false);
    if (!response.ok) {
      const message = await responseErrorMessage(response);
      const statusMessage =
        message === null ? "Capture was not submitted." : `Capture failed: ${message}`;
      setStatus(statusMessage);
      return { kind: "failed", message: statusMessage };
    }

    setCaptureForm({
      siteId: form.siteId,
      site: form.site,
      storageLocationId: form.storageLocationId,
      location: form.location,
      position: form.position,
      quantity: "1",
    });
    await loadCatalogue();
    const message = captureSubmitErrorMessage(await response.json());
    if (message !== null) {
      const statusMessage = `Capture saved but not submitted: ${message}`;
      setStatus(statusMessage);
      return { kind: "saved_with_error", message: statusMessage };
    }
    const statusMessage = "Capture submitted. Extraction will run in the background.";
    setStatus(statusMessage);
    return { kind: "submitted", message: statusMessage };
  }

  async function retryCapture(captureId: string): Promise<void> {
    setStatus("Retrying capture...");
    const response = await fetch(`/api/bottle-captures/${captureId}/retry`, {
      method: "POST",
      headers: await getAuthHeaders(),
    });
    if (!response.ok) {
      setStatus("Capture was not retried.");
      return;
    }
    await loadCaptures();
    setStatus("Capture retry started.");
  }

  async function importCapture(captureId: string, wineVintageId?: string): Promise<void> {
    setStatus("Importing capture...");
    const response = await fetch(`/api/bottle-captures/${captureId}/import`, {
      method: "POST",
      headers: { "content-type": "application/json", ...(await getAuthHeaders()) },
      body: JSON.stringify(wineVintageId === undefined ? {} : { wineVintageId }),
    });
    if (!response.ok) {
      const message = await responseErrorMessage(response);
      setStatus(message === null ? "Capture was not imported." : `Import failed: ${message}`);
      return;
    }
    await loadCatalogue();
    setStatus("Capture imported.");
  }

  async function deleteCapture(captureId: string): Promise<void> {
    setStatus("Deleting capture...");
    const response = await fetch(`/api/bottle-captures/${captureId}`, {
      method: "DELETE",
      headers: await getAuthHeaders(),
    });
    if (!response.ok) {
      const message = await responseErrorMessage(response);
      setStatus(message === null ? "Capture was not deleted." : `Delete failed: ${message}`);
      return;
    }
    await loadCaptures();
    setStatus("Capture deleted.");
  }

  async function saveLocation(): Promise<void> {
    if (locationForm.siteId === "") {
      setStatus("Choose a site before saving the location.");
      return;
    }
    setStatus("Saving location...");
    const response = await fetch("/api/storage-locations", {
      method: "POST",
      headers: { "content-type": "application/json", ...(await getAuthHeaders()) },
      body: JSON.stringify({
        siteId: locationForm.siteId,
        parentId: locationForm.parentLocationId === "" ? null : locationForm.parentLocationId,
        name: locationForm.location,
      }),
    });

    if (!response.ok) {
      setStatus("Location was not saved.");
      return;
    }

    setLocationForm((current) => ({ ...current, location: "" }));
    await loadCatalogue();
    setStatus("Location saved.");
  }

  async function saveLocationName(locationId: string): Promise<void> {
    setStatus("Updating location...");
    const response = await fetch(`/api/storage-locations/${locationId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json", ...(await getAuthHeaders()) },
      body: JSON.stringify({ name: editingLocationName }),
    });

    if (!response.ok) {
      setStatus("Location was not updated.");
      return;
    }

    setEditingLocationId(null);
    setEditingLocationName("");
    await loadCatalogue();
    setStatus("Location updated.");
  }

  async function deleteLocation(locationId: string): Promise<void> {
    setStatus("Deleting location...");
    const response = await fetch(`/api/storage-locations/${locationId}`, {
      method: "DELETE",
      headers: await getAuthHeaders(),
    });

    if (!response.ok) {
      setStatus("Location was not deleted.");
      return;
    }

    setDeletingLocationId(null);
    await loadCatalogue();
    setStatus("Location deleted. Bottles stayed in the site without a location.");
  }

  async function saveSite(): Promise<void> {
    setStatus("Saving site...");
    const response = await fetch("/api/sites", {
      method: "POST",
      headers: { "content-type": "application/json", ...(await getAuthHeaders()) },
      body: JSON.stringify({ name: siteForm.site }),
    });

    if (!response.ok) {
      setStatus("Site was not saved.");
      return;
    }

    setSiteForm(initialSiteFormState);
    await loadCatalogue();
    setStatus("Site saved.");
  }

  async function saveSiteName(siteId: string): Promise<void> {
    setStatus("Updating site...");
    const response = await fetch(`/api/sites/${siteId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json", ...(await getAuthHeaders()) },
      body: JSON.stringify({ name: editingSiteName }),
    });

    if (!response.ok) {
      setStatus("Site was not updated.");
      return;
    }

    setEditingSiteId(null);
    setEditingSiteName("");
    await loadCatalogue();
    setStatus("Site updated.");
  }

  async function deleteSite(siteId: string): Promise<void> {
    setStatus("Deleting site...");
    const response = await fetch(`/api/sites/${siteId}`, {
      method: "DELETE",
      headers: await getAuthHeaders(),
    });

    if (!response.ok) {
      setStatus("Site was not deleted.");
      return;
    }

    setDeletingSiteId(null);
    await loadCatalogue();
    setStatus("Site deleted.");
  }

  async function updateBottle({
    bottleId,
    payload,
  }: {
    readonly bottleId: string;
    readonly payload: BottlePatch;
  }): Promise<boolean> {
    setStatus("Updating bottle...");
    const response = await fetch(`/api/bottles/${bottleId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json", ...(await getAuthHeaders()) },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      setStatus("Bottle was not updated.");
      return false;
    }

    await loadCatalogue();
    setStatus("Inventory updated.");
    return true;
  }

  async function deleteBottle(bottleId: string): Promise<boolean> {
    setStatus("Deleting bottle...");
    const response = await fetch(`/api/bottles/${bottleId}`, {
      method: "DELETE",
      headers: await getAuthHeaders(),
    });

    if (!response.ok) {
      setStatus("Bottle was not deleted.");
      return false;
    }

    await loadCatalogue();
    setStatus("Bottle deleted.");
    return true;
  }

  async function saveBottleEdit({ awards, criticReviews, form }: BottleModalSubmit): Promise<void> {
    if (editingBottle === null) {
      return;
    }
    setIsSaving(true);
    const updated = await updateBottle({
      bottleId: editingBottle.bottleId,
      payload: {
        storageLocationId: form.storageLocationId === "" ? null : form.storageLocationId,
        positionHint: form.position,
        wine: {
          wineryName: form.wineryName,
          brandName: form.brandName,
          baseName: form.displayName,
          designation: form.displayName,
          displayName: form.displayName,
          vintageYear: parseOptionalYear(form.vintageYear),
          grapeVarieties: grapeVarietiesFromForm(form.grapeVarieties),
          country: form.country,
          region: form.region,
          appellation: form.appellation,
          classification: form.classification,
          wineType: form.wineType,
          wineColor: form.wineColor,
          alcoholPercent: parseOptionalDecimal(form.alcoholPercent),
          drinkFromYear: parseOptionalYear(form.drinkFromYear),
          drinkToYear: parseOptionalYear(form.drinkToYear),
          description: form.description,
          drinkingAdvice: form.drinkingAdvice,
          labelText: form.labelText,
          sourceUrl: form.sourceUrl,
          notes: form.wineNotes,
        },
        bottle: {
          volumeMl: parseOptionalVolumeMl(form.bottleVolumeMl),
          barcode: form.barcode,
          lotCode: form.lotCode,
          notes: form.bottleNotes,
        },
        labelExtraction:
          form.labelExtractionJson.trim() === ""
            ? undefined
            : { extractedFieldsJson: form.labelExtractionJson },
        criticReviews,
        awards,
      },
    });
    setIsSaving(false);
    if (updated) {
      setEditingBottle(null);
    }
  }

  function openBottleEditor(item: InventoryItem): void {
    setEditingBottle(item);
  }

  function useLocation(location: LocationItem): void {
    setAddFormDefaults((current) => ({
      ...current,
      siteId: location.siteId,
      site: location.site,
      storageLocationId: location.locationId,
      location: locationPath(location, locations),
      position: "",
    }));
    setArea("inventory");
    setIsAddOpen(true);
  }

  return (
    <main className="app-shell">
      <header className="app-header">
        <div className="brand-lockup">
          <BrandMark />
          <div>
            <p>{authMode === "development" ? "Wine cellar - local development" : "Wine cellar"}</p>
            <h1>Booze</h1>
          </div>
        </div>
        {authControl}
      </header>

      <section className="hero-band" aria-label="Cellar summary">
        <div>
          <p>{status}</p>
          <h2>Find the right bottle without digging through boxes.</h2>
        </div>
        <dl>
          <div>
            <dt>Bottles</dt>
            <dd>{items.length}</dd>
          </div>
          <div>
            <dt>Drink queue</dt>
            <dd>{drinkItems.length}</dd>
          </div>
          <div>
            <dt>Captures</dt>
            <dd>{captures.filter((capture) => capture.status !== "imported").length}</dd>
          </div>
        </dl>
      </section>

      <nav className="area-tabs" aria-label="Application areas">
        <button
          className={area === "inventory" ? "is-active" : ""}
          type="button"
          onClick={() => {
            setArea("inventory");
          }}
        >
          Inventory
        </button>
        <button
          className={area === "captures" ? "is-active" : ""}
          type="button"
          onClick={() => {
            setArea("captures");
          }}
        >
          Capture
        </button>
        <button
          className={area === "management" ? "is-active" : ""}
          type="button"
          onClick={() => {
            setArea("management");
          }}
        >
          Storage
        </button>
      </nav>

      {area === "inventory" ? (
        <InventoryArea
          drinkStatusFilter={drinkStatusFilter}
          drinkStatusOptions={drinkStatusOptions}
          filter={filter}
          grouping={grouping}
          items={listedItems}
          locationFilter={locationFilter}
          locationOptions={locationOptions}
          locations={locations}
          varietalFilter={varietalFilter}
          varietalOptions={varietalOptions}
          setDrinkStatusFilter={setDrinkStatusFilter}
          setFilter={setFilter}
          setGrouping={setGrouping}
          setLocationFilter={setLocationFilter}
          setVarietalFilter={setVarietalFilter}
          onAddBottle={() => {
            setIsAddOpen(true);
          }}
          onEditBottle={openBottleEditor}
        />
      ) : area === "captures" ? (
        <CaptureArea
          captures={captures}
          form={captureForm}
          isSaving={isSaving}
          locations={locations}
          sites={sites}
          setForm={setCaptureForm}
          onDelete={deleteCapture}
          onImport={importCapture}
          onRetry={retryCapture}
          onSubmit={submitCapture}
        />
      ) : (
        <ManagementArea
          deletingLocationId={deletingLocationId}
          deletingSiteId={deletingSiteId}
          editingLocationId={editingLocationId}
          editingLocationName={editingLocationName}
          editingSiteId={editingSiteId}
          editingSiteName={editingSiteName}
          locationForm={locationForm}
          locations={locations}
          siteForm={siteForm}
          sites={sites}
          setDeletingLocationId={setDeletingLocationId}
          setDeletingSiteId={setDeletingSiteId}
          setEditingLocationId={setEditingLocationId}
          setEditingLocationName={setEditingLocationName}
          setEditingSiteId={setEditingSiteId}
          setEditingSiteName={setEditingSiteName}
          deleteLocation={deleteLocation}
          deleteSite={deleteSite}
          updateLocationField={updateLocationField}
          updateSiteField={updateSiteField}
          onSaveLocation={saveLocation}
          onSaveLocationName={saveLocationName}
          onSaveSite={saveSite}
          onSaveSiteName={saveSiteName}
          onUseLocation={useLocation}
        />
      )}

      {isAddOpen ? (
        <BottleModal
          form={addFormDefaults}
          isSaving={isSaving}
          locations={locations}
          sites={sites}
          title="Add bottle"
          onClose={() => {
            setIsAddOpen(false);
          }}
          onSubmit={saveBottle}
        />
      ) : null}

      {editingBottle === null || editingForm === null ? null : (
        <BottleModal
          key={editingBottle.bottleId}
          form={editingForm}
          isSaving={isSaving}
          item={editingBottle}
          locations={locations}
          sites={sites}
          title="Edit bottle"
          onClose={() => {
            setEditingBottle(null);
          }}
          onDelete={async () => {
            const deleted = await deleteBottle(editingBottle.bottleId);
            if (deleted) {
              setEditingBottle(null);
            }
          }}
          onMarkConsumed={async () => {
            const updated = await updateBottle({
              bottleId: editingBottle.bottleId,
              payload: { status: "consumed" },
            });
            if (updated) {
              setEditingBottle(null);
            }
          }}
          onSubmit={saveBottleEdit}
        />
      )}
    </main>
  );
}
