import { RedirectToSignIn, Show, UserButton, useAuth } from "@clerk/react";
import { useCallback, useEffect, useMemo, useState, type ReactElement } from "react";

/* oxlint-disable eslint/no-use-before-define */
// oxlint-disable-next-line import/no-unassigned-import
import "./App.css";
import { BottleModal, type BottleModalSubmit } from "./BottleModal.tsx";
import { CaptureArea, type CaptureSubmitResult } from "./CaptureView.tsx";
import { InventoryArea } from "./InventoryView.tsx";
import { LocationCreateForm } from "./LocationCreateForm.tsx";
import {
  awardSummary,
  apiBottleToInventoryItem,
  apiLocationToLocationItem,
  apiSiteToSiteItem,
  compareLocationPath,
  criticReviewSummary,
  drinkLabel,
  formStateForItem,
  initialFormState,
  initialCaptureFormState,
  initialLocationFormState,
  initialSiteFormState,
  isApiEnvelope,
  isBottleResource,
  isCaptureResource,
  isDrinkQueueItem,
  isSiteResource,
  isStorageLocationResource,
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
  type CaptureResource,
  type FormState,
  type InventoryGrouping,
  type InventoryItem,
  type LocationFormState,
  type LocationItem,
  type SiteFormState,
  type SiteItem,
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
  const [items, setItems] = useState<readonly InventoryItem[]>([]);
  const [captures, setCaptures] = useState<readonly CaptureResource[]>([]);
  const [locations, setLocations] = useState<readonly LocationItem[]>([]);
  const [sites, setSites] = useState<readonly SiteItem[]>([]);
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
  const [status, setStatus] = useState("Loading inventory...");
  const [isSaving, setIsSaving] = useState(false);

  async function loadInventory(): Promise<void> {
    const response = await fetch("/api/bottles", { headers: await getAuthHeaders() });
    if (!response.ok) {
      throw new Error("Inventory request failed");
    }
    const payload: unknown = await response.json();
    if (
      !isApiEnvelope(payload, (data): data is readonly unknown[] => Array.isArray(data)) ||
      !payload.data.every(isBottleResource)
    ) {
      throw new Error("Inventory response was invalid");
    }
    const nextItems = payload.data.map(apiBottleToInventoryItem);
    setItems(nextItems);
    setStatus(
      nextItems.length === 0
        ? "No bottles catalogued yet."
        : `${nextItems.length} bottles available.`,
    );
  }

  async function loadLocations(): Promise<void> {
    const response = await fetch("/api/storage-locations", { headers: await getAuthHeaders() });
    if (!response.ok) {
      throw new Error("Locations request failed");
    }
    const payload: unknown = await response.json();
    if (
      !isApiEnvelope(payload, (data): data is readonly unknown[] => Array.isArray(data)) ||
      !payload.data.every(isStorageLocationResource)
    ) {
      throw new Error("Locations response was invalid");
    }
    setLocations(payload.data.map(apiLocationToLocationItem));
  }

  async function loadSites(): Promise<void> {
    const response = await fetch("/api/sites", { headers: await getAuthHeaders() });
    if (!response.ok) {
      throw new Error("Sites request failed");
    }
    const payload: unknown = await response.json();
    if (
      !isApiEnvelope(payload, (data): data is readonly unknown[] => Array.isArray(data)) ||
      !payload.data.every(isSiteResource)
    ) {
      throw new Error("Sites response was invalid");
    }
    setSites(payload.data.map(apiSiteToSiteItem));
  }

  async function loadCaptures(): Promise<void> {
    const response = await fetch("/api/bottle-captures", { headers: await getAuthHeaders() });
    if (!response.ok) {
      throw new Error("Captures request failed");
    }
    const payload: unknown = await response.json();
    if (
      !isApiEnvelope(payload, (data): data is readonly unknown[] => Array.isArray(data)) ||
      !payload.data.every(isCaptureResource)
    ) {
      throw new Error("Captures response was invalid");
    }
    setCaptures(payload.data);
  }

  async function loadCatalogue(): Promise<void> {
    await Promise.all([loadInventory(), loadLocations(), loadSites(), loadCaptures()]);
  }

  useEffect(() => {
    async function load(): Promise<void> {
      try {
        await loadCatalogue();
      } catch {
        setStatus("Could not load inventory.");
      }
    }

    // oxlint-disable-next-line no-void
    void load();
  }, []);

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

function ManagementArea({
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
                    <p>{site.siteId}</p>
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
                </>
              )}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
