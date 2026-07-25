import axe from "axe-core";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { InventoryArea } from "./InventoryView.tsx";
import { inventoryFixtures, locationsFixture } from "./test/catalogue-fixtures.ts";

const noop = (): void => {
  // Intentionally records no state; each test asserts the rendered permission surface.
};

function renderInventory(editableSiteIds: ReadonlySet<string>) {
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
      items={inventoryFixtures.many}
      locationFilter=""
      locationOptions={["Home cellar / Left rack"]}
      locations={locationsFixture}
      varietalFilter=""
      varietalOptions={["Shiraz"]}
      onAddBottle={noop}
      onEditBottle={noop}
      setDrinkStatusFilter={noop}
      setFilter={noop}
      setGrouping={noop}
      setLocationFilter={noop}
      setVarietalFilter={noop}
    />,
  );
}

describe("InventoryArea", () => {
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
