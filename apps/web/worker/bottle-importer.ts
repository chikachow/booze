import { createD1Client, wineries, wineVintages, type BoozeDatabase } from "@chikachow/booze-db";
import { and, eq } from "drizzle-orm";

import { createBottles, upsertWineVintage } from "./api/catalogue.ts";
import { stableId, vintageLabelForYear } from "./api/ids.ts";
import type { ImportCandidate } from "./bottle-extractor.ts";
import { claimCaptureForImport } from "./capture-store.ts";

export type ImportReviewReason =
  | "ambiguous_winery"
  | "ambiguous_wine_vintage"
  | "missing_required_candidate";

export type BottleImportResult =
  | {
      readonly kind: "imported";
      readonly bottleIds: readonly string[];
      readonly wineVintageId: string;
      readonly wineryId: string;
      readonly matchResult: BottleMatchResult;
    }
  | {
      readonly kind: "skipped";
      readonly reason: "capture_import_already_claimed";
      readonly matchResult: BottleMatchResult;
    }
  | {
      readonly kind: "needs_review";
      readonly reason: ImportReviewReason;
      readonly matchResult: BottleMatchResult;
    };

export type BottleMatchResult =
  | {
      readonly kind: "create_new";
      readonly wineryCandidates: readonly MatchCandidate[];
      readonly wineVintageCandidates: readonly MatchCandidate[];
    }
  | {
      readonly kind: "reuse_wine_vintage";
      readonly wineryCandidates: readonly MatchCandidate[];
      readonly wineVintageCandidate: MatchCandidate;
      readonly wineVintageCandidates: readonly MatchCandidate[];
    }
  | {
      readonly kind: "needs_review";
      readonly reason: ImportReviewReason;
      readonly wineryCandidates: readonly MatchCandidate[];
      readonly wineVintageCandidates: readonly MatchCandidate[];
    };

export type MatchCandidate = {
  readonly id: string;
  readonly label: string;
};

export async function importBottleCandidate({
  candidate,
  captureId,
  database,
  quantity,
  siteId,
  storageLocationId,
  positionHint,
}: {
  readonly candidate: ImportCandidate;
  readonly captureId: string;
  readonly database: BoozeDatabase;
  readonly quantity: number;
  readonly siteId: string;
  readonly storageLocationId: string | null;
  readonly positionHint: string | null;
}): Promise<BottleImportResult> {
  const matchResult = await matchBottleCandidate({ candidate, database, siteId });
  if (matchResult.kind === "needs_review") {
    return {
      kind: "needs_review",
      reason: matchResult.reason,
      matchResult,
    };
  }

  if (!(await claimCaptureForImport({ captureId, database }))) {
    return {
      kind: "skipped",
      reason: "capture_import_already_claimed",
      matchResult,
    };
  }

  const vintage =
    matchResult.kind === "reuse_wine_vintage"
      ? await getExistingVintage({
          database,
          siteId,
          wineVintageId: matchResult.wineVintageCandidate.id,
        })
      : await upsertWineVintage({ database, siteId, wine: candidate.wine });
  const bottleIds = await createBottles({
    bottleIds: bottleIdsForCapture({ captureId, quantity }),
    database,
    siteId,
    wineVintageId: vintage.wineVintageId,
    storageLocationId,
    positionHint,
    bottle: candidate.bottle,
    quantity,
  });

  return {
    kind: "imported",
    bottleIds,
    wineryId: vintage.wineryId,
    wineVintageId: vintage.wineVintageId,
    matchResult,
  };
}

export async function importReviewedCapture({
  candidate,
  captureId,
  database,
  quantity,
  siteId,
  storageLocationId,
  positionHint,
  wineVintageId,
}: {
  readonly candidate: ImportCandidate;
  readonly captureId: string;
  readonly database: BoozeDatabase;
  readonly quantity: number;
  readonly siteId: string;
  readonly storageLocationId: string | null;
  readonly positionHint: string | null;
  readonly wineVintageId?: string | undefined;
}): Promise<Extract<BottleImportResult, { readonly kind: "imported" }>> {
  const vintage =
    wineVintageId === undefined
      ? await upsertWineVintage({ database, siteId, wine: candidate.wine })
      : await getExistingVintage({ database, siteId, wineVintageId });
  const bottleIds = await createBottles({
    bottleIds: bottleIdsForCapture({ captureId, quantity }),
    database,
    siteId,
    wineVintageId: vintage.wineVintageId,
    storageLocationId,
    positionHint,
    bottle: candidate.bottle,
    quantity,
  });

  const matchResult: BottleMatchResult =
    wineVintageId === undefined
      ? { kind: "create_new", wineryCandidates: [], wineVintageCandidates: [] }
      : {
          kind: "reuse_wine_vintage",
          wineryCandidates: [],
          wineVintageCandidate: { id: wineVintageId, label: wineVintageId },
          wineVintageCandidates: [],
        };

  return {
    kind: "imported",
    bottleIds,
    wineryId: vintage.wineryId,
    wineVintageId: vintage.wineVintageId,
    matchResult,
  };
}

export async function matchBottleCandidate({
  candidate,
  database,
  siteId,
}: {
  readonly candidate: ImportCandidate;
  readonly database: BoozeDatabase;
  readonly siteId: string;
}): Promise<BottleMatchResult> {
  if (candidate.wine.wineryName.trim() === "" || candidate.wine.designation.trim() === "") {
    return {
      kind: "needs_review",
      reason: "missing_required_candidate",
      wineryCandidates: [],
      wineVintageCandidates: [],
    };
  }

  const wineryRows = await database
    .select({ id: wineries.id, name: wineries.name, region: wineries.region })
    .from(wineries)
    .where(eq(wineries.siteId, siteId));
  const wineryCandidates = wineryRows
    .filter((winery) => normalize(winery.name) === normalize(candidate.wine.wineryName))
    .filter((winery) => compatibleText(winery.region, candidate.wine.region))
    .map((winery) => ({
      id: winery.id,
      label: winery.region === null ? winery.name : `${winery.name} (${winery.region})`,
    }));
  if (wineryCandidates.length > 1) {
    return {
      kind: "needs_review",
      reason: "ambiguous_winery",
      wineryCandidates,
      wineVintageCandidates: [],
    };
  }
  if (wineryCandidates.length === 0) {
    return { kind: "create_new", wineryCandidates: [], wineVintageCandidates: [] };
  }
  const wineryCandidate = wineryCandidates[0];
  if (wineryCandidate === undefined) {
    return { kind: "create_new", wineryCandidates: [], wineVintageCandidates: [] };
  }

  const wineVintageCandidates = await findWineVintageCandidates({
    candidate,
    database,
    siteId,
    wineryId: wineryCandidate.id,
  });
  if (wineVintageCandidates.length > 1) {
    return {
      kind: "needs_review",
      reason: "ambiguous_wine_vintage",
      wineryCandidates,
      wineVintageCandidates,
    };
  }
  const wineVintageCandidate = wineVintageCandidates[0];
  if (wineVintageCandidate !== undefined) {
    return {
      kind: "reuse_wine_vintage",
      wineryCandidates,
      wineVintageCandidate,
      wineVintageCandidates,
    };
  }
  return {
    kind: "create_new",
    wineryCandidates,
    wineVintageCandidates,
  };
}

async function findWineVintageCandidates({
  candidate,
  database,
  siteId,
  wineryId,
}: {
  readonly candidate: ImportCandidate;
  readonly database: BoozeDatabase;
  readonly siteId: string;
  readonly wineryId: string;
}): Promise<readonly MatchCandidate[]> {
  const vintageLabel = vintageLabelForYear(candidate.wine.vintageYear);
  const rows = await database
    .select({
      id: wineVintages.id,
      displayName: wineVintages.displayName,
      baseName: wineVintages.baseName,
      vintageLabel: wineVintages.vintageLabel,
      region: wineVintages.region,
    })
    .from(wineVintages)
    .where(and(eq(wineVintages.siteId, siteId), eq(wineVintages.wineryId, wineryId)));

  return rows
    .filter((wine) => wine.vintageLabel === vintageLabel)
    .filter(
      (wine) =>
        normalize(wine.displayName) === normalize(candidate.wine.displayName) ||
        normalize(wine.baseName) === normalize(candidate.wine.designation),
    )
    .filter((wine) => compatibleText(wine.region, candidate.wine.region))
    .map((wine) => ({
      id: wine.id,
      label: `${wine.vintageLabel} ${wine.displayName}`,
    }));
}

async function getExistingVintage({
  database,
  siteId,
  wineVintageId,
}: {
  readonly database: BoozeDatabase;
  readonly siteId: string;
  readonly wineVintageId: string;
}): Promise<{ readonly wineryId: string; readonly wineVintageId: string }> {
  const rows = await database
    .select({ wineVintageId: wineVintages.id, wineryId: wineVintages.wineryId })
    .from(wineVintages)
    .where(and(eq(wineVintages.siteId, siteId), eq(wineVintages.id, wineVintageId)))
    .limit(1);
  const row = rows[0];
  if (row === undefined) {
    throw new Error(`Wine vintage ${wineVintageId} not found in site ${siteId}`);
  }
  return row;
}

function normalize(value: string | undefined): string {
  return (
    value
      ?.toLowerCase()
      .replaceAll("&", "and")
      .replaceAll(/[^a-z0-9]+/gu, " ")
      .replaceAll(/\b(wines?|winery|estate|vineyards?)\b/gu, "")
      .replaceAll(/\s+/gu, " ")
      .trim() ?? ""
  );
}

function compatibleText(existing: string | null, candidate: string | undefined): boolean {
  const existingValue = normalize(existing ?? undefined);
  const candidateValue = normalize(candidate);
  return existingValue === "" || candidateValue === "" || existingValue === candidateValue;
}

export function databaseFromD1(database: D1Database): BoozeDatabase {
  return createD1Client(database);
}

function bottleIdsForCapture({
  captureId,
  quantity,
}: {
  readonly captureId: string;
  readonly quantity: number;
}): readonly string[] {
  return Array.from({ length: quantity }, (_, index) =>
    stableId("bottle", `${captureId}-${index}`),
  );
}
