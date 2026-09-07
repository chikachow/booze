import assert from "node:assert/strict";
import { it } from "node:test";

import { createD1Client } from "@chikachow/booze-db";

import { asD1, migratedDatabase } from "./d1-support.ts";
import { getInventorySummary } from "./mcp/inventory-summary.ts";

await it("counts only available bottles in drink status while retaining consumed history", async () => {
  const sqlite = migratedDatabase();
  sqlite.exec(`
    INSERT INTO users (id, clerk_user_id) VALUES ('user', 'clerk-user');
    INSERT INTO sites (id, name) VALUES ('site', 'Cellar');
    INSERT INTO site_memberships (site_id, user_id, role) VALUES ('site', 'user', 'owner');
    INSERT INTO wineries (id, site_id, name) VALUES ('winery', 'site', 'Estate');
    INSERT INTO wine_vintages (id, site_id, winery_id, base_name, display_name, vintage_label)
      VALUES ('wine', 'site', 'winery', 'Reserve', 'Reserve', 'NV');
    INSERT INTO bottles (id, site_id, wine_vintage_id, status) VALUES
      ('available-1', 'site', 'wine', 'in_stock'),
      ('available-2', 'site', 'wine', 'in_stock'),
      ('consumed', 'site', 'wine', 'consumed');
  `);
  const summary = await getInventorySummary({
    database: createD1Client(asD1(sqlite)),
    userId: "user",
  });
  const availableCount = summary.bottleStatusCounts.find(
    (item) => item.bottleStatus === "in_stock",
  )?.count;
  assert.equal(availableCount, 2);
  assert.equal(
    summary.drinkStatusCounts.reduce((total, item) => total + item.count, 0),
    availableCount,
  );
  assert.equal(
    summary.bottleStatusCounts.find((item) => item.bottleStatus === "consumed")?.count,
    1,
  );
});
