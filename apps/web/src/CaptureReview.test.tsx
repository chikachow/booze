import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { CaptureReview } from "./CaptureReview.tsx";
import type { CaptureRunResource } from "./inventory-model.ts";

const run = {
  id: "run-1",
  status: "needs_review",
  extractionR2Key: null,
  extractionContentType: null,
  extractionSizeBytes: null,
  importCandidate: {
    wine: {
      wineryName: "Rowlee",
      displayName: "Reserve Shiraz",
      vintageYear: 2023,
      alcoholPercent: 13.5,
      grapeVarieties: ["Shiraz", "Cabernet Sauvignon"],
      notes: "Extraction disagreements: two possible vintages",
      labelText: "Front label\nBack label",
    },
    bottle: { volumeMl: 750, lotCode: "L42" },
  },
  matchResult: null,
  importResult: { reviewReasons: ["The photos disagree on the vintage."] },
  errorMessage: null,
  errorDetailR2Key: null,
  errorDetailContentType: null,
  errorDetailSizeBytes: null,
  createdAt: "2026-07-25T00:00:00Z",
  completedAt: null,
} satisfies CaptureRunResource;

describe("capture review", () => {
  it("shows extracted facts and disagreement reasons before import", () => {
    render(<CaptureReview run={run} />);

    expect(screen.getByText("The photos disagree on the vintage.")).toBeVisible();
    expect(screen.getByText("2023")).toBeVisible();
    expect(screen.getByText("13.5")).toBeVisible();
    expect(screen.getByText("Shiraz, Cabernet Sauvignon")).toBeVisible();
    expect(screen.getByText("750")).toBeVisible();
    expect(screen.getByText("L42")).toBeVisible();
    expect(screen.getByText("Extraction disagreements: two possible vintages")).toBeVisible();
  });

  it("names unavailable evidence instead of presenting an empty review", () => {
    render(<CaptureReview run={null} />);
    expect(
      screen.getByText(
        "Extracted facts are unavailable. Retry extraction before importing this capture.",
      ),
    ).toBeVisible();
  });
});
