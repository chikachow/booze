import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Hono } from "hono";
import { problemResponseForError } from "./api/http.ts";
import { userIdForClerkUser } from "./api/ids.ts";
import type { Bindings } from "./api/types.ts";
import { asD1, migratedDatabase } from "./d1-support.ts";
import { bottleRoutes } from "./routes/bottles.ts";

const app = new Hono<{ Bindings: Bindings }>()
  .route("/", bottleRoutes)
  .onError(problemResponseForError);
function setup() {
  const sqlite = migratedDatabase();
  const user = userIdForClerkUser("dev:tester");
  sqlite.prepare("INSERT INTO users (id, clerk_user_id) VALUES (?, 'dev:tester')").run(user);
  sqlite.exec("INSERT INTO sites (id, name) VALUES ('site', 'Home')");
  sqlite
    .prepare("INSERT INTO site_memberships (site_id, user_id, role) VALUES ('site', ?, 'owner')")
    .run(user);
  sqlite.exec(`INSERT INTO wineries (id, site_id, name) VALUES ('winery', 'site', 'Producer');
    INSERT INTO wine_vintages (id, site_id, winery_id, base_name, display_name, designation, vintage_label, notes)
      VALUES ('wine', 'site', 'winery', 'Reserve', 'Producer Reserve', 'Reserve', 'Unknown', 'Original notes');
    INSERT INTO bottles (id, site_id, wine_vintage_id) VALUES ('one', 'site', 'wine'), ('two', 'site', 'wine');`);
  const d1 = asD1(sqlite);
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- The exercised routes only require D1 and local development authentication.
  const bindings = { DB: d1 } as Bindings;
  return {
    sqlite,
    d1,
    request: async (payload: unknown) => {
      return app.request(
        "http://localhost/bottles/one",
        {
          method: "PATCH",
          headers: { "content-type": "application/json", "x-dev-user": "tester" },
          body: JSON.stringify(payload),
        },
        bindings,
      );
    },
  };
}

await describe("independent wine identity review", async () => {
  await it("preserves a concurrent unrelated wine correction", async () => {
    const { sqlite, d1, request } = setup();
    const batch = d1.batch.bind(d1);
    let changed = false;
    d1.batch = async (statements) => {
      if (!changed) {
        changed = true;
        sqlite.exec(
          "UPDATE wine_vintages SET notes = 'Concurrently corrected notes' WHERE id = 'wine'",
        );
      }
      return batch(statements);
    };
    const response = await request({
      wineEditScope: "shared",
      expectedWineVintageId: "wine",
      expectedAffectedBottleCount: 2,
      wine: { alcoholPercent: 13 },
    });
    assert.ok([200, 409].includes(response.status), await response.clone().text());
    assert.equal(
      sqlite.prepare("SELECT notes FROM wine_vintages WHERE id = 'wine'").get()?.["notes"],
      "Concurrently corrected notes",
    );
  });

  await it("rejects a derived title based on concurrently changed identity facts", async () => {
    const { sqlite, d1, request } = setup();
    const batch = d1.batch.bind(d1);
    let changed = false;
    d1.batch = async (statements) => {
      if (!changed) {
        changed = true;
        sqlite.exec(
          "UPDATE wine_vintages SET designation = 'Black Label', display_name = 'Producer Black Label' WHERE id = 'wine'",
        );
      }
      return batch(statements);
    };
    const response = await request({
      wineEditScope: "shared",
      expectedWineVintageId: "wine",
      expectedAffectedBottleCount: 2,
      wine: { grapeVarieties: ["Shiraz"] },
    });
    assert.equal(response.status, 409, await response.clone().text());
    assert.equal(
      sqlite.prepare("SELECT display_name FROM wine_vintages WHERE id = 'wine'").get()?.[
        "display_name"
      ],
      "Producer Black Label",
    );
    assert.equal(
      sqlite.prepare("SELECT count(*) AS count FROM wine_constituents").get()?.["count"],
      0,
    );
  });

  await it("does not revert a concurrent producer correction while changing region", async () => {
    const { sqlite, d1, request } = setup();
    sqlite.exec(
      "INSERT INTO wineries (id, site_id, name) VALUES ('correct-producer', 'site', 'Correct Producer')",
    );
    const batch = d1.batch.bind(d1);
    let changed = false;
    d1.batch = async (statements) => {
      if (!changed) {
        changed = true;
        sqlite.exec(
          "UPDATE wine_vintages SET winery_id = 'correct-producer', display_name = 'Correct Producer Reserve' WHERE id = 'wine'",
        );
      }
      return batch(statements);
    };
    const response = await request({
      wineEditScope: "shared",
      expectedWineVintageId: "wine",
      expectedAffectedBottleCount: 2,
      wine: { region: "Orange" },
    });
    assert.ok([200, 409].includes(response.status), await response.clone().text());
    assert.equal(
      sqlite
        .prepare(
          "SELECT w.name FROM wine_vintages v JOIN wineries w ON v.winery_id = w.id WHERE v.id = 'wine'",
        )
        .get()?.["name"],
      "Correct Producer",
    );
  });

  await it("requires shared-scope acknowledgement for bottle-route award edits", async () => {
    const { sqlite, request } = setup();
    const response = await request({
      awards: [{ awardName: "Wine Show", awardLevel: "Gold", awardYear: 2025 }],
    });
    assert.equal(response.status, 400, await response.clone().text());
    assert.equal(sqlite.prepare("SELECT count(*) AS count FROM wine_awards").get()?.["count"], 0);
  });
  await it("can correct a known-year wine inserted by the old writer during deployment", async () => {
    const { sqlite, request } = setup();
    // The old worker omits vintage_status after the new column exists.
    sqlite.exec(
      "UPDATE wine_vintages SET vintage_year = 2022, vintage_label = '2022', vintage_status = 'unknown'",
    );
    const response = await request({
      wineEditScope: "shared",
      expectedWineVintageId: "wine",
      expectedAffectedBottleCount: 2,
      wine: { notes: "Corrected" },
    });
    assert.equal(response.status, 200, await response.clone().text());
    assert.equal(
      sqlite.prepare("SELECT vintage_year FROM wine_vintages WHERE id = 'wine'").get()?.[
        "vintage_year"
      ],
      2022,
    );
  });
});
