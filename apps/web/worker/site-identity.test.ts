import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createD1Client } from "@chikachow/booze-db";

import { upsertSite } from "./api/auth.ts";
import { asD1, migratedDatabase } from "./d1-support.ts";

await describe("site identity", async () => {
  await it("returns rows from transactional D1 batch statements", async () => {
    const sqlite = migratedDatabase();
    const binding = asD1(sqlite);
    const results = await binding.batch<{ readonly id: string }>([
      binding.prepare(
        "INSERT INTO users (id, clerk_user_id) VALUES ('user', 'clerk') RETURNING id",
      ),
      binding.prepare("SELECT id FROM users"),
    ]);
    assert.deepEqual(
      results.map((result) => result.results.map((row) => ({ ...row }))),
      [[{ id: "user" }], [{ id: "user" }]],
    );
    assert.deepEqual(
      results.map((result) => result.meta.changes),
      [1, 0],
    );
  });

  await it("converges when both same-user/name requests reach their batch before either commits", async () => {
    const { sqlite, binding } = setup();
    const { promise: ready, resolve: release } = Promise.withResolvers<boolean>();
    let arrivals = 0;
    const originalBatch = binding.batch.bind(binding);
    binding.batch = async (statements) => {
      arrivals += 1;
      if (arrivals === 2) release(true);
      await ready;
      return originalBatch(statements);
    };
    const database = createD1Client(binding);
    const results = await Promise.all([
      upsertSite({ database, userId: "user", site: "Cellar" }),
      upsertSite({ database, userId: "user", site: "Cellar" }),
    ]);
    assert.equal(results[0]?.siteId, results[1]?.siteId);
    assert.equal(sqlite.prepare("SELECT count(*) AS count FROM sites").get()?.["count"], 1);
    assert.equal(
      (await upsertSite({ database: createD1Client(binding), userId: "user", site: "Cellar" }))
        .siteId,
      results[0]?.siteId,
    );
  });

  await it("reuses a unique shared site without upgrading viewer or editor roles", async () => {
    for (const role of ["viewer", "editor"]) {
      const { sqlite, binding } = setup();
      sqlite.prepare("INSERT INTO sites (id, name) VALUES ('shared', 'Cellar')").run();
      sqlite
        .prepare(
          "INSERT INTO site_memberships (site_id, user_id, role) VALUES ('shared', 'user', ?)",
        )
        .run(role);
      const result = await upsertSite({
        database: createD1Client(binding),
        userId: "user",
        site: "Cellar",
      });
      assert.equal(result.siteId, "shared");
      assert.equal(sqlite.prepare("SELECT role FROM site_memberships").get()?.["role"], role);
      assert.equal(sqlite.prepare("SELECT count(*) AS count FROM sites").get()?.["count"], 1);
    }
  });

  await it("allows unrelated users to create separate sites with the same name", async () => {
    const { sqlite, binding } = setup();
    sqlite.prepare("INSERT INTO users (id, clerk_user_id) VALUES ('other', 'other-clerk')").run();
    const database = createD1Client(binding);
    const first = await upsertSite({ database, userId: "user", site: "Cellar" });
    const second = await upsertSite({ database, userId: "other", site: "Cellar" });
    assert.notEqual(first.siteId, second.siteId);
    assert.equal(sqlite.prepare("SELECT count(*) AS count FROM sites").get()?.["count"], 2);
  });

  await it("rolls back the new site when its owner membership cannot be inserted", async () => {
    const { sqlite, binding } = setup();
    sqlite.exec(`CREATE TRIGGER fail_membership BEFORE INSERT ON site_memberships
      BEGIN SELECT RAISE(ABORT, 'membership failure'); END`);
    await assert.rejects(
      upsertSite({ database: createD1Client(binding), userId: "user", site: "Cellar" }),
      /membership failure/u,
    );
    assert.equal(sqlite.prepare("SELECT count(*) AS count FROM sites").get()?.["count"], 0);
  });

  await it("rejects an ambiguous name without creating another site, including ambiguity arising before the batch", async () => {
    for (const race of [false, true]) {
      const { sqlite, binding } = setup();
      const addSharedSites = (): void => {
        sqlite.exec(
          "INSERT INTO sites (id, name) VALUES ('first', 'Cellar'), ('second', 'Cellar')",
        );
        sqlite.exec(
          "INSERT INTO site_memberships (site_id, user_id, role) VALUES ('first', 'user', 'viewer'), ('second', 'user', 'editor')",
        );
      };
      if (!race) addSharedSites();
      const originalBatch = binding.batch.bind(binding);
      binding.batch = async (statements) => {
        if (race) addSharedSites();
        return originalBatch(statements);
      };
      const database = createD1Client(binding);
      await assert.rejects(upsertSite({ database, userId: "user", site: "Cellar" }), {
        status: 409,
      });
      assert.equal(sqlite.prepare("SELECT count(*) AS count FROM sites").get()?.["count"], 2);
    }
  });

  await it("preserves IDs across rename and assigns a fresh ID when the old name is recreated", async () => {
    const { sqlite, binding } = setup();
    const database = createD1Client(binding);
    const first = await upsertSite({ database, userId: "user", site: "Cellar" });
    sqlite.prepare("UPDATE sites SET name = 'Renamed' WHERE id = ?").run(first.siteId);
    assert.equal(
      (await upsertSite({ database, userId: "user", site: "Renamed" })).siteId,
      first.siteId,
    );
    assert.notEqual(
      (await upsertSite({ database, userId: "user", site: "Cellar" })).siteId,
      first.siteId,
    );
  });
});

function setup() {
  const sqlite = migratedDatabase();
  sqlite.prepare("INSERT INTO users (id, clerk_user_id) VALUES ('user', 'clerk')").run();
  return { sqlite, binding: asD1(sqlite) };
}
