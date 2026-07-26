import { useEffect, useState, type Dispatch, type SetStateAction } from "react";

import { validateBottleQuantity } from "../shared/quantity.ts";
import { parseGrapeVarieties } from "./bottle-metadata.ts";
import type { BottleModalSubmit, BottleModalSubmitResult } from "./BottleModal.tsx";
import type { CaptureSubmitResult } from "./CaptureView.tsx";
import type { MutationCompletion } from "./useCatalogue.ts";
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
  type BottlePatch,
  type CaptureFormState,
  type FormState,
  type InventoryItem,
  type LocationFormState,
  type LocationItem,
  type SiteFormState,
  type SiteItem,
} from "./inventory-model.ts";
import { useNamedResourceActions, type NamedResourceActions } from "./useNamedResourceActions.ts";

type SharedControllerContext = {
  readonly completeMutation: (completion: MutationCompletion) => Promise<void>;
  readonly getAuthHeaders: () => Promise<Record<string, string>>;
  readonly setStatus: (status: string) => void;
};

export type BottleController = {
  readonly addFormDefaults: FormState;
  readonly deleteBottle: (bottleId: string) => Promise<boolean>;
  readonly editingBottle: InventoryItem | null;
  readonly editingForm: FormState | null;
  readonly isAddOpen: boolean;
  readonly isSaving: boolean;
  readonly openBottleEditor: Dispatch<SetStateAction<InventoryItem | null>>;
  readonly saveBottle: (submission: BottleModalSubmit) => Promise<BottleModalSubmitResult>;
  readonly saveBottleEdit: (submission: BottleModalSubmit) => Promise<BottleModalSubmitResult>;
  readonly setEditingBottle: Dispatch<SetStateAction<InventoryItem | null>>;
  readonly setIsAddOpen: Dispatch<SetStateAction<boolean>>;
  readonly updateBottle: (request: {
    readonly bottleId: string;
    readonly payload: BottlePatch;
  }) => Promise<boolean>;
  readonly useLocation: (location: LocationItem) => void;
};

export type CaptureController = {
  readonly captureForm: CaptureFormState;
  readonly deleteCapture: (captureId: string) => Promise<boolean>;
  readonly importCapture: (captureId: string, wineVintageId?: string) => Promise<boolean>;
  readonly isSaving: boolean;
  readonly retryCapture: (captureId: string) => Promise<boolean>;
  readonly setCaptureForm: Dispatch<SetStateAction<CaptureFormState>>;
  readonly submitCapture: (
    form: CaptureFormState,
    files: readonly File[],
  ) => Promise<CaptureSubmitResult>;
};

export type LocationController = {
  readonly form: LocationFormState;
  readonly resourceActions: NamedResourceActions;
  readonly save: () => Promise<boolean>;
  readonly updateField: (field: keyof LocationFormState, value: string) => void;
};

export type SiteController = {
  readonly form: SiteFormState;
  readonly resourceActions: NamedResourceActions;
  readonly save: () => Promise<boolean>;
  readonly updateField: (field: keyof SiteFormState, value: string) => void;
};

export function useBottleController({
  completeMutation,
  getAuthHeaders,
  locations,
  setStatus,
  writableSites,
}: SharedControllerContext & {
  readonly locations: readonly LocationItem[];
  readonly writableSites: readonly SiteItem[];
}): BottleController {
  const [addFormDefaults, setAddFormDefaults] = useState<FormState>(initialFormState);
  const [editingBottle, setEditingBottle] = useState<InventoryItem | null>(null);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const editingForm = editingBottle === null ? null : formStateForItem(editingBottle);

  useDefaultSite(writableSites, setAddFormDefaults);

  async function saveBottle({
    awards,
    criticReviews,
    form,
  }: BottleModalSubmit): Promise<BottleModalSubmitResult> {
    if (form.siteId === "") {
      const message = "Choose a site before saving the bottle.";
      setStatus(message);
      return { message, ok: false };
    }
    const quantity = validateBottleQuantity(form.quantity);
    if (!quantity.ok) {
      setStatus(quantity.message);
      return { message: quantity.message, ok: false };
    }
    setIsSaving(true);
    setStatus("Saving bottle...");
    try {
      const payload = bottlePayload({ awards, criticReviews, form });
      const response = await fetch("/api/bottles", {
        method: "POST",
        headers: jsonHeaders(await getAuthHeaders()),
        body: JSON.stringify({
          ...payload,
          siteId: form.siteId,
          quantity: quantity.value,
          wine: {
            ...payload.wine,
            addressQualification: form.addressQualification,
          },
        }),
      });
      if (!response.ok) {
        const message = "Bottle was not saved. Check required fields.";
        setStatus(message);
        return { message, ok: false };
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
      await completeMutation({ refresh: "catalogue", successMessage: "Bottle saved." });
      return { ok: true };
    } catch {
      const message = "Bottle was not saved. Check your connection and try again.";
      setStatus(message);
      return { message, ok: false };
    } finally {
      setIsSaving(false);
    }
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
    await completeMutation({ refresh: "catalogue", successMessage: "Inventory updated." });
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
    await completeMutation({ refresh: "catalogue", successMessage: "Bottle deleted." });
    return true;
  }

  async function saveBottleEdit(submission: BottleModalSubmit): Promise<BottleModalSubmitResult> {
    if (editingBottle === null) {
      return { message: "Bottle is no longer available to edit.", ok: false };
    }
    setIsSaving(true);
    try {
      const updated = await updateBottle({
        bottleId: editingBottle.bottleId,
        payload: bottlePayload(submission),
      });
      if (updated) {
        setEditingBottle(null);
        return { ok: true };
      }
      return { message: "Bottle was not updated.", ok: false };
    } catch {
      const message = "Bottle was not updated. Check your connection and try again.";
      setStatus(message);
      return { message, ok: false };
    } finally {
      setIsSaving(false);
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

export function useCaptureController({
  completeMutation,
  getAuthHeaders,
  setStatus,
  writableSites,
}: SharedControllerContext & {
  readonly writableSites: readonly SiteItem[];
}): CaptureController {
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
    const quantity = validateBottleQuantity(form.quantity);
    if (!quantity.ok) {
      setStatus(quantity.message);
      return { kind: "failed", message: quantity.message };
    }
    setIsSaving(true);
    setStatus("Submitting capture...");
    const formData = new FormData();
    formData.append("siteId", form.siteId);
    if (form.storageLocationId !== "") {
      formData.append("storageLocationId", form.storageLocationId);
    }
    formData.append("positionHint", form.position);
    formData.append("quantity", String(quantity.value));
    for (const file of files) {
      formData.append("images", file);
    }
    try {
      const response = await fetch("/api/bottle-captures", {
        method: "POST",
        headers: await getAuthHeaders(),
        body: formData,
      });
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
      let responsePayload: unknown;
      try {
        responsePayload = await response.json();
      } catch {
        const statusMessage = "Capture saved, but its processing state could not be read.";
        await completeMutation({ refresh: "catalogue", successMessage: statusMessage });
        return { kind: "saved_with_error", message: statusMessage };
      }
      const message = captureSubmitErrorMessage(responsePayload);
      if (message !== null) {
        const statusMessage = `Capture saved but not submitted: ${message}`;
        await completeMutation({ refresh: "catalogue", successMessage: statusMessage });
        return { kind: "saved_with_error", message: statusMessage };
      }
      const statusMessage = "Capture submitted. Extraction will run in the background.";
      await completeMutation({ refresh: "catalogue", successMessage: statusMessage });
      return { kind: "submitted", message: statusMessage };
    } catch {
      const message = "Capture was not submitted. Check your connection and try again.";
      setStatus(message);
      return { kind: "failed", message };
    } finally {
      setIsSaving(false);
    }
  }

  async function retryCapture(captureId: string): Promise<boolean> {
    setStatus("Retrying capture...");
    const response = await fetch(`/api/bottle-captures/${captureId}/retry`, {
      method: "POST",
      headers: await getAuthHeaders(),
    });
    if (!response.ok) {
      setStatus("Capture was not retried.");
      return false;
    }
    await completeMutation({ refresh: "captures", successMessage: "Capture retry started." });
    return true;
  }

  async function importCapture(captureId: string, wineVintageId?: string): Promise<boolean> {
    setStatus("Importing capture...");
    const response = await fetch(`/api/bottle-captures/${captureId}/import`, {
      method: "POST",
      headers: jsonHeaders(await getAuthHeaders()),
      body: JSON.stringify(wineVintageId === undefined ? {} : { wineVintageId }),
    });
    if (!response.ok) {
      const message = await responseErrorMessage(response);
      setStatus(message === null ? "Capture was not imported." : `Import failed: ${message}`);
      return false;
    }
    await completeMutation({ refresh: "catalogue", successMessage: "Capture imported." });
    return true;
  }

  async function deleteCapture(captureId: string): Promise<boolean> {
    setStatus("Deleting capture...");
    const response = await fetch(`/api/bottle-captures/${captureId}`, {
      method: "DELETE",
      headers: await getAuthHeaders(),
    });
    if (!response.ok) {
      const message = await responseErrorMessage(response);
      setStatus(message === null ? "Capture was not deleted." : `Delete failed: ${message}`);
      return false;
    }
    await completeMutation({ refresh: "captures", successMessage: "Capture deleted." });
    return true;
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

export function useLocationController({
  completeMutation,
  getAuthHeaders,
  setStatus,
  writableSites,
}: SharedControllerContext & {
  readonly writableSites: readonly SiteItem[];
}): LocationController {
  const [form, setForm] = useState<LocationFormState>(initialLocationFormState);
  const resourceActions = useNamedResourceActions({
    completeMutation,
    getAuthHeaders,
    kind: "location",
    setStatus,
  });
  useDefaultSite(writableSites, setForm);

  function updateField(field: keyof LocationFormState, value: string): void {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function save(): Promise<boolean> {
    if (form.siteId === "") {
      setStatus("Choose a site before saving the location.");
      return false;
    }
    if (form.location.trim() === "") {
      setStatus("Enter a location name before saving.");
      return false;
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
      return false;
    }
    setForm((current) => ({ ...current, location: "" }));
    await completeMutation({ refresh: "catalogue", successMessage: "Location saved." });
    return true;
  }

  return {
    form,
    resourceActions,
    save,
    updateField,
  };
}

export function useSiteController({
  completeMutation,
  getAuthHeaders,
  setStatus,
}: SharedControllerContext): SiteController {
  const [form, setForm] = useState<SiteFormState>(initialSiteFormState);
  const resourceActions = useNamedResourceActions({
    completeMutation,
    getAuthHeaders,
    kind: "site",
    setStatus,
  });

  function updateField(field: keyof SiteFormState, value: string): void {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function save(): Promise<boolean> {
    if (form.site.trim() === "") {
      setStatus("Enter a site name before saving.");
      return false;
    }
    setStatus("Saving site...");
    const response = await fetch("/api/sites", {
      method: "POST",
      headers: jsonHeaders(await getAuthHeaders()),
      body: JSON.stringify({ name: form.site }),
    });
    if (!response.ok) {
      setStatus("Site was not saved.");
      return false;
    }
    setForm(initialSiteFormState);
    await completeMutation({ refresh: "catalogue", successMessage: "Site saved." });
    return true;
  }

  return {
    form,
    resourceActions,
    save,
    updateField,
  };
}

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
      grapeVarieties: parseGrapeVarieties(form.grapeVarieties),
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
