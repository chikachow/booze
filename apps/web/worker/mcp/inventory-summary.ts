import {
  bottles,
  siteMemberships,
  sites,
  type createD1Client,
  wineVintages,
} from "@chikachow/booze-db";
import { and, asc, eq, sql } from "drizzle-orm";
import type { z } from "zod";

import { calculateDrinkStatus, type DrinkStatus } from "../api/inventory.ts";
import type { inventorySummarySchema } from "./schemas.ts";
import { listAuthorisedSiteSummaries } from "./sites.ts";

export async function getInventorySummary({
  database,
  userId,
}: {
  readonly database: ReturnType<typeof createD1Client>;
  readonly userId: string;
}): Promise<z.infer<typeof inventorySummarySchema>> {
  const [siteRows, bottleStatusRows, drinkStatusRows] = await Promise.all([
    listAuthorisedSiteSummaries({ database, userId }),
    database
      .select({
        siteId: sites.id,
        siteName: sites.name,
        bottleStatus: bottles.status,
        count: sql<number>`count(${bottles.id})`,
      })
      .from(sites)
      .innerJoin(siteMemberships, eq(sites.id, siteMemberships.siteId))
      .innerJoin(bottles, eq(sites.id, bottles.siteId))
      .where(eq(siteMemberships.userId, userId))
      .groupBy(sites.id, sites.name, bottles.status)
      .orderBy(asc(sites.name), asc(bottles.status)),
    database
      .select({
        siteId: sites.id,
        siteName: sites.name,
        drinkFromYear: wineVintages.drinkFromYear,
        drinkToYear: wineVintages.drinkToYear,
        count: sql<number>`count(${bottles.id})`,
      })
      .from(sites)
      .innerJoin(siteMemberships, eq(sites.id, siteMemberships.siteId))
      .innerJoin(bottles, eq(sites.id, bottles.siteId))
      .innerJoin(
        wineVintages,
        and(eq(bottles.siteId, wineVintages.siteId), eq(bottles.wineVintageId, wineVintages.id)),
      )
      .where(eq(siteMemberships.userId, userId))
      .groupBy(sites.id, sites.name, wineVintages.drinkFromYear, wineVintages.drinkToYear)
      .orderBy(asc(sites.name)),
  ]);

  const drinkStatusCounts = new Map<
    string,
    {
      readonly count: number;
      readonly drinkStatus: DrinkStatus;
      readonly site: string;
      readonly siteId: string;
    }
  >();

  for (const row of drinkStatusRows) {
    const drinkStatus = calculateDrinkStatus({
      drinkFromYear: row.drinkFromYear,
      drinkToYear: row.drinkToYear,
    });
    const key = `${row.siteId}\0${drinkStatus}`;
    const existing = drinkStatusCounts.get(key);
    drinkStatusCounts.set(key, {
      count: (existing?.count ?? 0) + row.count,
      drinkStatus,
      site: row.siteName,
      siteId: row.siteId,
    });
  }

  return {
    bottleStatusCounts: bottleStatusRows.map((row) => ({
      bottleStatus: row.bottleStatus,
      count: row.count,
      site: row.siteName,
      siteId: row.siteId,
    })),
    drinkStatusCounts: [...drinkStatusCounts.values()].toSorted(
      (left, right) =>
        left.site.localeCompare(right.site) || left.drinkStatus.localeCompare(right.drinkStatus),
    ),
    sites: siteRows,
  };
}
