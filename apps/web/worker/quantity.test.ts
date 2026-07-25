import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { HTTPException } from "hono/http-exception";

import { BOTTLE_QUANTITY_ERROR } from "../shared/quantity.ts";
import { parseCaptureQuantity } from "./routes/bottle-captures.ts";

await describe("capture quantity boundary", async () => {
  await it("accepts only whole quantities from 1 to 24", () => {
    assert.equal(parseCaptureQuantity("1"), 1);
    assert.equal(parseCaptureQuantity("24"), 24);
  });

  for (const invalid of [undefined, "", "0", "25", "1.5", "2 bottles"]) {
    await it(`rejects ${String(invalid)} instead of defaulting`, () => {
      assert.throws(
        () => parseCaptureQuantity(invalid),
        (error: unknown) =>
          error instanceof HTTPException &&
          error.status === 400 &&
          error.message === BOTTLE_QUANTITY_ERROR,
      );
    });
  }
});
