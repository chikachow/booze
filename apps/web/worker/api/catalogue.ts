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
import { and, eq, isNull, sql, type SQLWrapper } from "drizzle-orm";

import { generatedId, optionalInteger, optionalText, vintageLabelForYear } from "./ids.ts";

export type WineInput = {
  readonly wineryName: string;
  readonly brandName?: string | null | undefined;
  readonly baseName?: string | null | undefined;
  readonly designation: string | null;
  readonly displayName?: string | null | undefined;
  readonly vintageYear?: number | null | undefined;
  readonly grapeVarieties?: readonly string[] | undefined;
  readonly country?: string | null | undefined;
  readonly region?: string | null | undefined;
  readonly appellation?: string | null | undefined;
  readonly classification?: string | null | undefined;
  readonly wineType?: string | null | undefined;
  readonly wineColor?: string | null | undefined;
  readonly addressQualification?: string | null | undefined;
  readonly alcoholPercent?: number | null | undefined;
  readonly drinkFromYear?: number | null | undefined;
  readonly drinkToYear?: number | null | undefined;
  readonly description?: string | null | undefined;
  readonly drinkingAdvice?: string | null | undefined;
  readonly labelText?: string | null | undefined;
  readonly sourceUrl?: string | null | undefined;
  readonly notes?: string | null | undefined;
};

type WineUpdates = { readonly [Key in keyof WineInput]?: WineInput[Key] | undefined };

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

export async function prepareWineVintage({
  database,
  siteId,
  wine,
  overwriteExisting = false,
  updates = wine,
  sourceWineVintageId,
}: {
  readonly database: BoozeDatabase;
  readonly siteId: string;
  readonly wine: WineInput;
  readonly overwriteExisting?: boolean;
  readonly updates?: WineUpdates;
  readonly sourceWineVintageId?: string;
}): Promise<
  UpsertVintageResult & { readonly statements: [CatalogueStatement, ...CatalogueStatement[]] }
> {
  const statements: CatalogueStatement[] = [];
  const wineryRegion = optionalText(wine.region);
  const baseName = baseNameForWine(wine);
  const displayName = displayNameForWine(wine);
  const vintageLabel = vintageLabelForYear(wine.vintageYear);
  const wineryId = await upsertWinery({
    country: optionalText(wine.country),
    statements,
    database,
    name: wine.wineryName,
    region: wineryRegion,
    siteId,
  });
  const wineVintageId = await upsertVintageRow({
    statements,
    baseName,
    database,
    displayName,
    siteId,
    vintageLabel,
    wine,
    wineryId,
    wineryRegion,
    overwriteExisting,
    updates,
  });

  if (wine.grapeVarieties !== undefined) {
    replaceConstituents({
      statements,
      database,
      siteId,
      wineVintageId,
      grapeNames: wine.grapeVarieties,
      replace: overwriteExisting,
    });
  }

  if (
    wine.grapeVarieties === undefined &&
    sourceWineVintageId !== undefined &&
    sourceWineVintageId !== wineVintageId
  ) {
    const constituents = await database
      .select()
      .from(wineConstituents)
      .where(
        and(
          eq(wineConstituents.siteId, siteId),
          eq(wineConstituents.wineVintageId, sourceWineVintageId),
        ),
      );
    for (const constituent of constituents) {
      statements.push(
        database
          .insert(wineConstituents)
          .values({ ...constituent, wineVintageId })
          .onConflictDoNothing({
            target: [wineConstituents.wineVintageId, wineConstituents.grapeVarietyId],
          }),
      );
    }
  }
  const [first, ...rest] = statements;
  if (first === undefined) throw new Error("Wine upsert requires a statement");
  return { wineryId, wineVintageId, statements: [first, ...rest] };
}

async function upsertWinery({
  statements,
  country,
  database,
  name,
  region,
  siteId,
}: {
  readonly statements: CatalogueStatement[];
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
    statements.push(
      database
        .update(wineries)
        .set({
          country: sql`coalesce(${wineries.country}, ${country})`,
          updatedAt: sql`CURRENT_TIMESTAMP`,
        })
        .where(eq(wineries.id, existingRow.id)),
    );
    return existingRow.id;
  }

  const wineryId = generatedId("winery");

  statements.push(
    database.insert(wineries).values({
      id: wineryId,
      siteId,
      name,
      country,
      region,
    }),
  );

  return wineryId;
}

async function upsertVintageRow({
  statements,
  baseName,
  database,
  displayName,
  siteId,
  vintageLabel,
  wine,
  wineryId,
  wineryRegion,
  overwriteExisting,
  updates,
}: {
  readonly statements: CatalogueStatement[];
  readonly overwriteExisting: boolean;
  readonly updates: WineUpdates;
  readonly baseName: string;
  readonly database: BoozeDatabase;
  readonly displayName: string;
  readonly siteId: string;
  readonly vintageLabel: string;
  readonly wine: WineInput;
  readonly wineryId: string;
  readonly wineryRegion: string | null;
}): Promise<string> {
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
  const wineVintageId = rows[0]?.id ?? generatedId("vintage");

  statements.push(
    database
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
        target: wineVintages.id,
        set: wineVintageUpdateSet({ displayName, wine: updates, overwriteExisting }),
      }),
  );

  return wineVintageId;
}

export type BottleCreationInput = {
  readonly bottleIds?: readonly string[] | undefined;
  readonly database: BoozeDatabase;
  readonly siteId: string;
  readonly wineVintageId: string;
  readonly storageLocationId: string | null;
  readonly positionHint: string | null;
  readonly bottle: BottleInput;
  readonly quantity: number;
};

type CatalogueStatement = Parameters<BoozeDatabase["batch"]>[0][number];

export function createBottleStatements({
  bottleIds,
  database,
  siteId,
  wineVintageId,
  storageLocationId,
  positionHint,
  bottle,
  quantity,
}: BottleCreationInput): {
  readonly bottleIds: readonly string[];
  readonly statements: [CatalogueStatement, ...CatalogueStatement[]];
} {
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 24) {
    throw new Error("Bottle quantity must be between 1 and 24");
  }
  if (bottleIds !== undefined && bottleIds.length !== quantity) {
    throw new Error("Bottle IDs must match quantity");
  }
  const ids = Array.from(
    { length: quantity },
    (_, index) => bottleIds?.[index] ?? crypto.randomUUID(),
  );
  const statements: CatalogueStatement[] = [];
  for (const id of ids) {
    statements.push(
      database
        .insert(bottles)
        .values({
          id,
          siteId,
          wineVintageId,
          bottleNumber: optionalText(bottle.bottleNumber),
          volumeMl: bottle.volumeMl ?? 750,
          barcode: optionalText(bottle.barcode),
          lotCode: optionalText(bottle.lotCode),
          status: "in_stock",
          notes: optionalText(bottle.notes),
        })
        .onConflictDoNothing({ target: bottles.id }),
    );
    if (storageLocationId !== null) {
      statements.push(
        database
          .insert(bottleLocations)
          .values({
            bottleId: id,
            siteId,
            storageLocationId,
            positionHint,
          })
          .onConflictDoNothing({ target: bottleLocations.bottleId }),
      );
    }
  }
  const [first, ...rest] = statements;
  if (first === undefined) {
    throw new Error("Bottle creation requires a statement");
  }
  return { bottleIds: ids, statements: [first, ...rest] };
}

export async function upsertStorageLocation({
  database,
  siteId,
  name,
  locationType,
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
      locationType: locationType ?? "area",
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
  displayName,
  wine,
  overwriteExisting,
}: {
  readonly overwriteExisting: boolean;
  readonly displayName: string;
  readonly wine: WineUpdates;
}) {
  const update = <T>(column: SQLWrapper, value: T | undefined) =>
    value === undefined
      ? undefined
      : overwriteExisting
        ? value
        : sql`coalesce(${column}, ${value})`;
  return {
    brandName: update(
      wineVintages.brandName,
      wine.brandName === undefined ? undefined : optionalText(wine.brandName),
    ),
    displayName:
      overwriteExisting && wine.displayName !== undefined ? displayName : wineVintages.displayName,
    designation: update(
      wineVintages.designation,
      wine.designation === undefined ? undefined : optionalText(wine.designation),
    ),
    wineType: update(
      wineVintages.wineType,
      wine.wineType === undefined ? undefined : optionalText(wine.wineType),
    ),
    wineColor: update(
      wineVintages.wineColor,
      wine.wineColor === undefined ? undefined : optionalText(wine.wineColor),
    ),
    country: update(
      wineVintages.country,
      wine.country === undefined ? undefined : optionalText(wine.country),
    ),
    region: update(
      wineVintages.region,
      wine.region === undefined ? undefined : optionalText(wine.region),
    ),
    appellation: update(
      wineVintages.appellation,
      wine.appellation === undefined ? undefined : optionalText(wine.appellation),
    ),
    classification: update(
      wineVintages.classification,
      wine.classification === undefined ? undefined : optionalText(wine.classification),
    ),
    addressQualification: update(
      wineVintages.addressQualification,
      wine.addressQualification === undefined ? undefined : optionalText(wine.addressQualification),
    ),
    alcoholPercent: update(
      wineVintages.alcoholPercent,
      wine.alcoholPercent === undefined ? undefined : wine.alcoholPercent,
    ),
    drinkFromYear: update(
      wineVintages.drinkFromYear,
      wine.drinkFromYear === undefined ? undefined : optionalInteger(wine.drinkFromYear),
    ),
    drinkToYear: update(
      wineVintages.drinkToYear,
      wine.drinkToYear === undefined ? undefined : optionalInteger(wine.drinkToYear),
    ),
    description: update(
      wineVintages.description,
      wine.description === undefined ? undefined : optionalText(wine.description),
    ),
    drinkingAdvice: update(
      wineVintages.drinkingAdvice,
      wine.drinkingAdvice === undefined ? undefined : optionalText(wine.drinkingAdvice),
    ),
    labelText: update(
      wineVintages.labelText,
      wine.labelText === undefined ? undefined : optionalText(wine.labelText),
    ),
    sourceUrl: update(
      wineVintages.sourceUrl,
      wine.sourceUrl === undefined ? undefined : optionalText(wine.sourceUrl),
    ),
    notes: update(
      wineVintages.notes,
      wine.notes === undefined ? undefined : optionalText(wine.notes),
    ),
    updatedAt: sql`CURRENT_TIMESTAMP`,
  };
}

function nullableEq(
  column: typeof wineries.region | typeof storageLocations.parentId,
  value: string | null,
) {
  return value === null ? isNull(column) : eq(column, value);
}

function replaceConstituents({
  statements,
  database,
  siteId,
  wineVintageId,
  grapeNames,
  replace,
}: {
  readonly statements: CatalogueStatement[];
  readonly database: BoozeDatabase;
  readonly siteId: string;
  readonly wineVintageId: string;
  readonly grapeNames: readonly string[];
  readonly replace: boolean;
}): void {
  const uniqueNames = [
    ...new Set(grapeNames.map((name) => name.trim()).filter((name) => name !== "")),
  ];
  if (replace) {
    statements.push(
      database.delete(wineConstituents).where(
        and(
          eq(wineConstituents.siteId, siteId),
          eq(wineConstituents.wineVintageId, wineVintageId),
          sql`${wineConstituents.grapeVarietyId} not in (
              select ${grapeVarieties.id} from ${grapeVarieties}
              where ${grapeVarieties.name} in (select value from json_each(${JSON.stringify(uniqueNames)}))
            )`,
        ),
      ),
    );
  }
  for (const grapeName of uniqueNames) {
    statements.push(
      database
        .insert(grapeVarieties)
        .values({ id: generatedId("grape"), name: grapeName })
        .onConflictDoNothing({ target: grapeVarieties.name }),
      database
        .insert(wineConstituents)
        .values({
          siteId,
          wineVintageId,
          grapeVarietyId: sql`(select id from grape_varieties where name = ${grapeName})`,
          blendText: null,
          percentage: null,
        })
        .onConflictDoNothing({
          target: [wineConstituents.wineVintageId, wineConstituents.grapeVarietyId],
        }),
    );
  }
}
