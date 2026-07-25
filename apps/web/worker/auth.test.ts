import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  roleHasSitePermission,
  siteRoleSchema,
  type SitePermission,
  type SiteRole,
} from "./api/auth.ts";

const permissions = [
  "site.read",
  "site.content.write",
  "site.manage",
] as const satisfies readonly SitePermission[];

const expectedPermissions = {
  owner: ["site.read", "site.content.write", "site.manage"],
  editor: ["site.read", "site.content.write"],
  viewer: ["site.read"],
} as const satisfies Record<SiteRole, readonly SitePermission[]>;

await describe("site role permissions", async () => {
  for (const role of siteRoleSchema.options) {
    await it(`${role} has exactly its documented permissions`, () => {
      for (const permission of permissions) {
        assert.equal(
          roleHasSitePermission(role, permission),
          new Set<SitePermission>(expectedPermissions[role]).has(permission),
          `${role} ${permission}`,
        );
      }
    });
  }

  await it("does not let editors manage a site", () => {
    assert.equal(roleHasSitePermission("editor", "site.manage"), false);
  });

  await it("does not let viewers mutate site content", () => {
    assert.equal(roleHasSitePermission("viewer", "site.content.write"), false);
    assert.equal(roleHasSitePermission("viewer", "site.manage"), false);
  });
});
