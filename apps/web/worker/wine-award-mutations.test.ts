import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createD1Client, type BoozeDatabase } from "@chikachow/booze-db";

import { listWineAwards, prepareWineAwardStatements } from "./api/wine-awards.ts";
import { asD1, migratedDatabase } from "./d1-support.ts";

await describe("wine award mutation preservation", async () => {
  for (const awardYear of [undefined, 2025]) {
    await it(`preserves one ${awardYear === undefined ? "undated" : "dated"} award and its evidence across concurrent bottle additions`, async () => {
      const { database } = setup();
      const [ownerEvidence, bottleEvidence] = await Promise.all([
        prepareWineAwardStatements({
          database,
          siteId: "site-one",
          userId: "user-one",
          wineVintageId: "wine-one",
          overwriteExisting: false,
          removeMissing: false,
          awards: [
            { awardName: "Show", awardLevel: "Gold", awardYear, provenance: "Verified results" },
          ],
        }),
        prepareWineAwardStatements({
          database,
          siteId: "site-one",
          userId: "user-one",
          wineVintageId: "wine-one",
          overwriteExisting: false,
          removeMissing: false,
          awards: [
            { awardName: " Show ", awardLevel: " Gold ", awardYear, provenance: "Extracted label" },
          ],
        }),
      ]);

      await commit(database, ownerEvidence);
      const before = await listWineAwards({
        database,
        userId: "user-one",
        wineVintageId: "wine-one",
      });
      assert.equal(before.length, 1);
      await commit(database, bottleEvidence);
      assert.deepEqual(
        await listWineAwards({ database, userId: "user-one", wineVintageId: "wine-one" }),
        before,
      );
    });
  }

  await it("retains the concurrently inserted award ID when explicitly replacing awards", async () => {
    const { database, sqlite } = setup();
    sqlite.exec(`
      INSERT INTO wine_awards (id, site_id, wine_vintage_id, award_name, award_level)
        VALUES ('unrelated-award', 'site-one', 'wine-one', 'Other show', 'Silver');
    `);
    const award = { awardName: "Show", awardLevel: "Gold", provenance: "Verified results" };
    const [addition, replacement] = await Promise.all([
      prepareWineAwardStatements({
        database,
        siteId: "site-one",
        userId: "user-one",
        wineVintageId: "wine-one",
        overwriteExisting: false,
        removeMissing: false,
        awards: [award],
      }),
      prepareWineAwardStatements({
        database,
        siteId: "site-one",
        userId: "user-one",
        wineVintageId: "wine-one",
        awards: [{ ...award, points: 96, notes: "Owner correction" }],
      }),
    ]);

    await commit(database, addition);
    const winner = (
      await listWineAwards({ database, userId: "user-one", wineVintageId: "wine-one" })
    ).find((candidate) => candidate.awardName === "Show");
    assert.ok(winner);
    await commit(database, replacement);
    const after = await listWineAwards({ database, userId: "user-one", wineVintageId: "wine-one" });
    assert.equal(after.length, 1);
    assert.equal(after[0]?.id, winner.id);
    assert.equal(after[0]?.provenance, "Verified results");
    assert.equal(after[0]?.points, 96);
    assert.equal(after[0]?.notes, "Owner correction");
  });

  await it("preserves legacy duplicate IDs and evidence without guessing which award to delete", async () => {
    const { database, sqlite } = setup();
    sqlite.exec(`
      INSERT INTO wine_awards
        (id, site_id, wine_vintage_id, award_name, award_level, provenance, created_at)
        VALUES ('legacy-z', 'site-one', 'wine-one', 'Show', 'Gold', 'Older evidence', '2001-01-01'),
               ('legacy-a', 'site-one', 'wine-one', 'Show', 'Gold', 'Newer evidence', '2002-01-01');
    `);
    const before = await listWineAwards({
      database,
      userId: "user-one",
      wineVintageId: "wine-one",
    });
    await commit(
      database,
      await prepareWineAwardStatements({
        database,
        siteId: "site-one",
        userId: "user-one",
        wineVintageId: "wine-one",
        overwriteExisting: false,
        removeMissing: false,
        awards: [{ awardName: "Show", awardLevel: "Gold", provenance: "Extracted label" }],
      }),
    );
    assert.deepEqual(
      await listWineAwards({ database, userId: "user-one", wineVintageId: "wine-one" }),
      before,
    );
    await commit(
      database,
      await prepareWineAwardStatements({
        database,
        siteId: "site-one",
        userId: "user-one",
        wineVintageId: "wine-one",
        awards: [{ awardName: " Show ", awardLevel: " Gold ", provenance: "Reviewed results" }],
      }),
    );
    const after = await listWineAwards({ database, userId: "user-one", wineVintageId: "wine-one" });
    assert.equal(after.length, 2);
    assert.equal(after.find((award) => award.id === "legacy-z")?.provenance, "Reviewed results");
    assert.deepEqual(
      after.find((award) => award.id === "legacy-a"),
      before.find((award) => award.id === "legacy-a"),
    );
  });

  await it("keeps undated and dated identities separate and clears only the explicitly replaced wine", async () => {
    const { database, sqlite } = setup();
    sqlite.exec(`
      INSERT INTO wine_vintages (id, site_id, winery_id, base_name, display_name, vintage_label)
        VALUES ('wine-two', 'site-one', 'winery-one', 'Reserve', 'Reserve', '2021');
      INSERT INTO wine_awards (id, site_id, wine_vintage_id, award_name, award_level, provenance)
        VALUES ('other-wine-award', 'site-one', 'wine-two', 'Show', 'Gold', 'Other wine evidence');
    `);
    await commit(
      database,
      await prepareWineAwardStatements({
        database,
        siteId: "site-one",
        userId: "user-one",
        wineVintageId: "wine-one",
        awards: [
          { awardName: "Show", awardLevel: "Gold" },
          { awardName: "Show", awardLevel: "Gold", awardYear: 2025 },
          { awardName: "Show", awardLevel: "Gold", awardYear: 2026 },
        ],
      }),
    );
    assert.deepEqual(
      (await listWineAwards({ database, userId: "user-one", wineVintageId: "wine-one" })).map(
        (award) => award.awardYear,
      ),
      [null, 2025, 2026],
    );
    await commit(
      database,
      await prepareWineAwardStatements({
        database,
        siteId: "site-one",
        userId: "user-one",
        wineVintageId: "wine-one",
        awards: [],
      }),
    );
    const remaining = await listWineAwards({ database, userId: "user-one" });
    assert.equal(remaining.length, 1);
    assert.equal(remaining[0]?.id, "other-wine-award");
    assert.equal(remaining[0]?.provenance, "Other wine evidence");
  });
});

function setup() {
  const sqlite = migratedDatabase();
  sqlite.exec(`
    INSERT INTO users (id, clerk_user_id) VALUES ('user-one', 'dev:reviewer');
    INSERT INTO sites (id, name) VALUES ('site-one', 'Cellar');
    INSERT INTO site_memberships (site_id, user_id, role) VALUES ('site-one', 'user-one', 'owner');
    INSERT INTO wineries (id, site_id, name) VALUES ('winery-one', 'site-one', 'Estate');
    INSERT INTO wine_vintages (id, site_id, winery_id, base_name, display_name, vintage_label)
      VALUES ('wine-one', 'site-one', 'winery-one', 'Reserve', 'Reserve', '2020');
  `);
  return { database: createD1Client(asD1(sqlite)), sqlite };
}

async function commit(
  database: BoozeDatabase,
  statements: Awaited<ReturnType<typeof prepareWineAwardStatements>>,
): Promise<void> {
  const [first, ...rest] = statements;
  assert.ok(first);
  await database.batch([first, ...rest]);
}
