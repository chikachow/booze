// oxlint-disable import/max-dependencies -- Bottle route composes the full catalogue aggregate and related writes.
import {
  bottleLocations,
  bottles,
  createD1Client,
  labelExtractions,
  storageLocations,
  wineries,
  wineVintages,
  type BoozeDatabase,
} from "@chikachow/booze-db";
import { and, eq, sql } from "drizzle-orm";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";

import { requireAuthenticatedUser, requireSitePermission, upsertSite } from "../api/auth.ts";
import {
  createBottleStatements,
  prepareWineVintage,
  upsertStorageLocation,
} from "../api/catalogue.ts";
import { prepareCriticReviewStatements } from "../api/critic-reviews.ts";
import { created, locationHeader, noContent } from "../api/http.ts";
import { optionalText } from "../api/ids.ts";
import { listBottles } from "../api/inventory.ts";
import { prepareWineAwardStatements } from "../api/wine-awards.ts";
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

const patchWineSchema = wineInputSchema.partial().extend({
  brandName: wineInputSchema.shape.brandName.nullable(),
  vintageYear: wineInputSchema.shape.vintageYear.nullable(),
  country: wineInputSchema.shape.country.nullable(),
  region: wineInputSchema.shape.region.nullable(),
  appellation: wineInputSchema.shape.appellation.nullable(),
  classification: wineInputSchema.shape.classification.nullable(),
  wineType: wineInputSchema.shape.wineType.nullable(),
  wineColor: wineInputSchema.shape.wineColor.nullable(),
  addressQualification: wineInputSchema.shape.addressQualification.nullable(),
  alcoholPercent: wineInputSchema.shape.alcoholPercent.nullable(),
  drinkFromYear: wineInputSchema.shape.drinkFromYear.nullable(),
  drinkToYear: wineInputSchema.shape.drinkToYear.nullable(),
  description: wineInputSchema.shape.description.nullable(),
  drinkingAdvice: wineInputSchema.shape.drinkingAdvice.nullable(),
  labelText: wineInputSchema.shape.labelText.nullable(),
  sourceUrl: wineInputSchema.shape.sourceUrl.nullable(),
  notes: wineInputSchema.shape.notes.nullable(),
});

const patchBottleSchema = z.object({
  status: z.enum(["in_stock", "consumed"]).optional(),
  storageLocationId: z.string().trim().min(1).nullable().optional(),
  positionHint: z.string().trim().max(120).optional(),
  bottle: bottleInputSchema.optional(),
  wine: patchWineSchema.optional(),
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

    await requireSitePermission({
      database,
      permission: "site.content.write",
      siteId,
      userId: authenticatedUser.userId,
    });

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

    assertDrinkWindow(payload.wine);
    const vintage = await prepareWineVintage({ database, siteId, wine: payload.wine });
    const creation = createBottleStatements({
      database,
      siteId,
      wineVintageId: vintage.wineVintageId,
      storageLocationId,
      positionHint: optionalText(payload.positionHint),
      bottle: payload.bottle,
      quantity: payload.quantity,
    });

    const bottleIds = creation.bottleIds;
    const statements = [...vintage.statements, ...creation.statements];
    if (payload.labelExtraction !== undefined) {
      statements.push(
        ...createLabelExtractionStatements({
          database,
          bottleIds,
          wineVintageId: vintage.wineVintageId,
          labelExtraction: payload.labelExtraction,
        }),
      );
    }

    if (payload.criticReviews !== undefined) {
      statements.push(
        ...(await prepareCriticReviewStatements({
          database,
          reviews: payload.criticReviews,
          overwriteExisting: false,
          removeMissing: false,
          siteId,
          userId: authenticatedUser.userId,
          wineVintageId: vintage.wineVintageId,
        })),
      );
    }

    if (payload.awards !== undefined) {
      statements.push(
        ...(await prepareWineAwardStatements({
          awards: payload.awards,
          overwriteExisting: false,
          removeMissing: false,
          database,
          siteId,
          userId: authenticatedUser.userId,
          wineVintageId: vintage.wineVintageId,
        })),
      );
    }

    await database.batch([vintage.statements[0], ...statements.slice(1)]);
    return created(
      {
        bottleIds,
        siteId,
        storageLocationId,
        wineryId: vintage.wineryId,
        wineVintageId: vintage.wineVintageId,
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

    await requireSitePermission({
      database,
      permission: "site.content.write",
      siteId: existing.siteId,
      userId: authenticatedUser.userId,
    });

    if (payload.storageLocationId !== null && payload.storageLocationId !== undefined) {
      await assertStorageLocationInSite({
        database,
        siteId: existing.siteId,
        storageLocationId: payload.storageLocationId,
      });
    }
    const previousWine =
      payload.wine === undefined
        ? undefined
        : await wineInputForVintage({ database, wineVintageId: existing.wineVintageId });
    const wine =
      previousWine === undefined
        ? undefined
        : {
            ...previousWine,
            ...payload.wine,
            wineryName: payload.wine?.wineryName ?? previousWine.wineryName,
            designation: payload.wine?.designation ?? previousWine.designation,
          };
    if (wine !== undefined) assertDrinkWindow(wine);
    const nextVintage =
      wine === undefined
        ? { wineVintageId: existing.wineVintageId, statements: [] }
        : await prepareWineVintage({
            database,
            siteId: existing.siteId,
            wine,
            overwriteExisting: true,
            updates: payload.wine ?? {},
            sourceWineVintageId: existing.wineVintageId,
          });
    const statements: Parameters<BoozeDatabase["batch"]>[0][number][] = [...nextVintage.statements];

    const bottleUpdate = database
      .update(bottles)
      .set(bottleUpdateValues(payload, nextVintage.wineVintageId))
      .where(eq(bottles.id, bottleId));
    statements.push(bottleUpdate);

    if (payload.storageLocationId !== undefined) {
      statements.push(
        database.delete(bottleLocations).where(eq(bottleLocations.bottleId, bottleId)),
      );
      if (payload.storageLocationId !== null) {
        statements.push(
          database.insert(bottleLocations).values({
            bottleId,
            siteId: existing.siteId,
            storageLocationId: payload.storageLocationId,
            positionHint: optionalText(payload.positionHint),
          }),
        );
      }
    } else if (payload.positionHint !== undefined) {
      statements.push(
        database
          .update(bottleLocations)
          .set({
            positionHint: optionalText(payload.positionHint),
            updatedAt: sql`CURRENT_TIMESTAMP`,
          })
          .where(eq(bottleLocations.bottleId, bottleId)),
      );
    }
    if (payload.labelExtraction !== undefined) {
      statements.push(
        ...createLabelExtractionStatements({
          database,
          bottleIds: [bottleId],
          wineVintageId: nextVintage.wineVintageId,
          labelExtraction: payload.labelExtraction,
        }),
      );
    }

    if (payload.criticReviews !== undefined) {
      statements.push(
        ...(await prepareCriticReviewStatements({
          database,
          reviews: payload.criticReviews,
          siteId: existing.siteId,
          userId: authenticatedUser.userId,
          wineVintageId: nextVintage.wineVintageId,
        })),
      );
    }

    if (payload.awards !== undefined) {
      statements.push(
        ...(await prepareWineAwardStatements({
          awards: payload.awards,
          database,
          siteId: existing.siteId,
          userId: authenticatedUser.userId,
          wineVintageId: nextVintage.wineVintageId,
        })),
      );
    }

    const [first, ...rest] = statements;
    if (first !== undefined) await database.batch([first, ...rest]);
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

    await requireSitePermission({
      database,
      permission: "site.content.write",
      siteId: existing.siteId,
      userId: authenticatedUser.userId,
    });
    await database.batch([
      database.delete(labelExtractions).where(eq(labelExtractions.bottleId, bottleId)),
      database.delete(bottleLocations).where(eq(bottleLocations.bottleId, bottleId)),
      database.delete(bottles).where(eq(bottles.id, bottleId)),
    ]);

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

function createLabelExtractionStatements({
  database,
  bottleIds,
  wineVintageId,
  labelExtraction,
}: {
  readonly database: BoozeDatabase;
  readonly bottleIds: readonly string[];
  readonly wineVintageId: string;
  readonly labelExtraction: NonNullable<z.infer<typeof createBottleSchema>["labelExtraction"]>;
}): Parameters<BoozeDatabase["batch"]>[0][number][] {
  return bottleIds.map((bottleId) =>
    database.insert(labelExtractions).values({
      id: crypto.randomUUID(),
      bottleId,
      wineVintageId,
      provider: null,
      model: null,
      rawTextJson: optionalText(labelExtraction.rawTextJson),
      extractedFieldsJson: labelExtraction.extractedFieldsJson,
      confidence: labelExtraction.confidence ?? null,
      requiresReview: labelExtraction.requiresReview ?? false,
    }),
  );
}

function assertDrinkWindow(wine: {
  readonly drinkFromYear?: number | null | undefined;
  readonly drinkToYear?: number | null | undefined;
}): void {
  if (
    wine.drinkFromYear !== null &&
    wine.drinkFromYear !== undefined &&
    wine.drinkToYear !== null &&
    wine.drinkToYear !== undefined &&
    wine.drinkFromYear > wine.drinkToYear
  ) {
    throw new HTTPException(400, { message: "Drink window must end on or after it starts" });
  }
}

async function wineInputForVintage({
  database,
  wineVintageId,
}: {
  readonly database: BoozeDatabase;
  readonly wineVintageId: string;
}) {
  const rows = await database
    .select({ wine: wineVintages, wineryName: wineries.name })
    .from(wineVintages)
    .innerJoin(wineries, eq(wineVintages.wineryId, wineries.id))
    .where(eq(wineVintages.id, wineVintageId))
    .limit(1);
  const row = rows[0];
  if (row === undefined) throw new HTTPException(404, { message: "Wine vintage not found" });
  return {
    ...row.wine,
    wineryName: row.wineryName,
    designation: row.wine.designation,
  };
}

function bottleUpdateValues(payload: z.infer<typeof patchBottleSchema>, wineVintageId: string) {
  return {
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
    ...(payload.bottle?.notes === undefined ? {} : { notes: optionalText(payload.bottle.notes) }),
    wineVintageId: wineVintageId,
    updatedAt: sql`CURRENT_TIMESTAMP`,
  };
}
