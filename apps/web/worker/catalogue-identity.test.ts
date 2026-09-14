import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createD1Client } from "@chikachow/booze-db";

import { prepareWineVintage } from "./api/catalogue.ts";
import { retryCatalogueTransaction } from "./api/catalogue-transaction.ts";
import { asD1, migratedDatabase } from "./d1-support.ts";

await describe("catalogue identity at commit", async () => {
  await it("preserves the winning target blend when concurrent vintage creation requires a retry", async () => {
    const { database, sqlite } = setup();
    sqlite.exec(`
      INSERT INTO wineries (id, site_id, name) VALUES ('winery', 'site', 'Producer');
      INSERT INTO wine_vintages
        (id, site_id, winery_id, base_name, display_name, vintage_label, vintage_year)
        VALUES ('source', 'site', 'winery', 'Reserve', 'Reserve', '2020', 2020);
      INSERT INTO grape_varieties (id, name)
        VALUES ('source-grape', 'Shiraz'), ('target-grape', 'Cabernet');
      INSERT INTO wine_constituents
        (site_id, wine_vintage_id, grape_variety_id, percentage, blend_text)
        VALUES ('site', 'source', 'source-grape', 100, 'Original source blend');
    `);
    let attempts = 0;
    const result = await retryCatalogueTransaction(async () => {
      const prepared = await prepareWineVintage({
        database,
        siteId: "site",
        wine: { wineryName: "Producer", designation: "Reserve", vintageYear: 2021 },
        updates: { vintageYear: 2021 },
        overwriteExisting: true,
        sourceWineVintageId: "source",
      });
      attempts += 1;
      if (attempts === 1) {
        sqlite.exec(`
          INSERT INTO wine_vintages
            (id, site_id, winery_id, base_name, display_name, vintage_label, vintage_year)
            VALUES ('winner', 'site', 'winery', 'Reserve', 'Reserve', '2021', 2021);
          INSERT INTO wine_constituents
            (site_id, wine_vintage_id, grape_variety_id, percentage, blend_text)
            VALUES ('site', 'winner', 'target-grape', 100, 'Original target blend');
        `);
      }
      await database.batch(prepared.statements);
      return prepared.wineVintageId;
    });
    assert.equal(attempts, 2);
    assert.equal(result, "winner");
    assert.deepEqual(
      sqlite
        .prepare(
          "SELECT wine_vintage_id, grape_variety_id, percentage, blend_text FROM wine_constituents ORDER BY wine_vintage_id",
        )
        .all()
        .map((row) => ({ ...row })),
      [
        {
          wine_vintage_id: "source",
          grape_variety_id: "source-grape",
          percentage: 100,
          blend_text: "Original source blend",
        },
        {
          wine_vintage_id: "winner",
          grape_variety_id: "target-grape",
          percentage: 100,
          blend_text: "Original target blend",
        },
      ],
    );
  });

  await it("reuses one winery without a region across concurrently prepared vintages", async () => {
    const { database, sqlite } = setup();
    const [first, second] = await Promise.all([
      prepareWineVintage({
        database,
        siteId: "site",
        wine: {
          wineryName: "Producer",
          designation: "Reserve",
          vintageYear: 2020,
          country: "Australia",
        },
      }),
      prepareWineVintage({
        database,
        siteId: "site",
        wine: {
          wineryName: "Producer",
          designation: "Reserve",
          vintageYear: 2021,
          country: "New Zealand",
        },
      }),
    ]);
    await database.batch(first.statements);
    await database.batch(second.statements);
    assert.deepEqual(
      sqlite
        .prepare("SELECT id, name, region, country FROM wineries")
        .all()
        .map((row) => ({ ...row })),
      [{ id: first.wineryId, name: "Producer", region: null, country: "Australia" }],
    );
    assert.equal(second.wineryId, first.wineryId);
    assert.deepEqual(
      sqlite
        .prepare("SELECT winery_id FROM wine_vintages ORDER BY vintage_year")
        .all()
        .map((row) => row["winery_id"]),
      [first.wineryId, second.wineryId],
    );
    assert.deepEqual(sqlite.prepare("PRAGMA foreign_key_check").all(), []);
  });

  await it("retains arbitrary existing winery IDs and recorded facts while filling unknown country", async () => {
    const { database, sqlite } = setup();
    sqlite.exec(`
      INSERT INTO wineries (id, site_id, name, notes, established_year, address_text)
        VALUES ('legacy-producer-id', 'site', 'Producer', 'Verified estate history', 1890, 'Original address');
    `);
    const prepared = await prepareWineVintage({
      database,
      siteId: "site",
      wine: { wineryName: "Producer", designation: "Reserve", country: "Australia" },
    });
    await database.batch(prepared.statements);
    assert.equal(prepared.wineryId, "legacy-producer-id");
    assert.deepEqual(
      sqlite
        .prepare("SELECT id, country, notes, established_year, address_text FROM wineries")
        .all()
        .map((row) => ({ ...row })),
      [
        {
          id: "legacy-producer-id",
          country: "Australia",
          notes: "Verified estate history",
          established_year: 1890,
          address_text: "Original address",
        },
      ],
    );
  });

  await it("distinguishes complete winery identities with delimiters, long names, and regions", async () => {
    const { database, sqlite } = setup();
    sqlite.exec("INSERT INTO sites (id, name) VALUES ('site:part', 'Other cellar')");
    const identities = [
      { siteId: "site:part", wineryName: "Producer" },
      { siteId: "site", wineryName: "part:Producer" },
      { siteId: "site", wineryName: "A".repeat(150) + "1" },
      { siteId: "site", wineryName: "A".repeat(150) + "2" },
      { siteId: "site", wineryName: "Producer", region: "Barossa" },
      { siteId: "site", wineryName: "Producer" },
    ];
    const prepared = await Promise.all(
      identities.map(async ({ siteId, ...wine }) =>
        prepareWineVintage({
          database,
          siteId,
          wine: { ...wine, designation: "Reserve" },
        }),
      ),
    );
    for (const vintage of prepared) {
      await database.batch(vintage.statements);
    }
    assert.equal(new Set(prepared.map((vintage) => vintage.wineryId)).size, identities.length);
    assert.equal(
      sqlite.prepare("SELECT count(*) AS count FROM wineries").get()?.["count"],
      identities.length,
    );
    assert.deepEqual(sqlite.prepare("PRAGMA foreign_key_check").all(), []);
  });

  await it("rejects an inverted import-candidate window before preparing catalogue writes", async () => {
    const { database, sqlite } = setup();
    await assert.rejects(
      prepareWineVintage({
        database,
        siteId: "site",
        wine: {
          wineryName: "Producer",
          designation: "Reserve",
          drinkFromYear: 2030,
          drinkToYear: 2020,
        },
      }),
      { message: "Drink window must end on or after it starts" },
    );
    assert.equal(sqlite.prepare("SELECT count(*) AS count FROM wineries").get()?.["count"], 0);
    assert.equal(sqlite.prepare("SELECT count(*) AS count FROM wine_vintages").get()?.["count"], 0);
  });
});

function setup() {
  const sqlite = migratedDatabase();
  sqlite.exec("INSERT INTO sites (id, name) VALUES ('site', 'Cellar')");
  return { database: createD1Client(asD1(sqlite)), sqlite };
}
