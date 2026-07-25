import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  roleHasSitePermission,
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

describe("site role permissions", () => {
  for (const role of Object.keys(expectedPermissions) as SiteRole[]) {
    it(`${role} has exactly its documented permissions`, () => {
      for (const permission of permissions) {
        assert.equal(
          roleHasSitePermission(role, permission),
          new Set<SitePermission>(expectedPermissions[role]).has(permission),
          `${role} ${permission}`,
        );
      }
    });
  }

  it("does not let editors manage a site", () => {
    assert.equal(roleHasSitePermission("editor", "site.manage"), false);
  });

  it("does not let viewers mutate site content", () => {
    assert.equal(roleHasSitePermission("viewer", "site.content.write"), false);
    assert.equal(roleHasSitePermission("viewer", "site.manage"), false);
  });
});
