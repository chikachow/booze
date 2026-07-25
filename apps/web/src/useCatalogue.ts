// oxlint-disable eslint/no-use-before-define
import { useCallback, useEffect, useState, type Dispatch, type SetStateAction } from "react";

import {
  apiBottleToInventoryItem,
  apiLocationToLocationItem,
  apiSiteToSiteItem,
  isApiEnvelope,
  isBottleResource,
  isCaptureResource,
  isSiteResource,
  isStorageLocationResource,
  type CaptureResource,
  type InventoryItem,
  type LocationItem,
  type SiteItem,
} from "./inventory-model.ts";

type AuthHeadersProvider = () => Promise<Record<string, string>>;

type CatalogueController = {
  readonly captures: readonly CaptureResource[];
  readonly items: readonly InventoryItem[];
  readonly loadCaptures: () => Promise<void>;
  readonly loadCatalogue: () => Promise<void>;
  readonly locations: readonly LocationItem[];
  readonly sites: readonly SiteItem[];
  readonly status: string;
  readonly setStatus: Dispatch<SetStateAction<string>>;
};

export function useCatalogue(getAuthHeaders: AuthHeadersProvider): CatalogueController {
  const [items, setItems] = useState<readonly InventoryItem[]>([]);
  const [captures, setCaptures] = useState<readonly CaptureResource[]>([]);
  const [locations, setLocations] = useState<readonly LocationItem[]>([]);
  const [sites, setSites] = useState<readonly SiteItem[]>([]);
  const [status, setStatus] = useState("Loading inventory...");

  const loadInventory = useCallback(async (): Promise<void> => {
    const data = await loadCollection({
      getAuthHeaders,
      isResource: isBottleResource,
      path: "/api/bottles",
      resourceName: "Inventory",
    });
    const nextItems = data.map((item) => apiBottleToInventoryItem(item));
    setItems(nextItems);
    setStatus(
      nextItems.length === 0
        ? "No bottles catalogued yet."
        : `${nextItems.length} bottles available.`,
    );
  }, [getAuthHeaders]);

  const loadLocations = useCallback(async (): Promise<void> => {
    const data = await loadCollection({
      getAuthHeaders,
      isResource: isStorageLocationResource,
      path: "/api/storage-locations",
      resourceName: "Locations",
    });
    setLocations(data.map((location) => apiLocationToLocationItem(location)));
  }, [getAuthHeaders]);

  const loadSites = useCallback(async (): Promise<void> => {
    const data = await loadCollection({
      getAuthHeaders,
      isResource: isSiteResource,
      path: "/api/sites",
      resourceName: "Sites",
    });
    setSites(data.map((site) => apiSiteToSiteItem(site)));
  }, [getAuthHeaders]);

  const loadCaptures = useCallback(async (): Promise<void> => {
    setCaptures(
      await loadCollection({
        getAuthHeaders,
        isResource: isCaptureResource,
        path: "/api/bottle-captures",
        resourceName: "Captures",
      }),
    );
  }, [getAuthHeaders]);

  const loadCatalogue = useCallback(async (): Promise<void> => {
    await Promise.all([loadInventory(), loadLocations(), loadSites(), loadCaptures()]);
  }, [loadCaptures, loadInventory, loadLocations, loadSites]);

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
  }, [loadCatalogue]);

  return {
    captures,
    items,
    loadCaptures,
    loadCatalogue,
    locations,
    sites,
    status,
    setStatus,
  };
}

async function loadCollection<Resource>({
  getAuthHeaders,
  isResource,
  path,
  resourceName,
}: {
  readonly getAuthHeaders: AuthHeadersProvider;
  readonly isResource: (value: unknown) => value is Resource;
  readonly path: string;
  readonly resourceName: string;
}): Promise<readonly Resource[]> {
  const response = await fetch(path, { headers: await getAuthHeaders() });
  if (!response.ok) {
    throw new Error(`${resourceName} request failed`);
  }
  const payload: unknown = await response.json();
  if (
    !isApiEnvelope(payload, (data): data is readonly unknown[] => Array.isArray(data)) ||
    !payload.data.every(isResource)
  ) {
    throw new Error(`${resourceName} response was invalid`);
  }
  return payload.data;
}
