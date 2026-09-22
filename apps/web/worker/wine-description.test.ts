import assert from "node:assert/strict";
import { it } from "node:test";
import { formatWineLabel, hasWineIdentity, vintageLabel } from "../shared/wine-identity.ts";

void it("describes unnamed varietal and appellation wines without inventing a designation", () => {
  const wine = {
    wineryName: "RIKARD Wines",
    brandName: "RIKARD",
    grapeVarieties: ["Shiraz"],
    vintageYear: 2022,
  };
  assert.equal(formatWineLabel(wine), "2022 RIKARD Shiraz");
  assert.equal(
    formatWineLabel({ ...wine, designation: "Black Label" }),
    "2022 RIKARD Black Label Shiraz",
  );
  assert.equal(
    formatWineLabel({ wineryName: "Domaine Example", appellation: "Chablis", vintageYear: 2023 }),
    "2023 Domaine Example Chablis",
  );
  assert.equal(formatWineLabel({}), "Unidentified wine");
  assert.equal(hasWineIdentity({ wineryName: "RIKARD", vintageYear: 2022 }), false);
  assert.equal(hasWineIdentity(wine), true);
});

void it("does not interpret a missing vintage as non-vintage", () => {
  assert.equal(vintageLabel({}), "Unknown");
  assert.equal(vintageLabel({ vintageStatus: "non_vintage" }), "NV");
  assert.equal(vintageLabel({ vintageYear: 2022 }), "2022");
});
