// oxlint-disable eslint/no-use-before-define
import {
  bottles,
  grapeVarieties,
  siteMemberships,
  sites,
  type createD1Client,
  wineries,
  wineConstituents,
  wineVintages,
} from "@chikachow/booze-db";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";

import { calculateDrinkStatus } from "../api/inventory.ts";
import { mcpEntityId } from "./ids.ts";
import { decodePageCursor, pageFromRows, pageLimit, type Page } from "./pagination.ts";
import type { listWinesInputSchema, wineVintageSummarySchema } from "./schemas.ts";
import {
  andAll,
  containsAnyText,
  cursorPredicate,
  optionalContains,
  optionalEquals,
} from "./sql.ts";

const listWinesToolName = "cellar.list_wines";
const listWinesCursorSchema = z.strictObject({
  wine: z.string(),
  wineId: z.string(),
  winery: z.string(),
  vintageSort: z.number(),
});

export async function listWineVintages({
  database,
  input,
  userId,
}: {
  readonly database: ReturnType<typeof createD1Client>;
  readonly input: z.infer<typeof listWinesInputSchema>;
  readonly userId: string;
}): Promise<Page<z.infer<typeof wineVintageSummarySchema>>> {
  const grapeVarietiesByWine = grapeVarietiesByWineQuery(database);
  const bottleCountsByWine = bottleCountsByWineQuery(database);
  const vintageSort = sql<number>`coalesce(${wineVintages.vintageYear}, -1)`;
  const winerySort = sql<string>`lower(${wineries.name})`;
  const wineSort = sql<string>`lower(${wineVintages.displayName})`;
  const cursor = decodePageCursor({
    cursorSchema: listWinesCursorSchema,
    input,
    toolName: listWinesToolName,
  });

  const rows = await database
    .select(wineVintageSummaryColumns({ bottleCountsByWine, grapeVarietiesByWine }))
    .from(wineVintages)
    .innerJoin(sites, eq(wineVintages.siteId, sites.id))
    .innerJoin(siteMemberships, eq(wineVintages.siteId, siteMemberships.siteId))
    .innerJoin(
      wineries,
      and(eq(wineVintages.siteId, wineries.siteId), eq(wineVintages.wineryId, wineries.id)),
    )
    .leftJoin(grapeVarietiesByWine, eq(wineVintages.id, grapeVarietiesByWine.wineVintageId))
    .leftJoin(
      bottleCountsByWine,
      and(
        eq(wineVintages.siteId, bottleCountsByWine.siteId),
        eq(wineVintages.id, bottleCountsByWine.wineVintageId),
      ),
    )
    .where(
      andAll([
        eq(siteMemberships.userId, userId),
        optionalEquals(wineVintages.siteId, input.siteId),
        optionalContains(wineries.name, input.winery),
        optionalContains(wineVintages.brandName, input.brand),
        containsAnyText(input.wine, [
          wineVintages.brandName,
          wineVintages.baseName,
          wineVintages.displayName,
        ]),
        optionalContains(grapeVarietiesByWine.grapeVarieties, input.grapeVariety),
        optionalContains(wineVintages.region, input.region),
        optionalEquals(wineVintages.vintageYear, input.vintageYear),
        containsAnyText(input.query, [
          sites.name,
          wineries.name,
          wineVintages.brandName,
          wineVintages.baseName,
          wineVintages.displayName,
          wineVintages.vintageLabel,
          grapeVarietiesByWine.grapeVarieties,
          wineVintages.region,
          wineVintages.wineType,
          wineVintages.wineColor,
        ]),
        cursorPredicate({
          cursor,
          sortKeys: [
            { cursorKey: "vintageSort", direction: "desc", expression: vintageSort },
            { cursorKey: "winery", direction: "asc", expression: winerySort },
            { cursorKey: "wine", direction: "asc", expression: wineSort },
            { cursorKey: "wineId", direction: "asc", expression: wineVintages.id },
          ],
        }),
      ]),
    )
    .orderBy(desc(vintageSort), asc(winerySort), asc(wineSort), asc(wineVintages.id))
    .limit(pageLimit(input));

  const rowPage = pageFromRows({
    cursorForItem: (row) => ({
      vintageSort: row.vintageYear ?? -1,
      wine: row.displayName.toLowerCase(),
      wineId: row.id,
      winery: row.wineryName.toLowerCase(),
    }),
    input,
    items: rows,
    toolName: listWinesToolName,
  });

  return {
    items: rowPage.items.map((row) => wineVintageSummaryFromRow(row)),
    metadata: rowPage.metadata,
  };
}

export async function getWineVintageSummary({
  database,
  userId,
  wineId,
}: {
  readonly database: ReturnType<typeof createD1Client>;
  readonly userId: string;
  readonly wineId: string;
}): Promise<z.infer<typeof wineVintageSummarySchema>> {
  const wines = await listAuthorisedWineVintageSummaries({ database, userId });
  const wine = wines.find((candidate) => candidate.wineId === wineId);
  if (wine === undefined) {
    throw new HTTPException(404, { message: "Wine vintage not found" });
  }
  return wine;
}

export async function resolveWineVintageId({
  database,
  userId,
  wineId,
}: {
  readonly database: ReturnType<typeof createD1Client>;
  readonly userId: string;
  readonly wineId: string;
}): Promise<string> {
  const rows = await database
    .select({ id: wineVintages.id })
    .from(wineVintages)
    .innerJoin(siteMemberships, eq(wineVintages.siteId, siteMemberships.siteId))
    .where(eq(siteMemberships.userId, userId));
  const row = rows.find((candidate) => {
    return mcpEntityId("wine", candidate.id) === wineId;
  });
  if (row === undefined) {
    throw new HTTPException(404, { message: "Wine vintage not found" });
  }
  return row.id;
}

async function listAuthorisedWineVintageSummaries({
  database,
  userId,
}: {
  readonly database: ReturnType<typeof createD1Client>;
  readonly userId: string;
}): Promise<readonly z.infer<typeof wineVintageSummarySchema>[]> {
  const grapeVarietiesByWine = grapeVarietiesByWineQuery(database);
  const bottleCountsByWine = bottleCountsByWineQuery(database);

  const rows = await database
    .select(wineVintageSummaryColumns({ bottleCountsByWine, grapeVarietiesByWine }))
    .from(wineVintages)
    .innerJoin(sites, eq(wineVintages.siteId, sites.id))
    .innerJoin(siteMemberships, eq(wineVintages.siteId, siteMemberships.siteId))
    .innerJoin(
      wineries,
      and(eq(wineVintages.siteId, wineries.siteId), eq(wineVintages.wineryId, wineries.id)),
    )
    .leftJoin(grapeVarietiesByWine, eq(wineVintages.id, grapeVarietiesByWine.wineVintageId))
    .leftJoin(
      bottleCountsByWine,
      and(
        eq(wineVintages.siteId, bottleCountsByWine.siteId),
        eq(wineVintages.id, bottleCountsByWine.wineVintageId),
      ),
    )
    .where(eq(siteMemberships.userId, userId))
    .orderBy(desc(wineVintages.vintageYear), asc(wineries.name), asc(wineVintages.displayName));

  return rows.map((row) => wineVintageSummaryFromRow(row));
}

function grapeVarietiesByWineQuery(database: ReturnType<typeof createD1Client>) {
  return database
    .select({
      wineVintageId: wineConstituents.wineVintageId,
      grapeVarieties: sql<string | null>`group_concat(${grapeVarieties.name})`.as(
        "grape_varieties",
      ),
    })
    .from(wineConstituents)
    .innerJoin(grapeVarieties, eq(wineConstituents.grapeVarietyId, grapeVarieties.id))
    .groupBy(wineConstituents.wineVintageId)
    .as("grape_varieties_by_wine");
}

function bottleCountsByWineQuery(database: ReturnType<typeof createD1Client>) {
  return database
    .select({
      siteId: bottles.siteId,
      wineVintageId: bottles.wineVintageId,
      bottleCount: sql<number>`count(${bottles.id})`.as("bottle_count"),
      inStockBottleCount:
        sql<number>`sum(case when ${bottles.status} = 'in_stock' then 1 else 0 end)`.as(
          "in_stock_bottle_count",
        ),
    })
    .from(bottles)
    .groupBy(bottles.siteId, bottles.wineVintageId)
    .as("bottle_counts_by_wine");
}

function wineVintageSummaryColumns({
  bottleCountsByWine,
  grapeVarietiesByWine,
}: {
  readonly bottleCountsByWine: ReturnType<typeof bottleCountsByWineQuery>;
  readonly grapeVarietiesByWine: ReturnType<typeof grapeVarietiesByWineQuery>;
}) {
  return {
    id: wineVintages.id,
    siteId: wineVintages.siteId,
    siteName: sites.name,
    wineryId: wineVintages.wineryId,
    wineryName: wineries.name,
    brandName: wineVintages.brandName,
    baseName: wineVintages.baseName,
    displayName: wineVintages.displayName,
    vintageYear: wineVintages.vintageYear,
    vintageLabel: wineVintages.vintageLabel,
    grapeVarieties: grapeVarietiesByWine.grapeVarieties,
    region: wineVintages.region,
    wineType: wineVintages.wineType,
    wineColor: wineVintages.wineColor,
    drinkFromYear: wineVintages.drinkFromYear,
    drinkToYear: wineVintages.drinkToYear,
    bottleCount: sql<number>`coalesce(${bottleCountsByWine.bottleCount}, 0)`,
    inStockBottleCount: sql<number>`coalesce(${bottleCountsByWine.inStockBottleCount}, 0)`,
  };
}

function wineVintageSummaryFromRow(row: {
  readonly baseName: string;
  readonly bottleCount: number;
  readonly brandName: string | null;
  readonly drinkFromYear: number | null;
  readonly drinkToYear: number | null;
  readonly displayName: string;
  readonly grapeVarieties: string | null;
  readonly id: string;
  readonly inStockBottleCount: number | null;
  readonly region: string | null;
  readonly siteId: string;
  readonly siteName: string;
  readonly vintageLabel: string;
  readonly vintageYear: number | null;
  readonly wineColor: string | null;
  readonly wineType: string | null;
  readonly wineryId: string;
  readonly wineryName: string;
}): z.infer<typeof wineVintageSummarySchema> {
  return {
    baseName: row.baseName,
    bottleCount: row.bottleCount,
    brand: row.brandName,
    drinkStatus: calculateDrinkStatus({
      drinkFromYear: row.drinkFromYear,
      drinkToYear: row.drinkToYear,
    }),
    drinkFromYear: row.drinkFromYear,
    drinkToYear: row.drinkToYear,
    grapeVarieties:
      row.grapeVarieties === null
        ? []
        : row.grapeVarieties.split(",").filter((value) => value !== ""),
    inStockBottleCount: row.inStockBottleCount ?? 0,
    region: row.region,
    site: row.siteName,
    siteId: row.siteId,
    vintageLabel: row.vintageLabel,
    vintageYear: row.vintageYear,
    wine: row.displayName,
    wineColor: row.wineColor,
    wineType: row.wineType,
    wineId: mcpEntityId("wine", row.id),
    winery: row.wineryName,
    wineryId: mcpEntityId("winery", row.wineryId),
  };
}
