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
});

describe("useCatalogue", () => {
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
