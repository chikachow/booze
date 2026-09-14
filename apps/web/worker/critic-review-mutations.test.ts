import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createD1Client, type BoozeDatabase } from "@chikachow/booze-db";
import { Hono } from "hono";

import { prepareCriticReviewStatements } from "./api/critic-reviews.ts";
import { asD1, migratedDatabase } from "./d1-support.ts";
import { problemResponseForError } from "./api/http.ts";
import type { Bindings } from "./api/types.ts";
import { criticReviewRoutes } from "./routes/critic-reviews.ts";

await describe("critic review mutation preservation", async () => {
  await it("retains a concurrently created review when replacing the wine's review set", async () => {
    const { sqlite } = setup();
    const d1 = asD1(sqlite);
    const batch = d1.batch.bind(d1);
    let winnerId: unknown;
    let attempts = 0;
    d1.batch = async <T>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]> => {
      attempts += 1;
      if (attempts === 1) {
        const first = await request(asD1(sqlite), "/wines/wine-one/critic-reviews", {
          siteId: "site-one",
          reviews: [{ reviewSourceId: "source-one", ratingText: "95 points" }],
        });
        assert.equal(first.status, 200, await first.clone().text());
        winnerId = sqlite
          .prepare("SELECT id FROM critic_reviews WHERE wine_vintage_id = 'wine-one'")
          .get()?.["id"];
      }
      return batch<T>(statements);
    };
    const second = await request(d1, "/wines/wine-one/critic-reviews", {
      siteId: "site-one",
      reviews: [{ reviewSourceId: "source-one", ratingText: "97 points" }],
    });
    assert.equal(second.status, 200, await second.clone().text());
    assert.equal(attempts, 2);
    const stored = sqlite
      .prepare("SELECT id, rating_text FROM critic_reviews WHERE wine_vintage_id = 'wine-one'")
      .all();
    assert.deepEqual(
      stored.map((row) => ({ ...row })),
      [{ id: winnerId, rating_text: "97 points" }],
    );
    const clear = await request(asD1(sqlite), "/wines/wine-one/critic-reviews", {
      siteId: "site-one",
      reviews: [],
    });
    assert.equal(clear.status, 200, await clear.clone().text());
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
        userId: "user_dev-reviewer",
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
        userId: "user_dev-reviewer",
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

  await it("adds a review without replacing other facts and retains stored IDs on replacement", async () => {
    const { sqlite } = setup();
    sqlite.exec(`INSERT INTO critic_reviews
      (id, site_id, wine_vintage_id, review_source_id, rating_text, provenance)
      VALUES ('legacy-review', 'site-one', 'wine-one', 'source-one', '95 points', 'Verified guide')`);
    const added = await request(asD1(sqlite), "/critic-reviews", {
      wineVintageId: "wine-one",
      review: { reviewSourceName: "Second critic", ratingText: "Gold", provenance: "Medal list" },
    });
    assert.equal(added.status, 200, await added.clone().text());
    assert.deepEqual(
      sqlite
        .prepare(
          "SELECT id, rating_text, provenance FROM critic_reviews WHERE id = 'legacy-review'",
        )
        .all()
        .map((row) => ({ ...row })),
      [{ id: "legacy-review", rating_text: "95 points", provenance: "Verified guide" }],
    );
    const replaced = await request(asD1(sqlite), "/wines/wine-one/critic-reviews", {
      siteId: "site-one",
      reviews: [
        { reviewSourceId: "source-one", ratingText: "96 points", provenance: "Verified guide" },
      ],
    });
    assert.equal(replaced.status, 200, await replaced.clone().text());
    assert.deepEqual(
      sqlite
        .prepare("SELECT id, rating_text, provenance FROM critic_reviews ORDER BY id")
        .all()
        .map((row) => ({ ...row })),
      [
        { id: "legacy-review", rating_text: "96 points", provenance: "Verified guide" },
        { id: "unrelated-review", rating_text: "91 points", provenance: null },
      ],
    );
  });
});

function setup() {
  const sqlite = migratedDatabase();
  sqlite.exec(`
    INSERT INTO users (id, clerk_user_id) VALUES ('user_dev-reviewer', 'dev:reviewer');
    INSERT INTO sites (id, name) VALUES ('site-one', 'Cellar');
    INSERT INTO site_memberships (site_id, user_id, role) VALUES ('site-one', 'user_dev-reviewer', 'owner');
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

async function request(
  database: D1Database,
  path: string,
  payload: Record<string, unknown>,
): Promise<Response> {
  const app = new Hono<{ Bindings: Bindings }>()
    .route("/", criticReviewRoutes)
    .onError(problemResponseForError);
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Review routes use only the database binding in local authentication mode.
  const bindings = { DB: database } as Bindings;
  return app.request(
    `http://localhost${path}`,
    {
      method: "PUT",
      headers: { "content-type": "application/json", "x-dev-user": "reviewer" },
      body: JSON.stringify(payload),
    },
    bindings,
  );
}
