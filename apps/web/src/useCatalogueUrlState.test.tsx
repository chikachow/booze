import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import {
  catalogueStateFromUrl,
  catalogueUrlWithState,
  useCatalogueUrlState,
} from "./useCatalogueUrlState.ts";

afterEach(() => {
  window.history.replaceState(null, "", "/");
});

describe("catalogue URL state", () => {
  it("validates enum parameters and reads filters", () => {
    const state = catalogueStateFromUrl(
      new URL("https://example.test/?area=management&grouping=invalid&q=shiraz"),
    );
    expect(state.area).toBe("management");
    expect(state.grouping).toBe("winery");
    expect(state.filter).toBe("shiraz");
  });

  it("omits defaults while serialising persistent state", () => {
    const url = catalogueUrlWithState(new URL("https://example.test/cellar?unknown=kept"), {
      area: "inventory",
      drinkStatusFilter: "hold",
      filter: "",
      grouping: "storage",
      locationFilter: "",
      varietalFilter: "Shiraz",
    });
    expect(url.searchParams.get("area")).toBeNull();
    expect(url.searchParams.get("grouping")).toBe("storage");
    expect(url.searchParams.get("varietal")).toBe("Shiraz");
    expect(url.searchParams.get("unknown")).toBe("kept");
  });

  it("restores state on browser history navigation", () => {
    window.history.replaceState(null, "", "/?area=captures");
    const { result } = renderHook(() => useCatalogueUrlState());
    expect(result.current.area).toBe("captures");

    act(() => {
      result.current.setArea("management");
    });
    expect(window.location.search).toBe("?area=management");

    act(() => {
      window.history.replaceState(null, "", "/?grouping=storage");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    expect(result.current.area).toBe("inventory");
    expect(result.current.grouping).toBe("storage");
  });
});
