import { siteMemberships, wineAwards, wineVintages, type BoozeDatabase } from "@chikachow/booze-db";
import { and, asc, eq, notInArray, sql } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";

import { requireSitePermission } from "./auth.ts";
import { generatedId, optionalText } from "./ids.ts";

export type WineAwardInput = {
  readonly id?: string | undefined;
  readonly awardName: string;
  readonly awardLevel: string;
  readonly awardYear?: number | undefined;
  readonly awardBody?: string | undefined;
  readonly category?: string | undefined;
  readonly points?: number | undefined;
  readonly sourceUrl?: string | undefined;
  readonly provenance?: string | undefined;
  readonly notes?: string | undefined;
};

export type WineAwardResource = {
  readonly id: string;
  readonly siteId: string;
  readonly wineVintageId: string;
  readonly awardName: string;
  readonly awardLevel: string;
  readonly awardYear: number | null;
  readonly awardBody: string | null;
  readonly category: string | null;
  readonly points: number | null;
  readonly sourceUrl: string | null;
  readonly provenance: string | null;
  readonly notes: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
};

export async function listWineAwards({
  database,
  userId,
  wineVintageId,
}: {
  readonly database: BoozeDatabase;
  readonly userId: string;
  readonly wineVintageId?: string | undefined;
}): Promise<readonly WineAwardResource[]> {
  return database
    .select({
      id: wineAwards.id,
      siteId: wineAwards.siteId,
      wineVintageId: wineAwards.wineVintageId,
      awardName: wineAwards.awardName,
      awardLevel: wineAwards.awardLevel,
      awardYear: wineAwards.awardYear,
      awardBody: wineAwards.awardBody,
      category: wineAwards.category,
      points: wineAwards.points,
      sourceUrl: wineAwards.sourceUrl,
      provenance: wineAwards.provenance,
      notes: wineAwards.notes,
      createdAt: wineAwards.createdAt,
      updatedAt: wineAwards.updatedAt,
    })
    .from(wineAwards)
    .innerJoin(siteMemberships, eq(wineAwards.siteId, siteMemberships.siteId))
    .where(
      and(
        eq(siteMemberships.userId, userId),
        wineVintageId === undefined ? undefined : eq(wineAwards.wineVintageId, wineVintageId),
      ),
    )
    .orderBy(asc(wineAwards.awardYear), asc(wineAwards.awardName), asc(wineAwards.awardLevel));
}

async function assertWineVintageInSite({
  database,
  siteId,
  wineVintageId,
}: {
  readonly database: BoozeDatabase;
  readonly siteId: string;
  readonly wineVintageId: string;
}): Promise<void> {
  const rows = await database
    .select({ id: wineVintages.id })
    .from(wineVintages)
    .where(and(eq(wineVintages.siteId, siteId), eq(wineVintages.id, wineVintageId)))
    .limit(1);
  if (rows[0] === undefined) {
    throw new HTTPException(404, { message: "Wine vintage not found" });
  }
}

export async function replaceWineAwardsForWine({
  awards,
  database,
  siteId,
  userId,
  wineVintageId,
}: {
  readonly awards: readonly WineAwardInput[];
  readonly database: BoozeDatabase;
  readonly siteId: string;
  readonly userId: string;
  readonly wineVintageId: string;
}): Promise<readonly WineAwardResource[]> {
  await requireSitePermission({
    database,
    permission: "site.content.write",
    siteId,
    userId,
  });
  await assertWineVintageInSite({ database, siteId, wineVintageId });

  const [first, ...rest] = await prepareWineAwardStatements({
    awards,
    database,
    siteId,
    userId,
    wineVintageId,
  });
  if (first !== undefined) await database.batch([first, ...rest]);
  return listWineAwards({ database, userId, wineVintageId });
}

export async function prepareWineAwardStatements({
  awards,
  database,
  siteId,
  userId,
  wineVintageId,
  overwriteExisting = true,
  removeMissing = true,
}: {
  readonly overwriteExisting?: boolean;
  readonly removeMissing?: boolean;
  readonly awards: readonly WineAwardInput[];
  readonly database: BoozeDatabase;
  readonly siteId: string;
  readonly userId: string;
  readonly wineVintageId: string;
}): Promise<Parameters<BoozeDatabase["batch"]>[0][number][]> {
  const statements: Parameters<BoozeDatabase["batch"]>[0][number][] = [];
  const existing = await database
    .select()
    .from(wineAwards)
    .where(and(eq(wineAwards.siteId, siteId), eq(wineAwards.wineVintageId, wineVintageId)));
  const idsByAward = new Map(
    existing.map((award) => [
      JSON.stringify([award.awardName, award.awardLevel, award.awardYear]),
      award.id,
    ]),
  );
  const keptAwardIds: string[] = [];
  for (const input of awards) {
    const awardName = input.awardName.trim();
    const awardLevel = input.awardLevel.trim();
    if (awardName === "" || awardLevel === "") {
      continue;
    }

    const awardKey = JSON.stringify([awardName, awardLevel, input.awardYear ?? null]);
    if (idsByAward.has(awardKey) && !overwriteExisting) continue;
    const awardId = idsByAward.get(awardKey) ?? generatedId("wine-award");
    idsByAward.set(awardKey, awardId);
    keptAwardIds.push(awardId);

    statements.push(
      database
        .insert(wineAwards)
        .values({
          id: awardId,
          siteId,
          wineVintageId,
          awardName,
          awardLevel,
          awardYear: input.awardYear,
          awardBody: optionalText(input.awardBody),
          category: optionalText(input.category),
          points: input.points,
          sourceUrl: optionalText(input.sourceUrl),
          provenance: optionalText(input.provenance),
          notes: optionalText(input.notes),
          createdByUserId: userId,
        })
        .onConflictDoUpdate({
          target: wineAwards.id,
          set: {
            awardName,
            awardLevel,
            awardYear: input.awardYear,
            awardBody: optionalText(input.awardBody),
            category: optionalText(input.category),
            points: input.points,
            sourceUrl: optionalText(input.sourceUrl),
            provenance: optionalText(input.provenance),
            notes: optionalText(input.notes),
            updatedAt: sql`CURRENT_TIMESTAMP`,
          },
        }),
    );
  }

  if (removeMissing && keptAwardIds.length === 0) {
    statements.push(
      database
        .delete(wineAwards)
        .where(and(eq(wineAwards.siteId, siteId), eq(wineAwards.wineVintageId, wineVintageId))),
    );
  } else if (removeMissing) {
    statements.push(
      database
        .delete(wineAwards)
        .where(
          and(
            eq(wineAwards.siteId, siteId),
            eq(wineAwards.wineVintageId, wineVintageId),
            notInArray(wineAwards.id, keptAwardIds),
          ),
        ),
    );
  }

  return statements;
}
