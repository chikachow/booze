import { describe, expect, it } from "vitest";

import { captureStatus } from "./capture-status.ts";

describe("captureStatus", () => {
  it("keeps failure status display and permissions together", () => {
    expect(captureStatus("failed")).toEqual({
      actionable: true,
      badge: "error",
      deletable: true,
      label: "Failed",
    });
  });

  it("prevents mutation while processing", () => {
    expect(captureStatus("extracting").actionable).toBe(false);
    expect(captureStatus("extracting").deletable).toBe(false);
  });
});
