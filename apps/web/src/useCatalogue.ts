import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";

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
type CollectionName = "inventory" | "locations" | "sites" | "captures";
type RefreshResult = "refreshed" | "superseded";
type CollectionRequest<Resource> = {
  readonly isResource: (value: unknown) => value is Resource;
  readonly path: string;
  readonly resourceName: string;
};

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
  readonly isLoading: boolean;
  readonly loadCaptures: () => Promise<RefreshResult>;
  readonly loadCatalogue: () => Promise<RefreshResult>;
  readonly locations: readonly LocationItem[];
  readonly refreshIssue: RefreshIssue | null;
  readonly retryRefresh: () => Promise<void>;
  readonly sites: readonly SiteItem[];
  readonly status: string;
  readonly setStatus: Dispatch<SetStateAction<string>>;
};

export function useCatalogue(getAuthHeaders: AuthHeadersProvider): CatalogueController {
  const [isLoading, setIsLoading] = useState(true);
  const [items, setItems] = useState<readonly InventoryItem[]>([]);
  const [captures, setCaptures] = useState<readonly CaptureResource[]>([]);
  const [locations, setLocations] = useState<readonly LocationItem[]>([]);
  const [sites, setSites] = useState<readonly SiteItem[]>([]);
  const [status, setStatus] = useState("Loading inventory...");
  const [refreshIssue, setRefreshIssue] = useState<RefreshIssue | null>(null);
  const requestVersions = useRef({ inventory: 0, locations: 0, sites: 0, captures: 0 });
  const catalogueRequestVersion = useRef(0);
  const previousCaptures = useRef<readonly CaptureResource[]>([]);
  const hasPendingCaptures = captures.some((capture) => isPendingCapture(capture));

  const loadLatestCollection = useCallback(
    async <Resource>(
      collection: CollectionName,
      request: CollectionRequest<Resource>,
    ): Promise<readonly Resource[] | null> => {
      requestVersions.current[collection] += 1;
      const requestVersion = requestVersions.current[collection];
      try {
        const data = await loadCollection({ ...request, getAuthHeaders });
        return requestVersion === requestVersions.current[collection] ? data : null;
      } catch (error) {
        if (requestVersion !== requestVersions.current[collection]) return null;
        throw error;
      }
    },
    [getAuthHeaders],
  );

  const loadInventory = useCallback(async (): Promise<RefreshResult> => {
    const data = await loadLatestCollection("inventory", {
      isResource: isBottleResource,
      path: "/api/bottles",
      resourceName: "Inventory",
    });
    if (data === null) return "superseded";
    const nextItems = data.map((item) => apiBottleToInventoryItem(item));
    setItems(nextItems);
    setStatus(
      nextItems.length === 0
        ? "No bottles catalogued yet."
        : `${nextItems.length} bottles available.`,
    );
    return "refreshed";
  }, [loadLatestCollection]);

  const loadLocations = useCallback(async (): Promise<RefreshResult> => {
    const data = await loadLatestCollection("locations", {
      isResource: isStorageLocationResource,
      path: "/api/storage-locations",
      resourceName: "Locations",
    });
    if (data === null) return "superseded";
    setLocations(data.map((location) => apiLocationToLocationItem(location)));
    return "refreshed";
  }, [loadLatestCollection]);

  const loadSites = useCallback(async (): Promise<RefreshResult> => {
    const data = await loadLatestCollection("sites", {
      isResource: isSiteResource,
      path: "/api/sites",
      resourceName: "Sites",
    });
    if (data === null) return "superseded";
    setSites(data.map((site) => apiSiteToSiteItem(site)));
    return "refreshed";
  }, [loadLatestCollection]);

  const loadCaptures = useCallback(async (): Promise<RefreshResult> => {
    const data = await loadLatestCollection("captures", {
      isResource: isCaptureResource,
      path: "/api/bottle-captures",
      resourceName: "Captures",
    });
    if (data === null) return "superseded";
    setCaptures(data);
    setRefreshIssue((current) => (current?.refresh === "captures" ? null : current));
    return "refreshed";
  }, [loadLatestCollection]);

  const loadCatalogue = useCallback(async (): Promise<RefreshResult> => {
    catalogueRequestVersion.current += 1;
    const requestVersion = catalogueRequestVersion.current;
    const results = await Promise.allSettled([
      loadInventory(),
      loadLocations(),
      loadSites(),
      loadCaptures(),
    ]);
    if (requestVersion !== catalogueRequestVersion.current) return "superseded";
    const failed = results.find((result) => result.status === "rejected");
    if (failed?.status === "rejected") {
      throw failed.reason;
    }
    return results.some((result) => result.status === "fulfilled" && result.value === "superseded")
      ? "superseded"
      : "refreshed";
  }, [loadCaptures, loadInventory, loadLocations, loadSites]);

  const refresh = useCallback(
    async (scope: MutationCompletion["refresh"]): Promise<RefreshResult> =>
      scope === "captures" ? loadCaptures() : loadCatalogue(),
    [loadCaptures, loadCatalogue],
  );

  const completeMutation = useCallback(
    async ({ refresh: scope, successMessage }: MutationCompletion): Promise<void> => {
      try {
        if ((await refresh(scope)) === "superseded") return;
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
      if ((await refresh(refreshIssue.refresh)) === "superseded") return;
      setRefreshIssue(null);
      setStatus("Latest data refreshed.");
    } catch {
      setStatus("Latest data is still unavailable. Try refreshing again.");
    }
  }, [refresh, refreshIssue]);

  useEffect(() => {
    async function load(): Promise<void> {
      try {
        if ((await loadCatalogue()) === "refreshed") setRefreshIssue(null);
      } catch {
        const message = "Could not load cellar data. Try refreshing.";
        setRefreshIssue({ message, refresh: "catalogue" });
        setStatus(message);
      } finally {
        setIsLoading(false);
      }
    }

    void load();
  }, [loadCatalogue]);

  useEffect(() => {
    let stopped = false;
    let pending = false;
    let timeout: ReturnType<typeof setTimeout> | undefined;

    async function poll(): Promise<void> {
      if (stopped || pending) {
        return;
      }
      clearTimeout(timeout);
      pending = true;
      try {
        if (document.visibilityState !== "hidden") {
          await loadCaptures();
        }
      } catch {
        setRefreshIssue(
          (current) =>
            current ?? {
              message: "Capture progress could not be refreshed. Retrying automatically.",
              refresh: "captures",
            },
        );
      } finally {
        pending = false;
        if (!stopped) {
          timeout = setTimeout(() => {
            void poll();
          }, 5_000);
        }
      }
    }

    function onVisibilityChange(): void {
      if (document.visibilityState !== "hidden") {
        void poll();
      }
    }

    if (hasPendingCaptures) {
      timeout = setTimeout(() => {
        void poll();
      }, 5_000);
      document.addEventListener("visibilitychange", onVisibilityChange);
    }
    return () => {
      stopped = true;
      clearTimeout(timeout);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [hasPendingCaptures, loadCaptures]);

  useEffect(() => {
    const imported = captures.some(
      (capture) =>
        capture.status === "imported" &&
        previousCaptures.current.some(
          (previous) => previous.id === capture.id && isPendingCapture(previous),
        ),
    );
    previousCaptures.current = captures;
    if (imported) {
      void completeMutation({
        refresh: "catalogue",
        successMessage: "Capture imported. Inventory updated.",
      });
    }
  }, [captures, completeMutation]);

  return {
    captures,
    completeMutation,
    items,
    isLoading,
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
}: CollectionRequest<Resource> & {
  readonly getAuthHeaders: AuthHeadersProvider;
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

function isPendingCapture(capture: CaptureResource): boolean {
  return (
    capture.status === "queued" || capture.status === "extracting" || capture.status === "importing"
  );
}
