// oxlint-disable import/max-dependencies -- Integration test exercises authorization across three route modules.
import assert from "node:assert/strict";
import type { DatabaseSync } from "node:sqlite";
import { describe, it } from "node:test";

import { createD1Client } from "@chikachow/booze-db";

import { requireSitePermission } from "./api/auth.ts";
import { userIdForClerkUser } from "./api/ids.ts";
import type { Bindings } from "./api/types.ts";
import { bottleCaptureRoutes } from "./routes/bottle-captures.ts";
import { siteRoutes } from "./routes/sites.ts";
import { storageLocationRoutes } from "./routes/storage-locations.ts";
import { asD1, migratedDatabase } from "./d1-support.ts";

await describe("database-backed route authorization", async () => {
  await it("allows only an owner to rename or delete a site", async () => {
    for (const [role, expectedPatch, expectedDelete] of [
      ["owner", 200, 204],
      ["editor", 403, 403],
      ["viewer", 403, 403],
    ] as const) {
      const sqlite = migratedDatabase();
      seedMembership(sqlite, role, role);
      const bindings = testBindings(sqlite);

      const patch = await siteRoutes.request(
        "http://localhost/sites/site-1",
        authenticatedRequest(role, "PATCH", { name: "Renamed" }),
        bindings,
      );
      assert.equal(patch.status, expectedPatch, `${role} patch`);

      const deletion = await siteRoutes.request(
        "http://localhost/sites/site-1",
        authenticatedRequest(role, "DELETE"),
        bindings,
      );
      assert.equal(deletion.status, expectedDelete, `${role} delete`);
    }
  });

  await it("allows editors to write site content and keeps viewers read-only", async () => {
    for (const [role, expected] of [
      ["editor", 201],
      ["viewer", 403],
    ] as const) {
      const sqlite = migratedDatabase();
      seedMembership(sqlite, role, role);
      const response = await storageLocationRoutes.request(
        "http://localhost/storage-locations",
        authenticatedRequest(role, "POST", {
          name: "Rack",
          parentId: null,
          siteId: "site-1",
        }),
        testBindings(sqlite),
      );
      assert.equal(response.status, expected, role);
    }
  });

  await it("conceals a site from a user without membership", async () => {
    const sqlite = migratedDatabase();
    seedMembership(sqlite, "owner", "owner");

    const response = await siteRoutes.request(
      "http://localhost/sites/site-1",
      authenticatedRequest("outsider", "PATCH", { name: "Stolen" }),
      testBindings(sqlite),
    );

    assert.equal(response.status, 404);
    assert.equal(siteName(sqlite), "Cellar");
  });

  await it("blocks viewer capture deletion and manual import before either mutation", async () => {
    const sqlite = migratedDatabase();
    seedMembership(sqlite, "viewer", "viewer");
    sqlite
      .prepare(
        `INSERT INTO bottle_captures (id, site_id, user_id, status)
         VALUES ('capture-1', 'site-1', ?, 'needs_review')`,
      )
      .run(userIdForClerkUser("dev:viewer"));
    const bindings = testBindings(sqlite);

    const deletion = await bottleCaptureRoutes.request(
      "http://localhost/bottle-captures/capture-1",
      authenticatedRequest("viewer", "DELETE"),
      bindings,
    );
    const manualImport = await bottleCaptureRoutes.request(
      "http://localhost/bottle-captures/capture-1/import",
      authenticatedRequest("viewer", "POST", {}),
      bindings,
    );

    assert.equal(deletion.status, 403);
    assert.equal(manualImport.status, 403);
    assert.equal(
      sqlite.prepare("SELECT count(*) AS count FROM bottle_captures").get()?.["count"],
      1,
    );
  });

  await it("uses the same database role boundary for MCP write authorization", async () => {
    const sqlite = migratedDatabase();
    seedMembership(sqlite, "editor", "editor");
    seedMembership(sqlite, "viewer", "viewer", "site-2");
    const database = createD1Client(asD1(sqlite));

    await assert.doesNotReject(
      requireSitePermission({
        database,
        permission: "site.content.write",
        siteId: "site-1",
        userId: userIdForClerkUser("dev:editor"),
      }),
    );
    await assert.rejects(
      requireSitePermission({
        database,
        permission: "site.content.write",
        siteId: "site-2",
        userId: userIdForClerkUser("dev:viewer"),
      }),
      (error: unknown) =>
        typeof error === "object" && error !== null && "status" in error && error.status === 403,
    );
  });
});

function seedMembership(
  database: DatabaseSync,
  role: "owner" | "editor" | "viewer",
  devUser: string,
  siteId = "site-1",
): void {
  const userId = userIdForClerkUser(`dev:${devUser}`);
  database
    .prepare("INSERT OR IGNORE INTO users (id, clerk_user_id) VALUES (?, ?)")
    .run(userId, `dev:${devUser}`);
  database.prepare("INSERT OR IGNORE INTO sites (id, name) VALUES (?, 'Cellar')").run(siteId);
  database
    .prepare(
      `INSERT INTO site_memberships (site_id, user_id, role)
       VALUES (?, ?, ?)`,
    )
    .run(siteId, userId, role);
}

function authenticatedRequest(
  devUser: string,
  method: string,
  body?: Record<string, unknown>,
): RequestInit {
  return {
    method,
    headers: {
      ...(body === undefined ? {} : { "content-type": "application/json" }),
      "x-dev-user": devUser,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  };
}

function testBindings(database: DatabaseSync): Bindings {
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Tests provide only route-used bindings.
  return {
    DB: asD1(database),
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Route test only uses R2 delete.
    IMAGE_BUCKET: {
      async delete(keys: string | string[]): Promise<void> {
        assert.ok(typeof keys === "string" || Array.isArray(keys));
      },
    } as unknown as R2Bucket,
  } as Bindings;
}

function siteName(database: DatabaseSync): string {
  return String(database.prepare("SELECT name FROM sites WHERE id = 'site-1'").get()?.["name"]);
}
