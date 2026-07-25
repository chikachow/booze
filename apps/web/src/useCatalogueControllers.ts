import { useEffect, useState, type Dispatch, type SetStateAction } from "react";

import type { BottleModalSubmit } from "./BottleModal.tsx";
import type { CaptureSubmitResult } from "./CaptureView.tsx";
import {
  formStateForItem,
  initialCaptureFormState,
  initialFormState,
  initialLocationFormState,
  initialSiteFormState,
  locationPath,
  parseOptionalDecimal,
  parseOptionalVolumeMl,
  parseOptionalYear,
  parseQuantity,
  type Area,
  type BottlePatch,
  type CaptureFormState,
  type FormState,
  type InventoryItem,
  type LocationFormState,
  type LocationItem,
  type SiteFormState,
  type SiteItem,
} from "./inventory-model.ts";

type SharedControllerContext = {
  readonly getAuthHeaders: () => Promise<Record<string, string>>;
  readonly loadCatalogue: () => Promise<void>;
  readonly setStatus: (status: string) => void;
};

function useBottleControllerImpl({
  getAuthHeaders,
  loadCatalogue,
  locations,
  setArea,
  setStatus,
  writableSites,
}: SharedControllerContext & {
  readonly locations: readonly LocationItem[];
  readonly setArea: (area: Area) => void;
  readonly writableSites: readonly SiteItem[];
}) {
  const [addFormDefaults, setAddFormDefaults] = useState<FormState>(initialFormState);
  const [editingBottle, setEditingBottle] = useState<InventoryItem | null>(null);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const editingForm = editingBottle === null ? null : formStateForItem(editingBottle);

  useDefaultSite(writableSites, setAddFormDefaults);

  async function saveBottle({ awards, criticReviews, form }: BottleModalSubmit): Promise<void> {
    if (form.siteId === "") {
      setStatus("Choose a site before saving the bottle.");
      return;
    }
    setIsSaving(true);
    setStatus("Saving bottle...");
    const payload = bottlePayload({ awards, criticReviews, form });
    const response = await fetch("/api/bottles", {
      method: "POST",
      headers: jsonHeaders(await getAuthHeaders()),
      body: JSON.stringify({
        ...payload,
        siteId: form.siteId,
        quantity: parseQuantity(form.quantity),
        wine: {
          ...payload.wine,
          addressQualification: form.addressQualification,
        },
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
      headers: jsonHeaders(await getAuthHeaders()),
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

  async function saveBottleEdit(submission: BottleModalSubmit): Promise<void> {
    if (editingBottle === null) {
      return;
    }
    setIsSaving(true);
    const updated = await updateBottle({
      bottleId: editingBottle.bottleId,
      payload: bottlePayload(submission),
    });
    setIsSaving(false);
    if (updated) {
      setEditingBottle(null);
    }
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

  return {
    addFormDefaults,
    deleteBottle,
    editingBottle,
    editingForm,
    isAddOpen,
    isSaving,
    openBottleEditor: setEditingBottle,
    saveBottle,
    saveBottleEdit,
    setEditingBottle,
    setIsAddOpen,
    updateBottle,
    useLocation,
  };
}

function useCaptureControllerImpl({
  getAuthHeaders,
  loadCaptures,
  loadCatalogue,
  setStatus,
  writableSites,
}: SharedControllerContext & {
  readonly loadCaptures: () => Promise<void>;
  readonly writableSites: readonly SiteItem[];
}) {
  const [captureForm, setCaptureForm] = useState<CaptureFormState>(initialCaptureFormState);
  const [isSaving, setIsSaving] = useState(false);
  useDefaultSite(writableSites, setCaptureForm);

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
      headers: jsonHeaders(await getAuthHeaders()),
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

  return {
    captureForm,
    deleteCapture,
    importCapture,
    isSaving,
    retryCapture,
    setCaptureForm,
    submitCapture,
  };
}

function useLocationControllerImpl({
  getAuthHeaders,
  loadCatalogue,
  setStatus,
  writableSites,
}: SharedControllerContext & {
  readonly writableSites: readonly SiteItem[];
}) {
  const [form, setForm] = useState<LocationFormState>(initialLocationFormState);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  useDefaultSite(writableSites, setForm);

  function updateField(field: keyof LocationFormState, value: string): void {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function save(): Promise<void> {
    if (form.siteId === "") {
      setStatus("Choose a site before saving the location.");
      return;
    }
    setStatus("Saving location...");
    const response = await fetch("/api/storage-locations", {
      method: "POST",
      headers: jsonHeaders(await getAuthHeaders()),
      body: JSON.stringify({
        siteId: form.siteId,
        parentId: form.parentLocationId === "" ? null : form.parentLocationId,
        name: form.location,
      }),
    });
    if (!response.ok) {
      setStatus("Location was not saved.");
      return;
    }
    setForm((current) => ({ ...current, location: "" }));
    await loadCatalogue();
    setStatus("Location saved.");
  }

  async function saveName(locationId: string): Promise<void> {
    setStatus("Updating location...");
    const response = await fetch(`/api/storage-locations/${locationId}`, {
      method: "PATCH",
      headers: jsonHeaders(await getAuthHeaders()),
      body: JSON.stringify({ name: editingName }),
    });
    if (!response.ok) {
      setStatus("Location was not updated.");
      return;
    }
    setEditingId(null);
    setEditingName("");
    await loadCatalogue();
    setStatus("Location updated.");
  }

  async function remove(locationId: string): Promise<void> {
    setStatus("Deleting location...");
    const response = await fetch(`/api/storage-locations/${locationId}`, {
      method: "DELETE",
      headers: await getAuthHeaders(),
    });
    if (!response.ok) {
      setStatus("Location was not deleted.");
      return;
    }
    setDeletingId(null);
    await loadCatalogue();
    setStatus("Location deleted. Bottles stayed in the site without a location.");
  }

  return {
    deletingId,
    editingId,
    editingName,
    form,
    remove,
    save,
    saveName,
    setDeletingId,
    setEditingId,
    setEditingName,
    updateField,
  };
}

function useSiteControllerImpl({
  getAuthHeaders,
  loadCatalogue,
  setStatus,
}: SharedControllerContext) {
  const [form, setForm] = useState<SiteFormState>(initialSiteFormState);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);

  function updateField(field: keyof SiteFormState, value: string): void {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function save(): Promise<void> {
    setStatus("Saving site...");
    const response = await fetch("/api/sites", {
      method: "POST",
      headers: jsonHeaders(await getAuthHeaders()),
      body: JSON.stringify({ name: form.site }),
    });
    if (!response.ok) {
      setStatus("Site was not saved.");
      return;
    }
    setForm(initialSiteFormState);
    await loadCatalogue();
    setStatus("Site saved.");
  }

  async function saveName(siteId: string): Promise<void> {
    setStatus("Updating site...");
    const response = await fetch(`/api/sites/${siteId}`, {
      method: "PATCH",
      headers: jsonHeaders(await getAuthHeaders()),
      body: JSON.stringify({ name: editingName }),
    });
    if (!response.ok) {
      setStatus("Site was not updated.");
      return;
    }
    setEditingId(null);
    setEditingName("");
    await loadCatalogue();
    setStatus("Site updated.");
  }

  async function remove(siteId: string): Promise<void> {
    setStatus("Deleting site...");
    const response = await fetch(`/api/sites/${siteId}`, {
      method: "DELETE",
      headers: await getAuthHeaders(),
    });
    if (!response.ok) {
      setStatus("Site was not deleted.");
      return;
    }
    setDeletingId(null);
    await loadCatalogue();
    setStatus("Site deleted.");
  }

  return {
    deletingId,
    editingId,
    editingName,
    form,
    remove,
    save,
    saveName,
    setDeletingId,
    setEditingId,
    setEditingName,
    updateField,
  };
}

export const useBottleController: typeof useBottleControllerImpl = useBottleControllerImpl;
export const useCaptureController: typeof useCaptureControllerImpl = useCaptureControllerImpl;
export const useLocationController: typeof useLocationControllerImpl = useLocationControllerImpl;
export const useSiteController: typeof useSiteControllerImpl = useSiteControllerImpl;

export type BottleController = ReturnType<typeof useBottleController>;
export type CaptureController = ReturnType<typeof useCaptureController>;
export type LocationController = ReturnType<typeof useLocationController>;
export type SiteController = ReturnType<typeof useSiteController>;

function useDefaultSite<T extends FormState | CaptureFormState | LocationFormState>(
  writableSites: readonly SiteItem[],
  setForm: Dispatch<SetStateAction<T>>,
): void {
  useEffect(() => {
    const writableSiteIds = new Set(writableSites.map((site) => site.siteId));
    const defaultSite = writableSites[0];
    setForm((current) =>
      writableSiteIds.has(current.siteId)
        ? current
        : {
            ...current,
            siteId: defaultSite?.siteId ?? "",
            site: defaultSite?.site ?? "",
            storageLocationId: "",
            location: "",
            ...("parentLocationId" in current ? { parentLocationId: "" } : {}),
          },
    );
  }, [setForm, writableSites]);
}

function bottlePayload({ awards, criticReviews, form }: BottleModalSubmit): BottlePatch {
  return {
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
  };
}

function grapeVarietiesFromForm(value: string): readonly string[] {
  return value
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part !== "");
}

function jsonHeaders(authHeaders: Record<string, string>): Record<string, string> {
  return { "content-type": "application/json", ...authHeaders };
}

async function responseErrorMessage(response: Response): Promise<string | null> {
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    return null;
  }
  try {
    const value: unknown = await response.json();
    return typeof value === "object" &&
      value !== null &&
      "message" in value &&
      typeof value.message === "string" &&
      value.message !== ""
      ? value.message
      : null;
  } catch {
    return null;
  }
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
