import axe from "axe-core";
import { render, screen, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { InventoryArea } from "./InventoryView.tsx";
import {
  inventoryFixtures,
  inventoryItemFixture,
  locationsFixture,
} from "./test/catalogue-fixtures.ts";

const noop = (): void => {
  // Intentionally records no state; each test asserts the rendered permission surface.
};

function renderInventory(
  editableSiteIds: ReadonlySet<string>,
  items = inventoryFixtures.many as readonly ReturnType<typeof inventoryItemFixture>[],
  onEditBottle = noop as (item: ReturnType<typeof inventoryItemFixture>) => void,
  onCreateSite?: () => void,
) {
  return render(
    <InventoryArea
      drinkStatusFilter=""
      drinkStatusOptions={[
        { label: "Drink now", value: "drink-now" },
        { label: "Hold", value: "hold" },
      ]}
      editableSiteIds={editableSiteIds}
      filter=""
      grouping="winery"
      items={items}
      locationFilter=""
      locationOptions={["Home cellar / Left rack"]}
      locations={locationsFixture}
      varietalFilter=""
      varietalOptions={["Shiraz"]}
      onCreateSite={onCreateSite}
      onAddBottle={noop}
      onEditBottle={onEditBottle}
      setDrinkStatusFilter={noop}
      setFilter={noop}
      setGrouping={noop}
      setLocationFilter={noop}
      setVarietalFilter={noop}
    />,
  );
}

describe("InventoryArea", () => {
  it("gives an empty cellar a direct first-site setup action", async () => {
    const user = userEvent.setup();
    const onCreateSite = vi.fn<() => void>();
    renderInventory(new Set(), [], noop, onCreateSite);
    await user.click(screen.getByRole("button", { name: "Create your first site" }));
    expect(onCreateSite).toHaveBeenCalledTimes(1);
  });

  it("lets the user choose the exact physical bottle within a shared wine", async () => {
    const user = userEvent.setup();
    const first = inventoryItemFixture({
      bottleId: "bottle-1",
      position: "Slot 1",
      bottleNotes: "Pristine",
    });
    const second = inventoryItemFixture({
      bottleId: "bottle-2",
      position: "Slot 2",
      lotCode: "L42",
      bottleNotes: "Damaged label",
    });
    const onEditBottle = vi.fn<(item: ReturnType<typeof inventoryItemFixture>) => void>();
    renderInventory(new Set(["site-owner"]), [first, second], onEditBottle);

    expect(screen.queryByRole("button", { name: "Edit" })).not.toBeInTheDocument();
    await user.click(screen.getByText("Choose a bottle to edit, move, or mark drunk"));
    const bottleRow = screen.getByText("Bottle 2 · Home cellar / Left rack / Slot 2").closest("li");
    expect(bottleRow).not.toBeNull();
    expect(bottleRow).toHaveTextContent("L42 · Damaged label");
    if (bottleRow === null) {
      throw new Error("Missing bottle row");
    }
    await user.click(within(bottleRow).getByRole("button", { name: "Edit bottle 2" }));

    expect(onEditBottle).toHaveBeenCalledExactlyOnceWith(second);
  });

  it("does not expose write actions for read-only sites", () => {
    renderInventory(new Set());

    expect(screen.queryByRole("button", { name: "Add bottle" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Edit" })).not.toBeInTheDocument();
  });

  it("renders populated long-content fixtures without automated accessibility violations", async () => {
    const { container } = renderInventory(new Set(["site-owner"]));

    const result = await axe.run(container, {
      rules: { "color-contrast": { enabled: false } },
    });
    expect(result.violations).toEqual([]);
  });
});
