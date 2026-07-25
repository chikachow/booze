// oxlint-disable eslint/no-use-before-define
import {
  bottles,
  bottleLocations,
  grapeVarieties,
  storageLocations,
  wineConstituents,
  wineries,
  wineVintages,
  type BoozeDatabase,
} from "@chikachow/booze-db";
import { and, eq, isNull, sql } from "drizzle-orm";

import {
  generatedId,
  optionalInteger,
  optionalText,
  stableId,
  vintageLabelForYear,
} from "./ids.ts";

export type WineInput = {
  readonly wineryName: string;
  readonly brandName?: string | undefined;
  readonly baseName?: string | undefined;
  readonly designation: string;
  readonly displayName?: string | undefined;
  readonly vintageYear?: number | undefined;
  readonly grapeVarieties?: readonly string[] | undefined;
  readonly country?: string | undefined;
  readonly region?: string | undefined;
  readonly appellation?: string | undefined;
  readonly classification?: string | undefined;
  readonly wineType?: string | undefined;
  readonly wineColor?: string | undefined;
  readonly addressQualification?: string | undefined;
  readonly alcoholPercent?: number | undefined;
  readonly drinkFromYear?: number | undefined;
  readonly drinkToYear?: number | undefined;
  readonly description?: string | undefined;
  readonly drinkingAdvice?: string | undefined;
  readonly labelText?: string | undefined;
  readonly sourceUrl?: string | undefined;
  readonly notes?: string | undefined;
};

export type BottleInput = {
  readonly bottleNumber?: string | undefined;
  readonly volumeMl?: number | undefined;
  readonly barcode?: string | undefined;
  readonly lotCode?: string | undefined;
  readonly notes?: string | undefined;
};

export type UpsertVintageResult = {
  readonly wineryId: string;
  readonly wineVintageId: string;
};

export async function upsertWineVintage({
  database,
  siteId,
  wine,
}: {
  readonly database: BoozeDatabase;
  readonly siteId: string;
  readonly wine: WineInput;
}): Promise<UpsertVintageResult> {
  const wineryRegion = optionalText(wine.region);
  const baseName = baseNameForWine(wine);
  const displayName = displayNameForWine(wine);
  const vintageLabel = vintageLabelForYear(wine.vintageYear);
  const wineryId = await upsertWinery({
    country: optionalText(wine.country),
    database,
    name: wine.wineryName,
    region: wineryRegion,
    siteId,
  });
  const wineVintageId = await upsertVintageRow({
    baseName,
    database,
    displayName,
    siteId,
    vintageLabel,
    wine,
    wineryId,
    wineryRegion,
  });

  await replaceConstituents({
    database,
    siteId,
    wineVintageId,
    grapeNames: wine.grapeVarieties ?? [],
  });

  return { wineryId, wineVintageId };
}

async function upsertWinery({
  country,
  database,
  name,
  region,
  siteId,
}: {
  readonly country: string | null;
  readonly database: BoozeDatabase;
  readonly name: string;
  readonly region: string | null;
  readonly siteId: string;
}): Promise<string> {
  const existing = await database
    .select({ id: wineries.id })
    .from(wineries)
    .where(
      and(
        eq(wineries.siteId, siteId),
        eq(wineries.name, name),
        nullableEq(wineries.region, region),
      ),
    )
    .limit(1);
  const existingRow = existing[0];
  if (existingRow !== undefined) {
    await database
      .update(wineries)
      .set({ country, region, updatedAt: sql`CURRENT_TIMESTAMP` })
      .where(eq(wineries.id, existingRow.id));
    return existingRow.id;
  }

  const wineryId = generatedId("winery");

  await database.insert(wineries).values({
    id: wineryId,
    siteId,
    name,
    country,
    region,
  });

  return wineryId;
}

async function upsertVintageRow({
  baseName,
  database,
  displayName,
  siteId,
  vintageLabel,
  wine,
  wineryId,
  wineryRegion,
}: {
  readonly baseName: string;
  readonly database: BoozeDatabase;
  readonly displayName: string;
  readonly siteId: string;
  readonly vintageLabel: string;
  readonly wine: WineInput;
  readonly wineryId: string;
  readonly wineryRegion: string | null;
}): Promise<string> {
  const wineVintageId = generatedId("vintage");

  await database
    .insert(wineVintages)
    .values({
      id: wineVintageId,
      siteId,
      wineryId,
      brandName: optionalText(wine.brandName),
      baseName,
      displayName,
      designation: optionalText(wine.designation),
      vintageYear: optionalInteger(wine.vintageYear),
      vintageLabel,
      wineType: optionalText(wine.wineType),
      wineColor: optionalText(wine.wineColor),
      country: optionalText(wine.country),
      region: wineryRegion,
      appellation: optionalText(wine.appellation),
      classification: optionalText(wine.classification),
      addressQualification: optionalText(wine.addressQualification),
      alcoholPercent: wine.alcoholPercent ?? null,
      drinkFromYear: optionalInteger(wine.drinkFromYear),
      drinkToYear: optionalInteger(wine.drinkToYear),
      description: optionalText(wine.description),
      drinkingAdvice: optionalText(wine.drinkingAdvice),
      labelText: optionalText(wine.labelText),
      sourceUrl: optionalText(wine.sourceUrl),
      notes: optionalText(wine.notes),
    })
    .onConflictDoUpdate({
      target: [
        wineVintages.siteId,
        wineVintages.wineryId,
        wineVintages.baseName,
        wineVintages.vintageLabel,
      ],
      set: wineVintageUpdateSet({
        baseName,
        displayName,
        vintageLabel,
        wine,
        wineryId,
        wineryRegion,
      }),
    });

  const rows = await database
    .select({ id: wineVintages.id })
    .from(wineVintages)
    .where(
      and(
        eq(wineVintages.siteId, siteId),
        eq(wineVintages.wineryId, wineryId),
        eq(wineVintages.baseName, baseName),
        eq(wineVintages.vintageLabel, vintageLabel),
      ),
    )
    .limit(1);
  const row = rows[0];
  if (row === undefined) {
    throw new Error("Wine vintage upsert did not return a row");
  }
  return row.id;
}

export async function createBottles({
  bottleIds,
  database,
  siteId,
  wineVintageId,
  storageLocationId,
  positionHint,
  bottle,
  quantity,
}: {
  readonly bottleIds?: readonly string[] | undefined;
  readonly database: BoozeDatabase;
  readonly siteId: string;
  readonly wineVintageId: string;
  readonly storageLocationId: string | null;
  readonly positionHint: string | null;
  readonly bottle: BottleInput;
  readonly quantity: number;
}): Promise<readonly string[]> {
  const rows = Array.from({ length: quantity }, (_, index) => ({
    id: bottleIds?.[index] ?? crypto.randomUUID(),
    siteId,
    wineVintageId,
    bottleNumber: optionalText(bottle.bottleNumber),
    volumeMl: bottle.volumeMl ?? 750,
    barcode: optionalText(bottle.barcode),
    lotCode: optionalText(bottle.lotCode),
    status: "in_stock",
    notes: optionalText(bottle.notes),
  }));

  await database.insert(bottles).values(rows).onConflictDoNothing({ target: bottles.id });

  if (storageLocationId !== null) {
    await database
      .insert(bottleLocations)
      .values(
        rows.map((row) => ({
          bottleId: row.id,
          siteId,
          storageLocationId,
          positionHint,
        })),
      )
      .onConflictDoNothing({ target: bottleLocations.bottleId });
  }

  return rows.map((row) => row.id);
}

export async function upsertStorageLocation({
  database,
  siteId,
  name,
  locationType = "area",
  parentId = null,
}: {
  readonly database: BoozeDatabase;
  readonly siteId: string;
  readonly name: string;
  readonly locationType?: string | undefined;
  readonly parentId?: string | null | undefined;
}): Promise<{ readonly storageLocationId: string }> {
  const existing = await database
    .select({ id: storageLocations.id })
    .from(storageLocations)
    .where(
      and(
        eq(storageLocations.siteId, siteId),
        nullableEq(storageLocations.parentId, parentId),
        eq(storageLocations.name, name),
      ),
    )
    .limit(1);
  const storageLocationId = existing[0]?.id ?? generatedId("loc");

  if (existing[0] === undefined) {
    await database.insert(storageLocations).values({
      id: storageLocationId,
      siteId,
      parentId,
      name,
      locationType,
    });
  } else {
    await database
      .update(storageLocations)
      .set({ locationType, updatedAt: sql`CURRENT_TIMESTAMP` })
      .where(eq(storageLocations.id, storageLocationId));
  }

  return { storageLocationId };
}

function baseNameForWine(wine: WineInput): string {
  return optionalText(wine.baseName) ?? optionalText(wine.designation) ?? wine.wineryName;
}

function displayNameForWine(wine: WineInput): string {
  return optionalText(wine.displayName) ?? optionalText(wine.designation) ?? wine.wineryName;
}

function wineVintageUpdateSet({
  baseName,
  displayName,
  vintageLabel,
  wine,
  wineryId,
  wineryRegion,
}: {
  readonly baseName: string;
  readonly displayName: string;
  readonly vintageLabel: string;
  readonly wine: WineInput;
  readonly wineryId: string;
  readonly wineryRegion: string | null;
}) {
  return {
    wineryId,
    brandName: optionalText(wine.brandName),
    baseName,
    displayName,
    designation: optionalText(wine.designation),
    vintageYear: optionalInteger(wine.vintageYear),
    vintageLabel,
    wineType: optionalText(wine.wineType),
    wineColor: optionalText(wine.wineColor),
    country: optionalText(wine.country),
    region: wineryRegion,
    appellation: optionalText(wine.appellation),
    classification: optionalText(wine.classification),
    addressQualification: optionalText(wine.addressQualification),
    alcoholPercent: wine.alcoholPercent ?? null,
    drinkFromYear: optionalInteger(wine.drinkFromYear),
    drinkToYear: optionalInteger(wine.drinkToYear),
    description: optionalText(wine.description),
    drinkingAdvice: optionalText(wine.drinkingAdvice),
    labelText: optionalText(wine.labelText),
    sourceUrl: optionalText(wine.sourceUrl),
    notes: optionalText(wine.notes),
    updatedAt: sql`CURRENT_TIMESTAMP`,
  };
}

function nullableEq(
  column: typeof wineries.region | typeof storageLocations.parentId,
  value: string | null,
) {
  return value === null ? isNull(column) : eq(column, value);
}

async function replaceConstituents({
  database,
  siteId,
  wineVintageId,
  grapeNames,
}: {
  readonly database: BoozeDatabase;
  readonly siteId: string;
  readonly wineVintageId: string;
  readonly grapeNames: readonly string[];
}): Promise<void> {
  await database
    .delete(wineConstituents)
    .where(
      and(eq(wineConstituents.siteId, siteId), eq(wineConstituents.wineVintageId, wineVintageId)),
    );

  const uniqueNames = [
    ...new Set(grapeNames.map((name) => name.trim()).filter((name) => name !== "")),
  ];
  for (const grapeName of uniqueNames) {
    const grapeVarietyId = stableId("grape", grapeName);
    await database
      .insert(grapeVarieties)
      .values({ id: grapeVarietyId, name: grapeName })
      .onConflictDoNothing({ target: grapeVarieties.name });

    await database.insert(wineConstituents).values({
      siteId,
      wineVintageId,
      grapeVarietyId,
      blendText: null,
      percentage: null,
    });
  }
}
