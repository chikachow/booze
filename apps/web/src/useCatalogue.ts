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

export type MutationCompletion = {
  readonly refresh: "captures" | "catalogue";
  readonly successMessage: string;
};

export type RefreshIssue = {
  readonly message: string;
  readonly refresh: MutationCompletion["refresh"];
};

type CatalogueController = {
  readonly captures: readonly CaptureResource[];
  readonly completeMutation: (completion: MutationCompletion) => Promise<void>;
  readonly items: readonly InventoryItem[];
  readonly loadCaptures: () => Promise<void>;
  readonly loadCatalogue: () => Promise<void>;
  readonly locations: readonly LocationItem[];
  readonly refreshIssue: RefreshIssue | null;
  readonly retryRefresh: () => Promise<void>;
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
  const [refreshIssue, setRefreshIssue] = useState<RefreshIssue | null>(null);

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

  const refresh = useCallback(
    async (scope: MutationCompletion["refresh"]): Promise<void> => {
      if (scope === "captures") {
        await loadCaptures();
      } else {
        await loadCatalogue();
      }
    },
    [loadCaptures, loadCatalogue],
  );

  const completeMutation = useCallback(
    async ({ refresh: scope, successMessage }: MutationCompletion): Promise<void> => {
      try {
        await refresh(scope);
        setRefreshIssue(null);
        setStatus(successMessage);
      } catch {
        const message = `${successMessage} Latest data could not be refreshed.`;
        setRefreshIssue({ message, refresh: scope });
        setStatus(message);
      }
    },
    [refresh],
  );

  const retryRefresh = useCallback(async (): Promise<void> => {
    if (refreshIssue === null) {
      return;
    }
    setStatus("Refreshing latest data...");
    try {
      await refresh(refreshIssue.refresh);
      setRefreshIssue(null);
      setStatus("Latest data refreshed.");
    } catch {
      setStatus("Latest data is still unavailable. Try refreshing again.");
    }
  }, [refresh, refreshIssue]);

  useEffect(() => {
    async function load(): Promise<void> {
      try {
        await loadCatalogue();
        setRefreshIssue(null);
      } catch {
        setStatus("Could not load inventory.");
      }
    }

    void load();
  }, [loadCatalogue]);

  return {
    captures,
    completeMutation,
    items,
    loadCaptures,
    loadCatalogue,
    locations,
    refreshIssue,
    retryRefresh,
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
