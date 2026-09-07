import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { DatabaseSync } from "node:sqlite";

import { createD1Client } from "@chikachow/booze-db";

import { upsertSite } from "./api/auth.ts";
import { createBottleStatements } from "./api/catalogue.ts";
import { userIdForClerkUser } from "./api/ids.ts";
import type { Bindings } from "./api/types.ts";
import { asD1, migratedDatabase } from "./d1-support.ts";
import { bottleRoutes } from "./routes/bottles.ts";

const siteId = "site_user_abcdefghijklmnopqrstuvwxyz_long_site_identifier";
const wine = {
  wineryName: "Estate",
  designation: "Reserve",
  baseName: "Historic name",
  displayName: "Reserve red",
  vintageYear: 2020,
};

await describe("catalogue mutation preservation", async () => {
  await it("resolves site names by current authorised names and preserves legacy IDs", async () => {
    const db = setup();
    const database = createD1Client(asD1(db));
    const userId = userIdForClerkUser("dev:tester");
    assert.equal((await upsertSite({ database, userId, site: "Cellar" })).siteId, siteId);
    db.prepare("UPDATE sites SET name = 'Renamed' WHERE id = ?").run(siteId);
    const recreated = await upsertSite({ database, userId, site: "Cellar" });
    assert.notEqual(recreated.siteId, siteId);
    assert.equal((await upsertSite({ database, userId, site: "Renamed" })).siteId, siteId);
    const first = await upsertSite({ database, userId, site: "a".repeat(79) + "1" });
    const second = await upsertSite({ database, userId, site: "a".repeat(79) + "2" });
    assert.notEqual(first.siteId, second.siteId);
    db.prepare("UPDATE sites SET name = 'Renamed' WHERE id = ?").run(recreated.siteId);
    await assert.rejects(
      upsertSite({ database, userId, site: "Renamed" }),
      (error: unknown) =>
        typeof error === "object" && error !== null && "status" in error && error.status === 409,
    );
  });

  await it("preserves existing wine facts and constituent details when adding more bottles", async () => {
    const db = setup();
    await create(db, {
      wine: {
        ...wine,
        notes: "Cellar notes",
        drinkFromYear: 2025,
        drinkToYear: 2030,
        alcoholPercent: 13.5,
        grapeVarieties: ["Shiraz"],
      },
    });
    db.exec("UPDATE wine_constituents SET percentage = 100, blend_text = 'Estate grown'");
    await create(db, {
      wine: { ...wine, notes: "Extracted competing notes", grapeVarieties: ["Shiraz", "Syrah!"] },
    });
    await create(db, { wine });
    const stored = db
      .prepare("SELECT notes, drink_from_year, drink_to_year, alcohol_percent FROM wine_vintages")
      .get();
    assert.deepEqual(
      { ...stored },
      { notes: "Cellar notes", drink_from_year: 2025, drink_to_year: 2030, alcohol_percent: 13.5 },
    );
    assert.equal(count(db, "bottles"), 3);
    assert.equal(count(db, "wine_vintages"), 1);
    assert.equal(count(db, "wine_constituents"), 2);
    assert.equal(
      db
        .prepare("SELECT percentage FROM wine_constituents WHERE blend_text = 'Estate grown'")
        .get()?.["percentage"],
      100,
    );
  });

  await it("supports partial wine edits and explicit clearing without renaming the vintage", async () => {
    const db = setup();
    const id = await create(db, {
      wine: {
        ...wine,
        notes: "Keep",
        addressQualification: "Old address",
        alcoholPercent: 14,
        grapeVarieties: ["Shiraz"],
      },
    });
    const vintageId = db.prepare("SELECT wine_vintage_id FROM bottles WHERE id = ?").get(id)?.[
      "wine_vintage_id"
    ];
    const response = await request(db, "PATCH", `/bottles/${id}`, {
      wine: { addressQualification: "New address", alcoholPercent: null },
    });
    assert.equal(response.status, 200);
    const stored = db
      .prepare(
        "SELECT id, base_name, designation, display_name, notes, address_qualification, alcohol_percent FROM wine_vintages",
      )
      .get();
    assert.deepEqual(
      { ...stored },
      {
        id: vintageId,
        base_name: "Historic name",
        designation: "Reserve",
        display_name: "Reserve red",
        notes: "Keep",
        address_qualification: "New address",
        alcohol_percent: null,
      },
    );
    assert.equal(count(db, "wine_constituents"), 1);
    const clear = await request(db, "PATCH", `/bottles/${id}`, {
      wine: { grapeVarieties: [], notes: "" },
    });
    assert.equal(clear.status, 200);
    assert.equal(count(db, "wine_constituents"), 0);
    assert.equal(db.prepare("SELECT notes FROM wine_vintages").get()?.["notes"], null);
  });

  await it("preserves nullable designation and constituent measurements on unrelated edits and reassignment", async () => {
    const db = setup();
    const id = await create(db, { wine: { ...wine, grapeVarieties: ["Shiraz"], notes: "Keep" } });
    db.exec(
      "UPDATE wine_vintages SET designation = NULL; UPDATE wine_constituents SET percentage = 100, blend_text = 'Old vines'",
    );
    const edit = await request(db, "PATCH", `/bottles/${id}`, { wine: { notes: "Updated" } });
    assert.equal(edit.status, 200);
    assert.equal(db.prepare("SELECT designation FROM wine_vintages").get()?.["designation"], null);
    const move = await request(db, "PATCH", `/bottles/${id}`, { wine: { vintageYear: 2021 } });
    assert.equal(move.status, 200);
    assert.equal(count(db, "wine_vintages"), 2);
    assert.equal(count(db, "wine_constituents"), 2);
    const stored = db
      .prepare(
        "SELECT v.notes, v.designation, c.percentage, c.blend_text FROM bottles b JOIN wine_vintages v ON b.wine_vintage_id = v.id JOIN wine_constituents c ON c.wine_vintage_id = v.id WHERE b.id = ?",
      )
      .get(id);
    assert.deepEqual(
      { ...stored },
      { notes: "Updated", designation: null, percentage: 100, blend_text: "Old vines" },
    );
  });

  await it("preserves reviews and awards when more bottles are entered with empty evidence", async () => {
    const db = setup();
    await create(db, {
      wine,
      criticReviews: [{ reviewSourceName: "Critic", ratingText: "95 points" }],
      awards: [{ awardName: "Show", awardLevel: "Gold" }],
    });
    await create(db, { wine, criticReviews: [], awards: [] });
    await create(db, {
      wine,
      criticReviews: [{ reviewSourceName: "Critic", ratingText: "90 points" }],
      awards: [{ awardName: "Show", awardLevel: "Gold", notes: "Changed" }],
    });
    assert.equal(count(db, "critic_reviews"), 1);
    assert.equal(count(db, "wine_awards"), 1);
    assert.equal(
      db.prepare("SELECT rating_text FROM critic_reviews").get()?.["rating_text"],
      "95 points",
    );
    assert.equal(db.prepare("SELECT notes FROM wine_awards").get()?.["notes"], null);
  });

  await it("validates the destination before changing bottle or wine facts", async () => {
    const db = setup();
    const id = await create(db, { wine: { ...wine, notes: "Keep" } });
    const response = await request(db, "PATCH", `/bottles/${id}`, {
      status: "consumed",
      wine: { notes: "Changed" },
      storageLocationId: "missing-location",
    });
    assert.equal(response.status, 400);
    assert.equal(db.prepare("SELECT status FROM bottles").get()?.["status"], "in_stock");
    assert.equal(db.prepare("SELECT notes FROM wine_vintages").get()?.["notes"], "Keep");
  });

  await it("rolls back wine, bottles, locations and evidence if the final award write fails", async () => {
    const db = setup();
    db.exec(
      "CREATE TRIGGER fail_award BEFORE INSERT ON wine_awards BEGIN SELECT RAISE(ABORT, 'injected award failure'); END",
    );
    const response = await request(db, "POST", "/bottles", {
      siteId,
      storageLocationId: "location-1",
      quantity: 24,
      wine: { ...wine, grapeVarieties: ["Shiraz"] },
      labelExtraction: { extractedFieldsJson: "{}" },
      criticReviews: [{ reviewSourceName: "Independent critic", ratingText: "95 points" }],
      awards: [{ awardName: "Wine show", awardLevel: "Gold" }],
    });
    assert.equal(response.status, 500);
    for (const table of [
      "bottles",
      "bottle_locations",
      "wine_vintages",
      "wineries",
      "wine_constituents",
      "label_extractions",
      "critic_reviews",
      "wine_awards",
    ])
      assert.equal(count(db, table), 0, table);
  });

  await it("preserves the original location when a replacement insert fails", async () => {
    const db = setup();
    const id = await create(db, { wine, storageLocationId: "location-1" });
    db.prepare(
      "INSERT INTO storage_locations (id, site_id, name) VALUES ('location-2', ?, 'Rack 2')",
    ).run(siteId);
    db.exec(
      "CREATE TRIGGER fail_move BEFORE INSERT ON bottle_locations WHEN NEW.storage_location_id = 'location-2' BEGIN SELECT RAISE(ABORT, 'injected move failure'); END",
    );
    const response = await request(db, "PATCH", `/bottles/${id}`, {
      storageLocationId: "location-2",
      wine: { notes: "Should roll back" },
    });
    assert.equal(response.status, 500);
    assert.equal(
      db.prepare("SELECT storage_location_id FROM bottle_locations").get()?.["storage_location_id"],
      "location-1",
    );
    assert.equal(db.prepare("SELECT notes FROM wine_vintages").get()?.["notes"], null);
  });

  await it("keeps distinct awards for long site and vintage IDs and preserves IDs on edit", async () => {
    const db = setup();
    const awards = [
      { awardName: "First show", awardLevel: "Gold", awardYear: 2024 },
      { awardName: "Second show", awardLevel: "Silver", awardYear: 2025 },
    ];
    const id = await create(db, { wine, awards });
    const before = db.prepare("SELECT id, award_name FROM wine_awards ORDER BY award_name").all();
    assert.equal(before.length, 2);
    const response = await request(db, "PATCH", `/bottles/${id}`, {
      awards: awards.map((award) => ({ ...award, notes: "Updated" })),
    });
    assert.equal(response.status, 200);
    assert.deepEqual(
      db.prepare("SELECT id, award_name FROM wine_awards ORDER BY award_name").all(),
      before,
    );
  });

  await it("rejects unavailable review sources before any bottle mutation", async () => {
    const db = setup();
    const id = await create(db, { wine });
    const response = await request(db, "PATCH", `/bottles/${id}`, {
      status: "consumed",
      criticReviews: [{ reviewSourceId: "unavailable", ratingText: "95 points" }],
    });
    assert.equal(response.status, 400);
    assert.equal(db.prepare("SELECT status FROM bottles").get()?.["status"], "in_stock");
  });

  await it("uses bounded statements for 24 physical bottles", () => {
    const db = setup();
    const result = createBottleStatements({
      database: createD1Client(asD1(db)),
      siteId,
      wineVintageId: "wine",
      storageLocationId: "location-1",
      positionHint: "1",
      quantity: 24,
      bottle: {},
    });
    assert.equal(result.bottleIds.length, 24);
    assert.equal(new Set(result.bottleIds).size, 24);
    assert.equal(result.statements.length, 48);
    for (const statement of result.statements) {
      assert.ok("toSQL" in statement && typeof statement.toSQL === "function");
      // oxlint-disable-next-line typescript/no-unsafe-call -- The preceding guard verifies this query exposes its SQL compiler.
      const query: unknown = statement.toSQL();
      assert.ok(
        typeof query === "object" &&
          query !== null &&
          "params" in query &&
          Array.isArray(query.params),
      );
      assert.ok(query.params.length <= 100);
    }
  });
});

function setup(): DatabaseSync {
  const db = migratedDatabase();
  db.prepare("INSERT INTO users (id, clerk_user_id) VALUES (?, 'dev:tester')").run(
    userIdForClerkUser("dev:tester"),
  );
  db.prepare("INSERT INTO sites (id, name) VALUES (?, 'Cellar')").run(siteId);
  db.prepare("INSERT INTO site_memberships (site_id, user_id, role) VALUES (?, ?, 'owner')").run(
    siteId,
    userIdForClerkUser("dev:tester"),
  );
  db.prepare(
    "INSERT INTO storage_locations (id, site_id, name) VALUES ('location-1', ?, 'Rack')",
  ).run(siteId);
  return db;
}

async function create(db: DatabaseSync, payload: Record<string, unknown>): Promise<string> {
  const response = await request(db, "POST", "/bottles", { siteId, ...payload });
  assert.equal(response.status, 201, await response.clone().text());
  const body: unknown = await response.json();
  assert.ok(
    typeof body === "object" &&
      body !== null &&
      "data" in body &&
      typeof body.data === "object" &&
      body.data !== null &&
      "bottleIds" in body.data &&
      Array.isArray(body.data.bottleIds),
  );
  return String(body.data.bottleIds[0]);
}

async function request(
  db: DatabaseSync,
  method: string,
  path: string,
  payload: Record<string, unknown>,
): Promise<Response> {
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Route tests supply only the database binding used by these handlers.
  const bindings = { DB: asD1(db) } as Bindings;
  return bottleRoutes.request(
    `http://localhost${path}`,
    {
      method,
      headers: { "content-type": "application/json", "x-dev-user": "tester" },
      body: JSON.stringify(payload),
    },
    bindings,
  );
}

function count(db: DatabaseSync, table: string): number {
  return Number(db.prepare(`SELECT count(*) AS count FROM ${table}`).get()?.["count"]);
}
