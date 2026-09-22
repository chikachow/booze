import {
  grapeVarieties,
  siteMemberships,
  wineries,
  wineConstituents,
  wineVintages,
  type BoozeDatabase,
} from "@chikachow/booze-db";
import { and, eq, sql } from "drizzle-orm";
import type { WineOption } from "../../shared/wine-options.ts";
import { storedVintageLabel, storedVintageStatus } from "./wine-vintage.ts";

// Like the other catalogue collections, return the complete authorized collection.
// Query wines directly: a wine remains selectable after its last bottle is removed.
export async function listWineOptions({
  database,
  userId,
}: {
  readonly database: BoozeDatabase;
  readonly userId: string;
}): Promise<readonly WineOption[]> {
  const rows = await database
    .select({
      wineVintageId: wineVintages.id,
      siteId: wineVintages.siteId,
      displayName: wineVintages.displayName,
      wineryName: sql<string>`coalesce(${wineries.name}, '')`,
      vintageYear: wineVintages.vintageYear,
      vintageStatus: storedVintageStatus,
      vintageLabel: storedVintageLabel,
      region: wineVintages.region,
      grapeName: grapeVarieties.name,
    })
    .from(wineVintages)
    .innerJoin(
      siteMemberships,
      and(eq(siteMemberships.siteId, wineVintages.siteId), eq(siteMemberships.userId, userId)),
    )
    .leftJoin(
      wineries,
      and(eq(wineries.id, wineVintages.wineryId), eq(wineries.siteId, wineVintages.siteId)),
    )
    .leftJoin(
      wineConstituents,
      and(
        eq(wineConstituents.wineVintageId, wineVintages.id),
        eq(wineConstituents.siteId, wineVintages.siteId),
      ),
    )
    .leftJoin(grapeVarieties, eq(grapeVarieties.id, wineConstituents.grapeVarietyId))
    .orderBy(wineVintages.displayName, wineVintages.id, grapeVarieties.name);
  const wines = new Map<string, WineOption>();
  for (const { grapeName, ...wine } of rows) {
    const previous = wines.get(wine.wineVintageId);
    wines.set(wine.wineVintageId, {
      ...wine,
      grapeVarieties: [
        ...(previous?.grapeVarieties ?? []),
        ...(grapeName === null ? [] : [grapeName]),
      ],
    });
  }
  return [...wines.values()];
}
