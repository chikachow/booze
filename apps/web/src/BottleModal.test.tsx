import { render, screen, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { BottleModal } from "./BottleModal.tsx";
import { formStateForItem } from "./inventory-model.ts";
import { inventoryItemFixture, locationsFixture, sitesFixture } from "./test/catalogue-fixtures.ts";

function closeBottle(): void {
  // The containing catalogue owns close state; this test observes confirmation only.
}

function requiredInput(container: HTMLElement, name: string): HTMLInputElement {
  const input = container.querySelector<HTMLInputElement>(`[name='${name}']`);
  if (input === null) {
    throw new Error(`Missing input ${name}`);
  }
  return input;
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

  it("preserves dirty scalar and repeatable values across parent loading renders", async () => {
    const user = userEvent.setup();
    const item = inventoryItemFixture();
    const props = {
      form: formStateForItem(item),
      item,
      locations: locationsFixture,
      sites: sitesFixture,
      title: "Edit bottle",
      onClose: closeBottle,
      onSubmit: submitBottle,
    } as const;
    const { container, rerender } = render(<BottleModal {...props} isSaving={false} />);

    const winery = screen.getByRole("textbox", { name: /Winery/iu });
    await user.clear(winery);
    await user.type(winery, "Unsaved Adversarial Winery");

    await user.click(screen.getByRole("button", { name: "Add review" }));
    await user.type(screen.getByRole("textbox", { name: /Source.*Required/iu }), "Local critic");
    await user.type(screen.getByRole("textbox", { name: /Rating.*Required/iu }), "96 points");

    await user.click(screen.getByRole("button", { name: "Add award" }));
    await user.type(requiredInput(container, "awards.0.awardLevel"), "Gold");
    await user.type(requiredInput(container, "awards.0.awardName"), "Local show");

    rerender(<BottleModal {...props} isSaving />);

    expect(winery).toHaveValue("Unsaved Adversarial Winery");
    expect(container.querySelector("[name='criticReviews.0.reviewSourceName']")).toHaveValue(
      "Local critic",
    );
    expect(container.querySelector("[name='criticReviews.0.ratingText']")).toHaveValue("96 points");
    expect(container.querySelector("[name='awards.0.awardLevel']")).toHaveValue("Gold");
    expect(container.querySelector("[name='awards.0.awardName']")).toHaveValue("Local show");
  });
});
