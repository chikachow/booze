import { describe, expect, it } from "vitest";

import { bottleCreatePayload, bottleEditPayload } from "./bottle-payload.ts";
import { formStateForItem, type InventoryItem } from "./inventory-model.ts";
import { inventoryItemFixture } from "./test/catalogue-fixtures.ts";

function submissionFor(item: InventoryItem) {
  return { awards: [], criticReviews: [], form: formStateForItem(item) };
}

function serialized(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value));
}

describe("bottle edit payload", () => {
  it("preserves the form's position note when moving to another location", () => {
    const item = inventoryItemFixture({ position: "Row 2" });
    const submission = submissionFor(item);
    submission.form.storageLocationId = "location-top";

    expect(serialized(bottleEditPayload(submission, item))).toEqual({
      storageLocationId: "location-top",
      positionHint: "Row 2",
    });
  });

  it("leaves all stored facts untouched when an existing record is saved unchanged", () => {
    const item = inventoryItemFixture({ baseName: "Shiraz", designation: "Reserve" });

    expect(serialized(bottleEditPayload(submissionFor(item), item))).toEqual({});
  });

  it("sends only bottle notes when editing a bottle, preserving shared wine identity and facts", () => {
    const item = inventoryItemFixture({ baseName: "Shiraz", designation: "Reserve" });
    const submission = submissionFor(item);
    submission.form.bottleNotes = "Damaged label; drink this bottle first.";

    expect(serialized(bottleEditPayload(submission, item))).toEqual({
      bottle: { notes: "Damaged label; drink this bottle first." },
    });
  });

  it("saves producer address and explicitly clears nullable numeric facts", () => {
    const item = inventoryItemFixture();
    const submission = submissionFor(item);
    submission.form.addressQualification = "Bottled in Orange, NSW";
    submission.form.alcoholPercent = "";
    submission.form.vintageYear = "";
    submission.form.drinkFromYear = "";
    submission.form.drinkToYear = "";

    expect(serialized(bottleEditPayload(submission, item))).toEqual({
      wine: {
        addressQualification: "Bottled in Orange, NSW",
        alcoholPercent: null,
        vintageYear: null,
        drinkFromYear: null,
        drinkToYear: null,
      },
    });
  });

  it("keeps hidden wine names independent when the display name is corrected", () => {
    const item = inventoryItemFixture({ baseName: "Shiraz", designation: "Reserve" });
    const submission = submissionFor(item);
    submission.form.displayName = "Reserve Shiraz";

    expect(serialized(bottleEditPayload(submission, item))).toEqual({
      wine: { displayName: "Reserve Shiraz" },
    });
  });

  it("retains existing creation defaults and producer address", () => {
    const item = inventoryItemFixture({ addressQualification: "Orange, NSW" });
    const payload = bottleCreatePayload(submissionFor(item));

    expect(payload.wine).toMatchObject({
      addressQualification: "Orange, NSW",
      baseName: item.displayName,
      designation: item.displayName,
    });
  });
});
