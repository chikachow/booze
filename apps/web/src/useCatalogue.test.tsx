import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { bottles, captures, locations, sites } from "../e2e/catalogue-fixtures.ts";
import { useCatalogue } from "./useCatalogue.ts";

const dataByPath = new Map<string, readonly unknown[]>([
  ["/api/bottles", bottles],
  ["/api/bottle-captures", captures],
  ["/api/storage-locations", locations],
  ["/api/sites", sites],
]);

async function getAuthHeaders(): Promise<Record<string, string>> {
  return {};
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("useCatalogue", () => {
  it("pauses capture polling in hidden tabs and refreshes immediately on return", async () => {
    vi.useFakeTimers();
    const visibility = vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    const requests: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request) => {
        const path = requestPath(input);
        requests.push(path);
        return jsonResponse(
          path === "/api/bottle-captures"
            ? captures.map((capture) => ({ ...capture, status: "queued" }))
            : (dataByPath.get(path) ?? []),
        );
      }),
    );
    renderHook(() => useCatalogue(getAuthHeaders));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    requests.length = 0;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    expect(requests).toEqual([]);

    visibility.mockReturnValue("visible");
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(requests).toEqual(["/api/bottle-captures"]);
  });

  it("does not replace newer inventory with an older overlapping response", async () => {
    let resolveInitialInventory: ((response: Response) => void) | undefined;
    let requestedInventory = false;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request) => {
        const path = requestPath(input);
        if (path === "/api/bottles") {
          if (!requestedInventory) {
            requestedInventory = true;
            return new Promise<Response>((resolve) => {
              resolveInitialInventory = resolve;
            });
          }
          return jsonResponse(bottles.map((bottle) => ({ ...bottle, bottleNotes: "Newer fact" })));
        }
        return jsonResponse(dataByPath.get(path) ?? []);
      }),
    );
    const { result } = renderHook(() => useCatalogue(getAuthHeaders));
    await waitFor(() => {
      expect(requestedInventory).toBe(true);
    });
    await act(async () => {
      await result.current.loadCatalogue();
    });
    expect(result.current.items[0]?.bottleNotes).toBe("Newer fact");

    await act(async () => {
      resolveInitialInventory?.(jsonResponse(bottles));
    });
    expect(result.current.items[0]?.bottleNotes).toBe("Newer fact");
  });

  it("ignores an older load failure after a newer refresh succeeds", async () => {
    let rejectInitialInventory: ((error: Error) => void) | undefined;
    let requestedInventory = false;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request) => {
        const path = requestPath(input);
        if (path === "/api/bottles" && !requestedInventory) {
          requestedInventory = true;
          return new Promise<Response>((_resolve, reject) => {
            rejectInitialInventory = reject;
          });
        }
        return jsonResponse(dataByPath.get(path) ?? []);
      }),
    );
    const { result } = renderHook(() => useCatalogue(getAuthHeaders));
    await waitFor(() => {
      expect(requestedInventory).toBe(true);
    });
    await act(async () => {
      await result.current.completeMutation({
        refresh: "catalogue",
        successMessage: "Bottle saved.",
      });
    });
    await act(async () => {
      rejectInitialInventory?.(new Error("An older request lost its connection"));
    });

    expect(result.current.items).toHaveLength(1);
    expect(result.current.refreshIssue).toBeNull();
    expect(result.current.status).toBe("Bottle saved.");
  });

  it("does not clear a newer refresh failure when an older load finishes", async () => {
    let resolveInitialInventory: ((response: Response) => void) | undefined;
    let requestedInventory = false;
    let failSites = false;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request) => {
        const path = requestPath(input);
        if (path === "/api/bottles" && !requestedInventory) {
          requestedInventory = true;
          return new Promise<Response>((resolve) => {
            resolveInitialInventory = resolve;
          });
        }
        return path === "/api/sites" && failSites
          ? new Response(null, { status: 503 })
          : jsonResponse(dataByPath.get(path) ?? []);
      }),
    );
    const { result } = renderHook(() => useCatalogue(getAuthHeaders));
    await waitFor(() => {
      expect(requestedInventory).toBe(true);
    });
    failSites = true;
    await act(async () => {
      await result.current.completeMutation({
        refresh: "catalogue",
        successMessage: "Bottle saved.",
      });
    });
    await act(async () => {
      resolveInitialInventory?.(jsonResponse(bottles));
    });

    expect(result.current.refreshIssue).toEqual({
      message: "Bottle saved. Latest data could not be refreshed.",
      refresh: "catalogue",
    });
  });

  it("ignores an older polling failure after a catalogue refresh succeeds", async () => {
    vi.useFakeTimers();
    let captureRequests = 0;
    let rejectPoll: ((error: Error) => void) | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request) => {
        const path = requestPath(input);
        if (path === "/api/bottle-captures") {
          captureRequests += 1;
          if (captureRequests === 2) {
            return new Promise<Response>((_resolve, reject) => {
              rejectPoll = reject;
            });
          }
          return jsonResponse(captures.map((capture) => ({ ...capture, status: "extracting" })));
        }
        return jsonResponse(dataByPath.get(path) ?? []);
      }),
    );
    const { result } = renderHook(() => useCatalogue(getAuthHeaders));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000);
    });
    expect(captureRequests).toBe(2);
    await act(async () => {
      await result.current.completeMutation({
        refresh: "catalogue",
        successMessage: "Bottle saved.",
      });
    });
    await act(async () => {
      rejectPoll?.(new Error("An older polling request lost its connection"));
    });

    expect(result.current.refreshIssue).toBeNull();
    expect(result.current.status).toBe("Bottle saved.");
  });

  it("offers a retry after the initial catalogue load fails", async () => {
    let unavailable = true;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request) =>
        unavailable
          ? new Response(null, { status: 503 })
          : jsonResponse(dataByPath.get(requestPath(input)) ?? []),
      ),
    );
    const { result } = renderHook(() => useCatalogue(getAuthHeaders));
    await waitFor(() => {
      expect(result.current.refreshIssue?.refresh).toBe("catalogue");
    });

    unavailable = false;
    await act(async () => {
      await result.current.retryRefresh();
    });

    expect(result.current.items).toHaveLength(1);
    expect(result.current.refreshIssue).toBeNull();
  });

  it("refreshes pending captures, updates imported inventory, and stops after processing finishes", async () => {
    vi.useFakeTimers();
    let captureStatus = "queued";
    const requests: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request) => {
        const path = requestPath(input);
        requests.push(path);
        return jsonResponse(
          path === "/api/bottle-captures"
            ? captures.map((capture) => ({ ...capture, status: captureStatus }))
            : (dataByPath.get(path) ?? []),
        );
      }),
    );
    const { result } = renderHook(() => useCatalogue(getAuthHeaders));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(result.current.captures[0]?.status).toBe("queued");
    requests.length = 0;

    captureStatus = "extracting";
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000);
    });
    expect(requests).toEqual(["/api/bottle-captures"]);
    expect(result.current.captures[0]?.status).toBe("extracting");

    captureStatus = "imported";
    requests.length = 0;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000);
    });
    expect(requests).toContain("/api/bottles");
    expect(result.current.captures[0]?.status).toBe("imported");
    expect(result.current.status).toBe("Capture imported. Inventory updated.");

    requests.length = 0;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(20_000);
    });
    expect(requests).toEqual([]);
  });

  it("retains pending captures through temporary polling failure and clears the warning on recovery", async () => {
    vi.useFakeTimers();
    let unavailable = false;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request) => {
        const path = requestPath(input);
        if (path === "/api/bottle-captures") {
          return unavailable
            ? new Response(null, { status: 503 })
            : jsonResponse(captures.map((capture) => ({ ...capture, status: "extracting" })));
        }
        return jsonResponse(dataByPath.get(path) ?? []);
      }),
    );
    const { result } = renderHook(() => useCatalogue(getAuthHeaders));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    unavailable = true;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000);
    });
    expect(result.current.captures[0]?.status).toBe("extracting");
    expect(result.current.refreshIssue?.refresh).toBe("captures");

    unavailable = false;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000);
    });
    expect(result.current.refreshIssue).toBeNull();
  });

  it("keeps a committed mutation successful and retries only its failed refresh", async () => {
    let failedPath: string | null = null;
    const requests: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request) => {
        const path = requestPath(input);
        requests.push(path);
        if (path === failedPath) {
          return new Response(null, { status: 503 });
        }
        return jsonResponse(dataByPath.get(path) ?? []);
      }),
    );

    const { result } = renderHook(() => useCatalogue(getAuthHeaders));
    await waitFor(() => {
      expect(result.current.items).toHaveLength(1);
    });

    failedPath = "/api/sites";
    await act(async () => {
      await result.current.completeMutation({
        refresh: "catalogue",
        successMessage: "Bottle saved.",
      });
    });

    expect(result.current.status).toBe("Bottle saved. Latest data could not be refreshed.");
    expect(result.current.refreshIssue).toEqual({
      message: "Bottle saved. Latest data could not be refreshed.",
      refresh: "catalogue",
    });

    failedPath = null;
    requests.length = 0;
    await act(async () => {
      await result.current.retryRefresh();
    });

    expect(requests.toSorted()).toEqual(
      ["/api/bottle-captures", "/api/bottles", "/api/sites", "/api/storage-locations"].toSorted(),
    );
    expect(result.current.refreshIssue).toBeNull();
    expect(result.current.status).toBe("Latest data refreshed.");
  });

  it("limits capture recovery to capture data and retains a retry after repeated failure", async () => {
    let failCaptures = false;
    const requests: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request) => {
        const path = requestPath(input);
        requests.push(path);
        if (failCaptures && path === "/api/bottle-captures") {
          return new Response(null, { status: 503 });
        }
        return jsonResponse(dataByPath.get(path) ?? []);
      }),
    );

    const { result } = renderHook(() => useCatalogue(getAuthHeaders));
    await waitFor(() => {
      expect(result.current.captures).toHaveLength(1);
    });

    failCaptures = true;
    requests.length = 0;
    await act(async () => {
      await result.current.completeMutation({
        refresh: "captures",
        successMessage: "Capture deleted.",
      });
    });

    expect(requests).toEqual(["/api/bottle-captures"]);
    expect(result.current.refreshIssue?.refresh).toBe("captures");

    requests.length = 0;
    await act(async () => {
      await result.current.retryRefresh();
    });

    expect(requests).toEqual(["/api/bottle-captures"]);
    expect(result.current.refreshIssue?.refresh).toBe("captures");
    expect(result.current.status).toBe("Latest data is still unavailable. Try refreshing again.");
  });
});

function requestPath(input: string | URL | Request): string {
  if (input instanceof Request) {
    return new URL(input.url, window.location.origin).pathname;
  }
  return new URL(String(input), window.location.origin).pathname;
}

function jsonResponse(data: readonly unknown[]): Response {
  return new Response(JSON.stringify({ data }), {
    headers: { "content-type": "application/json" },
    status: 200,
  });
}
