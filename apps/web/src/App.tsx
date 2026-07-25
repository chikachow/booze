import { RedirectToSignIn, Show, UserButton, useAuth } from "@clerk/react";
import { useCallback, useEffect, useMemo, useState, type ReactElement } from "react";

// oxlint-disable-next-line import/no-unassigned-import -- Vite loads the application stylesheet for its side effect.
import "./App.css";
import { BottleModal } from "./BottleModal.tsx";
import { CaptureArea } from "./CaptureView.tsx";
import { InventoryArea } from "./InventoryView.tsx";
import { ManagementArea } from "./ManagementView.tsx";
import { useCatalogue } from "./useCatalogue.ts";
import {
  useBottleController,
  useCaptureController,
  useLocationController,
  useSiteController,
} from "./useCatalogueControllers.ts";
import {
  awardSummary,
  criticReviewSummary,
  drinkLabel,
  isDrinkQueueItem,
  storageLocationPath,
  type Area,
  type AuthMode,
  type InventoryGrouping,
  type InventoryItem,
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

function Catalogue({ authMode, authControl, getAuthHeaders }: CatalogueProps): ReactElement {
  const { captures, items, loadCaptures, loadCatalogue, locations, sites, status, setStatus } =
    useCatalogue(getAuthHeaders);
  const writableSites = useMemo(
    () => sites.filter((site) => site.role === "owner" || site.role === "editor"),
    [sites],
  );
  const writableSiteIds = useMemo(
    () => new Set(writableSites.map((site) => site.siteId)),
    [writableSites],
  );
  const writableLocations = useMemo(
    () => locations.filter((location) => writableSiteIds.has(location.siteId)),
    [locations, writableSiteIds],
  );
  const [filter, setFilter] = useState("");
  const [varietalFilter, setVarietalFilter] = useState("");
  const [locationFilter, setLocationFilter] = useState("");
  const [drinkStatusFilter, setDrinkStatusFilter] = useState("");
  const [area, setArea] = useState<Area>("inventory");
  const [grouping, setGrouping] = useState<InventoryGrouping>("winery");
  const bottleController = useBottleController({
    getAuthHeaders,
    loadCatalogue,
    locations,
    setArea,
    setStatus,
    writableSites,
  });
  const captureController = useCaptureController({
    getAuthHeaders,
    loadCaptures,
    loadCatalogue,
    setStatus,
    writableSites,
  });
  const locationController = useLocationController({
    getAuthHeaders,
    loadCatalogue,
    setStatus,
    writableSites,
  });
  const siteController = useSiteController({
    getAuthHeaders,
    loadCatalogue,
    setStatus,
  });
  const drinkItems = useMemo(() => items.filter((item) => isDrinkQueueItem(item)), [items]);

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
          editableSiteIds={writableSiteIds}
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
            bottleController.setIsAddOpen(true);
          }}
          onEditBottle={bottleController.openBottleEditor}
        />
      ) : area === "captures" ? (
        <CaptureArea
          captures={captures}
          form={captureController.captureForm}
          isSaving={captureController.isSaving}
          locations={writableLocations}
          sites={writableSites}
          writableSiteIds={writableSiteIds}
          setForm={captureController.setCaptureForm}
          onDelete={captureController.deleteCapture}
          onImport={captureController.importCapture}
          onRetry={captureController.retryCapture}
          onSubmit={captureController.submitCapture}
        />
      ) : (
        <ManagementArea
          locationController={locationController}
          locations={locations}
          siteController={siteController}
          sites={sites}
          writableSiteIds={writableSiteIds}
          onUseLocation={bottleController.useLocation}
        />
      )}

      {bottleController.isAddOpen ? (
        <BottleModal
          form={bottleController.addFormDefaults}
          isSaving={bottleController.isSaving}
          locations={writableLocations}
          sites={writableSites}
          title="Add bottle"
          onClose={() => {
            bottleController.setIsAddOpen(false);
          }}
          onSubmit={bottleController.saveBottle}
        />
      ) : null}

      {bottleController.editingBottle === null || bottleController.editingForm === null ? null : (
        <BottleModal
          key={bottleController.editingBottle.bottleId}
          form={bottleController.editingForm}
          isSaving={bottleController.isSaving}
          item={bottleController.editingBottle}
          locations={writableLocations}
          sites={writableSites}
          title="Edit bottle"
          onClose={() => {
            bottleController.setEditingBottle(null);
          }}
          onDelete={async () => {
            const deleted = await bottleController.deleteBottle(
              bottleController.editingBottle?.bottleId ?? "",
            );
            if (deleted) {
              bottleController.setEditingBottle(null);
            }
          }}
          onMarkConsumed={async () => {
            const updated = await bottleController.updateBottle({
              bottleId: bottleController.editingBottle?.bottleId ?? "",
              payload: { status: "consumed" },
            });
            if (updated) {
              bottleController.setEditingBottle(null);
            }
          }}
          onSubmit={bottleController.saveBottleEdit}
        />
      )}
    </main>
  );
}
