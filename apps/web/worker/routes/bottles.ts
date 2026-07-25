// oxlint-disable eslint/no-use-before-define
// oxlint-disable import/max-dependencies
import {
  bottleLocations,
  bottles,
  createD1Client,
  labelExtractions,
  storageLocations,
  type BoozeDatabase,
} from "@chikachow/booze-db";
import { and, eq, sql } from "drizzle-orm";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";

import { assertCanAccessSite, requireAuthenticatedUser, upsertSite } from "../api/auth.ts";
import { createBottles, upsertStorageLocation, upsertWineVintage } from "../api/catalogue.ts";
import { replaceCriticReviewsForWine } from "../api/critic-reviews.ts";
import { created, locationHeader, noContent } from "../api/http.ts";
import { optionalText } from "../api/ids.ts";
import { listBottles } from "../api/inventory.ts";
import { replaceWineAwardsForWine } from "../api/wine-awards.ts";
import { criticReviewInputSchema } from "./critic-reviews.ts";
import type { Bindings } from "../api/types.ts";

const wineInputSchema = z.object({
  wineryName: z.string().trim().min(1).max(160),
  brandName: z.string().trim().max(160).optional(),
  baseName: z.string().trim().max(180).optional(),
  designation: z.string().trim().min(1).max(160),
  displayName: z.string().trim().max(180).optional(),
  vintageYear: z.number().int().min(1800).max(2200).optional(),
  grapeVarieties: z.array(z.string().trim().min(1).max(120)).max(24).optional(),
  country: z.string().trim().max(120).optional(),
  region: z.string().trim().max(160).optional(),
  appellation: z.string().trim().max(160).optional(),
  classification: z.string().trim().max(160).optional(),
  wineType: z.string().trim().max(80).optional(),
  wineColor: z.string().trim().max(40).optional(),
  addressQualification: z.string().trim().max(120).optional(),
  alcoholPercent: z.number().min(0).max(100).optional(),
  drinkFromYear: z.number().int().min(1800).max(2200).optional(),
  drinkToYear: z.number().int().min(1800).max(2200).optional(),
  description: z.string().trim().max(2_000).optional(),
  drinkingAdvice: z.string().trim().max(2_000).optional(),
  labelText: z.string().trim().max(4_000).optional(),
  sourceUrl: z.url().trim().max(500).optional().or(z.literal("")),
  notes: z.string().trim().max(2_000).optional(),
});

const bottleInputSchema = z.object({
  bottleNumber: z.string().trim().max(80).optional(),
  volumeMl: z.number().int().min(1).max(30_000).optional(),
  barcode: z.string().trim().max(80).optional(),
  lotCode: z.string().trim().max(120).optional(),
  notes: z.string().trim().max(2_000).optional(),
});

const wineAwardInputSchema = z.object({
  id: z.string().trim().min(1).max(120).optional(),
  awardName: z.string().trim().min(1).max(180),
  awardLevel: z.string().trim().min(1).max(80),
  awardYear: z.number().int().min(1800).max(2200).optional(),
  awardBody: z.string().trim().max(180).optional(),
  category: z.string().trim().max(180).optional(),
  points: z.number().min(0).max(1000).optional(),
  sourceUrl: z.url().trim().max(500).optional().or(z.literal("")),
  provenance: z.string().trim().max(500).optional(),
  notes: z.string().trim().max(1_000).optional(),
});

const createBottleSchema = z.object({
  siteId: z.string().trim().min(1).optional(),
  siteName: z.string().trim().min(1).max(80).optional(),
  storageLocationId: z.string().trim().min(1).nullable().optional(),
  storageLocationName: z.string().trim().max(120).optional(),
  positionHint: z.string().trim().max(120).optional(),
  quantity: z.number().int().min(1).max(24).default(1),
  wine: wineInputSchema,
  bottle: bottleInputSchema.default({}),
  labelExtraction: z
    .object({
      extractedFieldsJson: z.string().trim().min(1).max(80_000),
      rawTextJson: z.string().trim().max(80_000).optional(),
      confidence: z.number().min(0).max(1).optional(),
      requiresReview: z.boolean().optional(),
    })
    .optional(),
  criticReviews: z.array(criticReviewInputSchema).max(24).optional(),
  awards: z.array(wineAwardInputSchema).max(24).optional(),
});

const patchBottleSchema = z.object({
  status: z.enum(["in_stock", "consumed"]).optional(),
  storageLocationId: z.string().trim().min(1).nullable().optional(),
  positionHint: z.string().trim().max(120).optional(),
  bottle: bottleInputSchema.optional(),
  wine: wineInputSchema.optional(),
  labelExtraction: createBottleSchema.shape.labelExtraction,
  criticReviews: z.array(criticReviewInputSchema).max(24).optional(),
  awards: z.array(wineAwardInputSchema).max(24).optional(),
});

export const bottleRoutes = new Hono<{ Bindings: Bindings }>()
  .get("/bottles", async (context) => {
    const database = createD1Client(context.env.DB);
    const authenticatedUser = await requireAuthenticatedUser({
      database,
      request: context.req.raw,
      headers: context.req.raw.headers,
      secretKey: context.env.CLERK_SECRET_KEY,
    });

    const rows = await listBottles({ database, userId: authenticatedUser.userId });
    return context.json({ data: rows });
  })
  .post("/bottles", async (context) => {
    const payload = createBottleSchema.parse(await context.req.json());
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

    await assertCanAccessSite({ database, siteId, userId: authenticatedUser.userId });

    const storageLocationId =
      payload.storageLocationId ??
      (optionalText(payload.storageLocationName) === null
        ? null
        : (
            await upsertStorageLocation({
              database,
              siteId,
              name: payload.storageLocationName ?? "",
            })
          ).storageLocationId);

    if (storageLocationId !== null) {
      await assertStorageLocationInSite({ database, siteId, storageLocationId });
    }

    const vintage = await upsertWineVintage({ database, siteId, wine: payload.wine });
    const bottleIds = await createBottles({
      database,
      siteId,
      wineVintageId: vintage.wineVintageId,
      storageLocationId,
      positionHint: optionalText(payload.positionHint),
      bottle: payload.bottle,
      quantity: payload.quantity,
    });

    if (payload.labelExtraction !== undefined) {
      await createLabelExtractions({
        database,
        bottleIds,
        wineVintageId: vintage.wineVintageId,
        labelExtraction: payload.labelExtraction,
      });
    }

    if (payload.criticReviews !== undefined) {
      await replaceCriticReviewsForWine({
        database,
        reviews: payload.criticReviews,
        siteId,
        userId: authenticatedUser.userId,
        wineVintageId: vintage.wineVintageId,
      });
    }

    if (payload.awards !== undefined) {
      await replaceWineAwardsForWine({
        awards: payload.awards,
        database,
        siteId,
        userId: authenticatedUser.userId,
        wineVintageId: vintage.wineVintageId,
      });
    }

    return created(
      {
        bottleIds,
        siteId,
        storageLocationId,
        ...vintage,
      },
      locationHeader(`/api/bottles/${bottleIds[0]}`),
    );
  })
  .patch("/bottles/:bottleId", async (context) => {
    const payload = patchBottleSchema.parse(await context.req.json());
    const database = createD1Client(context.env.DB);
    const authenticatedUser = await requireAuthenticatedUser({
      database,
      request: context.req.raw,
      headers: context.req.raw.headers,
      secretKey: context.env.CLERK_SECRET_KEY,
    });
    const bottleId = context.req.param("bottleId");
    const existing = await getBottleSiteAndVintage({ database, bottleId });

    await assertCanAccessSite({
      database,
      siteId: existing.siteId,
      userId: authenticatedUser.userId,
    });

    const nextVintage =
      payload.wine === undefined
        ? { wineVintageId: existing.wineVintageId }
        : await upsertWineVintage({ database, siteId: existing.siteId, wine: payload.wine });

    await database
      .update(bottles)
      .set({
        ...(payload.status === undefined ? {} : { status: payload.status }),
        ...(payload.bottle?.bottleNumber === undefined
          ? {}
          : { bottleNumber: optionalText(payload.bottle.bottleNumber) }),
        ...(payload.bottle?.volumeMl === undefined ? {} : { volumeMl: payload.bottle.volumeMl }),
        ...(payload.bottle?.barcode === undefined
          ? {}
          : { barcode: optionalText(payload.bottle.barcode) }),
        ...(payload.bottle?.lotCode === undefined
          ? {}
          : { lotCode: optionalText(payload.bottle.lotCode) }),
        ...(payload.bottle?.notes === undefined
          ? {}
          : { notes: optionalText(payload.bottle.notes) }),
        wineVintageId: nextVintage.wineVintageId,
        updatedAt: sql`CURRENT_TIMESTAMP`,
      })
      .where(eq(bottles.id, bottleId));

    if (payload.storageLocationId !== undefined) {
      if (payload.storageLocationId !== null) {
        await assertStorageLocationInSite({
          database,
          siteId: existing.siteId,
          storageLocationId: payload.storageLocationId,
        });
      }
      await database.delete(bottleLocations).where(eq(bottleLocations.bottleId, bottleId));
      if (payload.storageLocationId !== null) {
        await database.insert(bottleLocations).values({
          bottleId,
          siteId: existing.siteId,
          storageLocationId: payload.storageLocationId,
          positionHint: optionalText(payload.positionHint),
        });
      }
    } else if (payload.positionHint !== undefined) {
      await database
        .update(bottleLocations)
        .set({
          positionHint: optionalText(payload.positionHint),
          updatedAt: sql`CURRENT_TIMESTAMP`,
        })
        .where(eq(bottleLocations.bottleId, bottleId));
    }

    if (payload.labelExtraction !== undefined) {
      await createLabelExtractions({
        database,
        bottleIds: [bottleId],
        wineVintageId: nextVintage.wineVintageId,
        labelExtraction: payload.labelExtraction,
      });
    }

    if (payload.criticReviews !== undefined) {
      await replaceCriticReviewsForWine({
        database,
        reviews: payload.criticReviews,
        siteId: existing.siteId,
        userId: authenticatedUser.userId,
        wineVintageId: nextVintage.wineVintageId,
      });
    }

    if (payload.awards !== undefined) {
      await replaceWineAwardsForWine({
        awards: payload.awards,
        database,
        siteId: existing.siteId,
        userId: authenticatedUser.userId,
        wineVintageId: nextVintage.wineVintageId,
      });
    }

    return context.json({ data: { id: bottleId } });
  })
  .delete("/bottles/:bottleId", async (context) => {
    const database = createD1Client(context.env.DB);
    const authenticatedUser = await requireAuthenticatedUser({
      database,
      request: context.req.raw,
      headers: context.req.raw.headers,
      secretKey: context.env.CLERK_SECRET_KEY,
    });
    const bottleId = context.req.param("bottleId");
    const existing = await getBottleSiteAndVintage({ database, bottleId });

    await assertCanAccessSite({
      database,
      siteId: existing.siteId,
      userId: authenticatedUser.userId,
    });
    await database.delete(labelExtractions).where(eq(labelExtractions.bottleId, bottleId));
    await database.delete(bottleLocations).where(eq(bottleLocations.bottleId, bottleId));
    await database.delete(bottles).where(eq(bottles.id, bottleId));

    return noContent();
  });

async function getBottleSiteAndVintage({
  database,
  bottleId,
}: {
  readonly database: BoozeDatabase;
  readonly bottleId: string;
}): Promise<{ readonly siteId: string; readonly wineVintageId: string }> {
  const rows = await database
    .select({ siteId: bottles.siteId, wineVintageId: bottles.wineVintageId })
    .from(bottles)
    .where(eq(bottles.id, bottleId))
    .limit(1);

  const row = rows[0];
  if (row === undefined) {
    throw new HTTPException(404, { message: "Bottle not found" });
  }
  return row;
}

async function assertStorageLocationInSite({
  database,
  siteId,
  storageLocationId,
}: {
  readonly database: BoozeDatabase;
  readonly siteId: string;
  readonly storageLocationId: string;
}): Promise<void> {
  const rows = await database
    .select({ id: storageLocations.id })
    .from(storageLocations)
    .where(and(eq(storageLocations.id, storageLocationId), eq(storageLocations.siteId, siteId)))
    .limit(1);

  if (rows[0] === undefined) {
    throw new HTTPException(400, { message: "Storage location is not in the bottle site" });
  }
}

async function createLabelExtractions({
  database,
  bottleIds,
  wineVintageId,
  labelExtraction,
}: {
  readonly database: BoozeDatabase;
  readonly bottleIds: readonly string[];
  readonly wineVintageId: string;
  readonly labelExtraction: NonNullable<z.infer<typeof createBottleSchema>["labelExtraction"]>;
}): Promise<void> {
  await database.insert(labelExtractions).values(
    bottleIds.map((bottleId) => ({
      id: crypto.randomUUID(),
      bottleId,
      wineVintageId,
      provider: null,
      model: null,
      rawTextJson: optionalText(labelExtraction.rawTextJson),
      extractedFieldsJson: labelExtraction.extractedFieldsJson,
      confidence: labelExtraction.confidence ?? null,
      requiresReview: labelExtraction.requiresReview ?? false,
    })),
  );
}
