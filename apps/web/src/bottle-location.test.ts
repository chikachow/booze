import { describe, expect, it } from "vitest";

import {
  bottleLocationOptions,
  bottleLocationValue,
  resolveBottleLocation,
} from "./bottle-location.ts";
import { locationsFixture, sitesFixture } from "./test/catalogue-fixtures.ts";

describe("bottle location selection", () => {
  it("round-trips typed site and location values", () => {
    const site = sitesFixture[0];
    const location = locationsFixture[0];
    expect(site).toBeDefined();
    expect(location).toBeDefined();
    if (site === undefined || location === undefined) {
      return;
    }

    expect(resolveBottleLocation(`site:${site.siteId}`, sitesFixture, locationsFixture)).toEqual({
      location: "",
      site: site.site,
      siteId: site.siteId,
      storageLocationId: "",
    });
    expect(
      bottleLocationValue(location.siteId, location.locationId, sitesFixture, locationsFixture),
    ).toBe(`location:${location.locationId}`);
  });

  it("fails closed for an unknown or malformed value", () => {
    expect(resolveBottleLocation("arbitrary", sitesFixture, locationsFixture)).toEqual({
      location: "",
      site: "",
      siteId: "",
      storageLocationId: "",
    });
  });

  it("builds explicit site and location options", () => {
    const options = bottleLocationOptions(sitesFixture, locationsFixture);
    expect(options.some((option) => option.value.startsWith("site:"))).toBe(true);
    expect(options.some((option) => option.value.startsWith("location:"))).toBe(true);
  });
});
