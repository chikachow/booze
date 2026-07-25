import { describe, expect, it } from "vitest";

import { BOTTLE_QUANTITY_ERROR, validateBottleQuantity } from "../shared/quantity.ts";
import { parseQuantity } from "./inventory-model.ts";

describe("bottle quantity validation", () => {
  it.each(["1", "24", 1, 24])("accepts boundary value %s", (value) => {
    expect(validateBottleQuantity(value)).toEqual({ ok: true, value: Number(value) });
  });

  it.each(["", "0", "25", "1.5", "2 bottles", undefined, null])(
    "rejects invalid value %s without coercion",
    (value) => {
      expect(validateBottleQuantity(value)).toEqual({
        ok: false,
        message: BOTTLE_QUANTITY_ERROR,
      });
    },
  );

  it("throws rather than silently defaulting or clamping", () => {
    expect(() => parseQuantity("bad")).toThrow(BOTTLE_QUANTITY_ERROR);
    expect(() => parseQuantity("99")).toThrow(BOTTLE_QUANTITY_ERROR);
  });
});
