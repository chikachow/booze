import { render, screen, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { BottleModal } from "./BottleModal.tsx";
import { formStateForItem } from "./inventory-model.ts";
import { inventoryItemFixture, locationsFixture, sitesFixture } from "./test/catalogue-fixtures.ts";

function closeBottle(): void {
  // The containing catalogue owns close state; this test observes confirmation only.
}

async function submitBottle(): Promise<void> {
  await Promise.resolve();
}

describe("BottleModal destructive actions", () => {
  it("requires explicit AlertDialog confirmation before deleting", async () => {
    const user = userEvent.setup();
    const item = inventoryItemFixture();
    const onDelete = vi.fn(async () => true);

    render(
      <BottleModal
        form={formStateForItem(item)}
        isSaving={false}
        item={item}
        locations={locationsFixture}
        sites={sitesFixture}
        title="Edit bottle"
        onClose={closeBottle}
        onDelete={onDelete}
        onSubmit={submitBottle}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Delete bottle" }));
    expect(onDelete).not.toHaveBeenCalled();
    expect(screen.getByRole("alertdialog", { name: "Delete this bottle?" })).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onDelete).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Delete bottle" }));
    await user.click(
      within(screen.getByRole("alertdialog", { name: "Delete this bottle?" })).getByRole("button", {
        name: "Delete bottle",
      }),
    );
    expect(onDelete).toHaveBeenCalledTimes(1);
  });
});
