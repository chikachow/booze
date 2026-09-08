import {
  bottleCaptureRuns,
  bottleCaptures,
  bottles,
  createD1Client,
  wineries,
  wineVintages,
  type BoozeDatabase,
} from "@chikachow/booze-db";
import { and, eq, inArray, sql } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";

import { createBottleStatements, prepareWineVintage } from "./api/catalogue.ts";
import { stableId, vintageLabelForYear } from "./api/ids.ts";
import { retryCatalogueTransaction } from "./api/catalogue-transaction.ts";
import type { ImportCandidate } from "./bottle-extractor.ts";
import {
  claimCaptureForImport,
  latestCaptureRunId,
  type CaptureImportClaim,
} from "./capture-store.ts";

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

type CaptureImportInput = {
  readonly candidate: ImportCandidate;
  readonly captureId: string;
  readonly database: BoozeDatabase;
  readonly quantity: number;
  readonly siteId: string;
  readonly storageLocationId: string | null;
  readonly positionHint: string | null;
  readonly runId: string;
  readonly workflowInstanceId?: string | null | undefined;
};

export class CaptureImportConflictError extends HTTPException {
  public constructor(cause?: unknown) {
    super(409, {
      cause,
      message: "Capture processing changed before import. Refresh the capture before trying again.",
    });
  }
}

export async function importBottleCandidate(
  input: CaptureImportInput,
): Promise<BottleImportResult> {
  const { candidate, captureId, database, runId, siteId, workflowInstanceId } = input;
  return retryCatalogueTransaction(async (): Promise<BottleImportResult> => {
    const committed = await committedImportResult({ captureId, database, runId });
    if (committed !== null) {
      return committed;
    }
    const matchResult = await matchBottleCandidate({ candidate, database, siteId });
    if (matchResult.kind === "needs_review") {
      return {
        kind: "needs_review",
        reason: matchResult.reason,
        matchResult,
      };
    }

    const claim = await claimCaptureForImport({
      captureId,
      database,
      runId,
      siteId,
      resume: true,
      workflowInstanceId,
    });
    const skipped = {
      kind: "skipped",
      reason: "capture_import_already_claimed",
      matchResult,
    } satisfies BottleImportResult;
    if (claim === null) return skipped;
    try {
      return await commitCaptureImport({
        input,
        claim,
        matchResult,
        wineVintageId:
          matchResult.kind === "reuse_wine_vintage"
            ? matchResult.wineVintageCandidate.id
            : undefined,
      });
    } catch (error) {
      if (!(error instanceof CaptureImportConflictError)) throw error;
      return (await committedImportResult({ captureId, database, runId })) ?? skipped;
    }
  });
}

export async function importReviewedCapture(
  input: CaptureImportInput & { readonly wineVintageId?: string | undefined },
): Promise<Extract<BottleImportResult, { readonly kind: "imported" }>> {
  const { captureId, database, runId, siteId, wineVintageId, workflowInstanceId } = input;
  const committed = await committedImportResult({ captureId, database, runId });
  if (committed !== null) return committed;
  const claim = await claimCaptureForImport({
    captureId,
    database,
    runId,
    siteId,
    workflowInstanceId,
  });
  if (claim === null) throw new CaptureImportConflictError();
  const matchResult: BottleMatchResult =
    wineVintageId === undefined
      ? { kind: "create_new", wineryCandidates: [], wineVintageCandidates: [] }
      : {
          kind: "reuse_wine_vintage",
          wineryCandidates: [],
          wineVintageCandidate: { id: wineVintageId, label: wineVintageId },
          wineVintageCandidates: [],
        };
  return retryCatalogueTransaction(async () => {
    try {
      return await commitCaptureImport({ input, claim, matchResult, wineVintageId });
    } catch (error) {
      if (error instanceof CaptureImportConflictError) {
        const receipt = await committedImportResult({ captureId, database, runId });
        if (receipt !== null) return receipt;
      }
      throw error;
    }
  });
}

async function commitCaptureImport({
  input,
  claim,
  matchResult,
  wineVintageId,
}: {
  readonly input: CaptureImportInput;
  readonly claim: CaptureImportClaim;
  readonly matchResult: BottleMatchResult;
  readonly wineVintageId: string | undefined;
}): Promise<Extract<BottleImportResult, { readonly kind: "imported" }>> {
  const { candidate, database, quantity, storageLocationId, positionHint } = input;
  const { captureId, runId, siteId } = claim;
  const vintage =
    wineVintageId === undefined
      ? await prepareWineVintage({ database, siteId, wine: candidate.wine })
      : await getExistingVintage({ database, siteId, wineVintageId });
  const destination = await currentCaptureDestination({
    captureId,
    database,
    storageLocationId,
    positionHint,
  });
  const { bottleIds, statements } = createBottleStatements({
    bottleIds: bottleIdsForCapture({ captureId, quantity }),
    database,
    siteId,
    wineVintageId: vintage.wineVintageId,
    ...destination,
    bottle: candidate.bottle,
    quantity,
  });
  const result = {
    kind: "imported",
    bottleIds,
    wineryId: vintage.wineryId,
    wineVintageId: vintage.wineVintageId,
    matchResult,
  } satisfies Extract<BottleImportResult, { readonly kind: "imported" }>;
  await assertExistingBottlesMatch({
    bottleIds,
    database,
    siteId,
    wineVintageId: vintage.wineVintageId,
  });
  try {
    await database.batch([
      captureImportGuardStatement({ claim, database }),
      ...importCompletionStatements({ captureId, database, result, runId }),
      ...vintage.statements,
      ...statements,
    ]);
  } catch (error) {
    if (isCaptureImportGuardFailure(error)) throw new CaptureImportConflictError(error);
    throw error;
  }
  return result;
}

function captureImportGuardStatement({
  claim,
  database,
}: {
  readonly claim: CaptureImportClaim;
  readonly database: BoozeDatabase;
}) {
  // D1 batches cannot branch on an UPDATE's affected-row count. This INSERT is
  // a no-op for an existing run with the current claim. A stale/missing claim
  // produces NULL capture_id: SQLite checks NOT NULL before the ID-conflict
  // no-op, aborting the entire batch before any receipt or inventory is written.
  return database
    .insert(bottleCaptureRuns)
    .values({
      id: claim.runId,
      captureId: sql`(SELECT ${bottleCaptures.id} FROM ${bottleCaptures}
        WHERE ${bottleCaptures.id} = ${claim.captureId}
          AND ${bottleCaptures.siteId} = ${claim.siteId}
          AND ${bottleCaptures.status} = 'importing'
          AND ${bottleCaptures.workflowInstanceId} IS ${claim.workflowInstanceId}
          AND ${latestCaptureRunId(claim.captureId)} = ${claim.runId})`,
      status: "importing",
      extractorVersion: "bottle-ocr-v1",
      promptVersion: "capture-v1",
      schemaVersion: "wine-vintage-v1",
    })
    .onConflictDoNothing({ target: bottleCaptureRuns.id });
}

function isCaptureImportGuardFailure(error: unknown): boolean {
  const seen = new Set<Error>();
  let cause = error;
  while (cause instanceof Error && !seen.has(cause)) {
    seen.add(cause);
    if (
      /^(?:D1_ERROR: )?NOT NULL constraint failed: bottle_capture_runs\.capture_id(?:: SQLITE_CONSTRAINT(?: \(extended: SQLITE_CONSTRAINT_NOTNULL\))?)?$/u.test(
        cause.message,
      )
    ) {
      return true;
    }
    cause = cause.cause;
  }
  return false;
}

async function assertExistingBottlesMatch({
  bottleIds,
  database,
  siteId,
  wineVintageId,
}: {
  readonly bottleIds: readonly string[];
  readonly database: BoozeDatabase;
  readonly siteId: string;
  readonly wineVintageId: string;
}): Promise<void> {
  const existing = await database
    .select({ siteId: bottles.siteId, wineVintageId: bottles.wineVintageId })
    .from(bottles)
    .where(inArray(bottles.id, [...bottleIds]));
  if (
    existing.some((bottle) => bottle.siteId !== siteId || bottle.wineVintageId !== wineVintageId)
  ) {
    throw new Error(
      "Capture already contains bottles for a different wine. Review the existing bottles before importing.",
    );
  }
}

async function currentCaptureDestination({
  captureId,
  database,
  storageLocationId,
  positionHint,
}: {
  readonly captureId: string;
  readonly database: BoozeDatabase;
  readonly storageLocationId: string | null;
  readonly positionHint: string | null;
}) {
  const [capture] = await database
    .select({
      storageLocationId: bottleCaptures.storageLocationId,
      positionHint: bottleCaptures.positionHint,
    })
    .from(bottleCaptures)
    .where(eq(bottleCaptures.id, captureId))
    .limit(1);
  return capture ?? { storageLocationId, positionHint };
}

function importCompletionStatements({
  captureId,
  database,
  result,
  runId,
}: {
  readonly captureId: string;
  readonly database: BoozeDatabase;
  readonly result: Extract<BottleImportResult, { readonly kind: "imported" }>;
  readonly runId: string;
}) {
  return [
    database
      .update(bottleCaptureRuns)
      .set({
        status: "imported",
        importResultJson: JSON.stringify(result),
        matchResultJson: JSON.stringify(result.matchResult),
        errorMessage: null,
        completedAt: new Date().toISOString(),
      })
      .where(eq(bottleCaptureRuns.id, runId)),
    database
      .update(bottleCaptures)
      .set({
        status: "imported",
        importedBottleIdsJson: JSON.stringify(result.bottleIds),
        errorMessage: null,
        errorDetailJson: null,
        updatedAt: sql`CURRENT_TIMESTAMP`,
      })
      .where(eq(bottleCaptures.id, captureId)),
  ] as const;
}

async function committedImportResult({
  captureId,
  database,
  runId,
}: {
  readonly captureId: string;
  readonly database: BoozeDatabase;
  readonly runId: string;
}): Promise<Extract<BottleImportResult, { readonly kind: "imported" }> | null> {
  const [run] = await database
    .select({ result: bottleCaptureRuns.importResultJson })
    .from(bottleCaptureRuns)
    .where(
      and(
        eq(bottleCaptureRuns.id, runId),
        eq(bottleCaptureRuns.captureId, captureId),
        eq(bottleCaptureRuns.status, "imported"),
      ),
    )
    .limit(1);
  if (run?.result === null || run?.result === undefined) {
    return null;
  }
  // This receipt is written atomically with the bottles by importCompletionStatements.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Reads the internal persisted import result.
  return JSON.parse(run.result) as Extract<BottleImportResult, { readonly kind: "imported" }>;
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
  if (normalize(candidate.wine.wineryName) === "" || normalize(candidate.wine.designation) === "") {
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
        (normalize(candidate.wine.displayName) !== "" &&
          normalize(wine.displayName) === normalize(candidate.wine.displayName)) ||
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
}): Promise<{
  readonly wineryId: string;
  readonly wineVintageId: string;
  readonly statements: readonly never[];
}> {
  const rows = await database
    .select({ wineVintageId: wineVintages.id, wineryId: wineVintages.wineryId })
    .from(wineVintages)
    .where(and(eq(wineVintages.siteId, siteId), eq(wineVintages.id, wineVintageId)))
    .limit(1);
  const row = rows[0];
  if (row === undefined) {
    throw new Error(`Wine vintage ${wineVintageId} not found in site ${siteId}`);
  }
  return { ...row, statements: [] };
}

function normalize(value: string | null | undefined): string {
  return (
    value
      ?.normalize("NFKD")
      .replaceAll(/\p{M}+/gu, "")
      .toLowerCase()
      .replaceAll("&", "and")
      .replaceAll(/[^\p{L}\p{N}]+/gu, " ")
      .replaceAll(/\b(wines?|winery|estate|vineyards?)\b/gu, "")
      .replaceAll(/\s+/gu, " ")
      .trim() ?? ""
  );
}

function compatibleText(existing: string | null, candidate: string | null | undefined): boolean {
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
