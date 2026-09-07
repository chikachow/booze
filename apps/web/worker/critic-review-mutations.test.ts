import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createD1Client, type BoozeDatabase } from "@chikachow/booze-db";

import { prepareCriticReviewStatements } from "./api/critic-reviews.ts";
import { asD1, migratedDatabase } from "./d1-support.ts";

await describe("critic review mutation preservation", async () => {
  await it("retains a concurrently created review when replacing the wine's review set", async () => {
    const { database, sqlite } = setup();
    const [first, second] = await Promise.all([
      prepareCriticReviewStatements({
        database,
        siteId: "site-one",
        userId: "user-one",
        wineVintageId: "wine-one",
        reviews: [{ reviewSourceId: "source-one", ratingText: "95 points" }],
      }),
      prepareCriticReviewStatements({
        database,
        siteId: "site-one",
        userId: "user-one",
        wineVintageId: "wine-one",
        reviews: [{ reviewSourceId: "source-one", ratingText: "97 points" }],
      }),
    ]);

    await commit(database, first);
    const firstReview = sqlite
      .prepare("SELECT id FROM critic_reviews WHERE wine_vintage_id = 'wine-one'")
      .get();
    assert.ok(firstReview);
    await commit(database, second);

    const stored = sqlite
      .prepare("SELECT id, rating_text FROM critic_reviews WHERE wine_vintage_id = 'wine-one'")
      .all();
    assert.deepEqual(
      stored.map((row) => ({ ...row })),
      [{ id: firstReview["id"], rating_text: "97 points" }],
    );
    const clear = await prepareCriticReviewStatements({
      database,
      siteId: "site-one",
      userId: "user-one",
      wineVintageId: "wine-one",
      reviews: [],
    });
    await commit(database, clear);
    assert.deepEqual(
      sqlite
        .prepare("SELECT id, rating_text FROM critic_reviews")
        .all()
        .map((row) => ({ ...row })),
      [{ id: "unrelated-review", rating_text: "91 points" }],
    );
  });

  await it("does not overwrite a concurrent review when adding evidence with more bottles", async () => {
    const { database, sqlite } = setup();
    const [ownerEdit, bottleEvidence] = await Promise.all([
      prepareCriticReviewStatements({
        database,
        siteId: "site-one",
        userId: "user-one",
        wineVintageId: "wine-one",
        reviews: [
          {
            reviewSourceId: "source-one",
            ratingText: "95 points",
            provenance: "Verified guide",
            notes: "Owner checked this rating",
          },
        ],
      }),
      prepareCriticReviewStatements({
        database,
        siteId: "site-one",
        userId: "user-one",
        wineVintageId: "wine-one",
        overwriteExisting: false,
        removeMissing: false,
        reviews: [{ reviewSourceId: "source-one", ratingText: "85 points" }],
      }),
    ]);

    await commit(database, ownerEdit);
    const before = sqlite.prepare("SELECT * FROM critic_reviews ORDER BY id").all();
    await commit(database, bottleEvidence);
    assert.deepEqual(sqlite.prepare("SELECT * FROM critic_reviews ORDER BY id").all(), before);
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
      VALUES ('wine-one', 'site-one', 'winery-one', 'Reserve', 'Reserve', '2020'),
             ('wine-two', 'site-one', 'winery-one', 'Reserve', 'Reserve', '2021');
    INSERT INTO review_sources (id, site_id, name) VALUES ('source-one', 'site-one', 'Critic');
    INSERT INTO critic_reviews (id, site_id, wine_vintage_id, review_source_id, rating_text)
      VALUES ('unrelated-review', 'site-one', 'wine-two', 'source-one', '91 points');
  `);
  return { database: createD1Client(asD1(sqlite)), sqlite };
}

async function commit(
  database: BoozeDatabase,
  statements: Awaited<ReturnType<typeof prepareCriticReviewStatements>>,
): Promise<void> {
  const [first, ...rest] = statements;
  assert.ok(first);
  await database.batch([first, ...rest]);
}
