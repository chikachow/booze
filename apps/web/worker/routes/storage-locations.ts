// oxlint-disable eslint/no-use-before-define
import {
  bottleLocations,
  createD1Client,
  sites,
  storageLocations,
  type BoozeDatabase,
} from "@chikachow/booze-db";
import { and, asc, eq, sql } from "drizzle-orm";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";

import { requireAuthenticatedUser, requireSitePermission, upsertSite } from "../api/auth.ts";
import { upsertStorageLocation } from "../api/catalogue.ts";
import { created, locationHeader, noContent } from "../api/http.ts";
import type { Bindings } from "../api/types.ts";

const createStorageLocationSchema = z.object({
  siteId: z.string().trim().min(1).optional(),
  siteName: z.string().trim().min(1).max(80).optional(),
  parentId: z.string().trim().min(1).nullable().optional(),
  name: z.string().trim().min(1).max(120),
  locationType: z.string().trim().min(1).max(40).default("area"),
});

const updateStorageLocationSchema = z.object({
  parentId: z.string().trim().min(1).nullable().optional(),
  name: z.string().trim().min(1).max(120).optional(),
  locationType: z.string().trim().min(1).max(40).optional(),
  notes: z.string().trim().max(2_000).optional(),
});

export const storageLocationRoutes = new Hono<{ Bindings: Bindings }>()
  .get("/storage-locations", async (context) => {
    const database = createD1Client(context.env.DB);
    const authenticatedUser = await requireAuthenticatedUser({
      database,
      request: context.req.raw,
      headers: context.req.raw.headers,
      secretKey: context.env.CLERK_SECRET_KEY,
    });
    const rows = await listStorageLocations({ database, userId: authenticatedUser.userId });
    return context.json({ data: rows });
  })
  .post("/storage-locations", async (context) => {
    const payload = createStorageLocationSchema.parse(await context.req.json());
    const database = createD1Client(context.env.DB);
    const authenticatedUser = await requireAuthenticatedUser({
      database,
      request: context.req.raw,
      headers: context.req.raw.headers,
      secretKey: context.env.CLERK_SECRET_KEY,
    });

    const siteId =
      payload.siteId ??
      (
        await upsertSite({
          database,
          site: payload.siteName ?? "home",
          userId: authenticatedUser.userId,
        })
      ).siteId;

    await requireSitePermission({
      database,
      permission: "site.content.write",
      siteId,
      userId: authenticatedUser.userId,
    });

    const result = await upsertStorageLocation({
      database,
      siteId,
      name: payload.name,
      locationType: payload.locationType,
      parentId: payload.parentId ?? null,
    });

    return created(
      { id: result.storageLocationId, siteId, ...payload },
      locationHeader(`/api/storage-locations/${result.storageLocationId}`),
    );
  })
  .patch("/storage-locations/:storageLocationId", async (context) => {
    const payload = updateStorageLocationSchema.parse(await context.req.json());
    const database = createD1Client(context.env.DB);
    const authenticatedUser = await requireAuthenticatedUser({
      database,
      request: context.req.raw,
      headers: context.req.raw.headers,
      secretKey: context.env.CLERK_SECRET_KEY,
    });
    const storageLocationId = context.req.param("storageLocationId");
    const existing = await getStorageLocationSiteId({ database, storageLocationId });
    await requireSitePermission({
      database,
      permission: "site.content.write",
      siteId: existing.siteId,
      userId: authenticatedUser.userId,
    });

    await database
      .update(storageLocations)
      .set({
        ...(payload.parentId === undefined ? {} : { parentId: payload.parentId }),
        ...(payload.name === undefined ? {} : { name: payload.name }),
        ...(payload.locationType === undefined ? {} : { locationType: payload.locationType }),
        ...(payload.notes === undefined ? {} : { notes: payload.notes }),
        updatedAt: sql`CURRENT_TIMESTAMP`,
      })
      .where(eq(storageLocations.id, storageLocationId));

    return context.json({ data: { id: storageLocationId } });
  })
  .delete("/storage-locations/:storageLocationId", async (context) => {
    const database = createD1Client(context.env.DB);
    const authenticatedUser = await requireAuthenticatedUser({
      database,
      request: context.req.raw,
      headers: context.req.raw.headers,
      secretKey: context.env.CLERK_SECRET_KEY,
    });
    const storageLocationId = context.req.param("storageLocationId");
    const existing = await getStorageLocationSiteId({ database, storageLocationId });
    await requireSitePermission({
      database,
      permission: "site.content.write",
      siteId: existing.siteId,
      userId: authenticatedUser.userId,
    });

    await database
      .delete(bottleLocations)
      .where(eq(bottleLocations.storageLocationId, storageLocationId));
    await database
      .update(storageLocations)
      .set({ parentId: null, updatedAt: sql`CURRENT_TIMESTAMP` })
      .where(eq(storageLocations.parentId, storageLocationId));
    await database.delete(storageLocations).where(eq(storageLocations.id, storageLocationId));

    return noContent();
  });

type StorageLocationListRow = {
  readonly id: string;
  readonly siteId: string;
  readonly siteName: string;
  readonly parentId: string | null;
  readonly name: string;
  readonly locationType: string;
  readonly bottleCount: number;
};

async function listStorageLocations({
  database,
  userId,
}: {
  readonly database: BoozeDatabase;
  readonly userId: string;
}): Promise<readonly StorageLocationListRow[]> {
  const rows = await database
    .select({
      id: storageLocations.id,
      siteId: storageLocations.siteId,
      siteName: sites.name,
      parentId: storageLocations.parentId,
      name: storageLocations.name,
      locationType: storageLocations.locationType,
      bottleCount: sql<number>`count(${bottleLocations.bottleId})`,
    })
    .from(storageLocations)
    .innerJoin(sites, eq(storageLocations.siteId, sites.id))
    .leftJoin(
      bottleLocations,
      and(
        eq(storageLocations.siteId, bottleLocations.siteId),
        eq(storageLocations.id, bottleLocations.storageLocationId),
      ),
    )
    .where(sql`exists (
      select 1 from site_memberships
      where site_memberships.site_id = ${storageLocations.siteId}
      and site_memberships.user_id = ${userId}
    )`)
    .groupBy(
      storageLocations.id,
      storageLocations.siteId,
      sites.name,
      storageLocations.parentId,
      storageLocations.name,
      storageLocations.locationType,
    )
    .orderBy(asc(sites.name), asc(storageLocations.name));

  const byId = new Map(rows.map((row) => [row.id, row]));
  return rows.toSorted((left, right) => {
    const siteOrder = left.siteName.localeCompare(right.siteName);
    if (siteOrder !== 0) {
      return siteOrder;
    }
    return storageLocationDisplayName({ byId, locationId: left.id }).localeCompare(
      storageLocationDisplayName({ byId, locationId: right.id }),
    );
  });
}

function storageLocationDisplayName({
  byId,
  locationId,
}: {
  readonly byId: ReadonlyMap<string, StorageLocationListRow>;
  readonly locationId: string;
}): string {
  const row = byId.get(locationId);
  if (row === undefined) {
    return locationId;
  }

  const parts = [row.name];
  let parentId = row.parentId;
  const seen = new Set([row.id]);
  while (parentId !== null && !seen.has(parentId)) {
    const parent = byId.get(parentId);
    if (parent === undefined) {
      break;
    }
    parts.unshift(parent.name);
    seen.add(parent.id);
    parentId = parent.parentId;
  }
  return parts.join(" / ");
}

async function getStorageLocationSiteId({
  database,
  storageLocationId,
}: {
  readonly database: BoozeDatabase;
  readonly storageLocationId: string;
}): Promise<{ readonly siteId: string }> {
  const rows = await database
    .select({ siteId: storageLocations.siteId })
    .from(storageLocations)
    .where(eq(storageLocations.id, storageLocationId))
    .limit(1);

  const row = rows[0];
  if (row === undefined) {
    throw new HTTPException(404, { message: "Storage location not found" });
  }
  return row;
}
