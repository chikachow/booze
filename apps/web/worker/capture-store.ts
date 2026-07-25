// oxlint-disable eslint/no-use-before-define
import {
  bottleCaptureImages,
  bottleCaptureRuns,
  bottleCaptures,
  createD1Client,
  imageAssets,
  siteMemberships,
  sites,
  storageLocations,
  type BoozeDatabase,
} from "@chikachow/booze-db";
import { and, desc, eq, sql } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";

import { isCaptureStatus, type CaptureStatus } from "./capture-state.ts";
import { errorDetails, logError } from "./observability.ts";

const supportedImageTypes = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);
const maxImageSizeBytes = 8 * 1024 * 1024;
const maxCaptureImages = 4;
const thumbnailContentType = "image/webp";
const thumbnailExtension = ".webp";
const thumbnailSizePixels = 240;
const thumbnailQuality = 75;

export type CaptureImageInput = {
  readonly file: File;
  readonly sortOrder: number;
};

export type CaptureImageResource = {
  readonly imageAssetId: string;
  readonly originalFilename: string | null;
  readonly sortOrder: number;
  readonly contentType: string;
  readonly sizeBytes: number;
  readonly imageUrl: string;
};

export type CaptureRunResource = {
  readonly id: string;
  readonly status: string;
  readonly extractionR2Key: string | null;
  readonly extractionContentType: string | null;
  readonly extractionSizeBytes: number | null;
  readonly importCandidate: unknown;
  readonly matchResult: unknown;
  readonly importResult: unknown;
  readonly errorMessage: string | null;
  readonly errorDetailR2Key: string | null;
  readonly errorDetailContentType: string | null;
  readonly errorDetailSizeBytes: number | null;
  readonly createdAt: string;
  readonly completedAt: string | null;
};

export type CaptureResource = {
  readonly id: string;
  readonly siteId: string;
  readonly siteName: string;
  readonly storageLocationId: string | null;
  readonly storageLocationName: string | null;
  readonly positionHint: string | null;
  readonly quantity: number;
  readonly status: CaptureStatus;
  readonly importedBottleIds: readonly string[];
  readonly errorMessage: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly images: readonly CaptureImageResource[];
  readonly latestRun: CaptureRunResource | null;
};

export type CaptureWorkflowRecord = {
  readonly id: string;
  readonly siteId: string;
  readonly userId: string;
  readonly storageLocationId: string | null;
  readonly positionHint: string | null;
  readonly quantity: number;
  readonly images: readonly {
    readonly imageAssetId: string;
    readonly r2Key: string;
    readonly contentType: string;
    readonly sortOrder: number;
  }[];
};

export type CreateBottleCaptureResult =
  | {
      readonly captureId: string;
      readonly status: "queued";
    }
  | {
      readonly captureId: string;
      readonly errorMessage: string;
      readonly status: "upload_failed";
    };

export function validateCaptureFiles(files: readonly File[]): void {
  if (files.length === 0) {
    throw new HTTPException(400, { message: "At least one image is required" });
  }
  if (files.length > maxCaptureImages) {
    throw new HTTPException(400, { message: `Choose up to ${maxCaptureImages} images` });
  }
  for (const file of files) {
    if (!supportedImageTypes.has(file.type)) {
      throw new HTTPException(415, {
        message: "Only JPEG, PNG, WebP, HEIC, or HEIF images are supported",
      });
    }
    if (file.size > maxImageSizeBytes) {
      throw new HTTPException(413, { message: "Images must be smaller than 8MB" });
    }
  }
}

export async function createBottleCapture({
  bucket,
  database,
  files,
  images,
  positionHint,
  quantity,
  siteId,
  storageLocationId,
  userId,
}: {
  readonly bucket: R2Bucket;
  readonly database: BoozeDatabase;
  readonly files: readonly File[];
  readonly images: ImagesBinding | undefined;
  readonly positionHint: string | null;
  readonly quantity: number;
  readonly siteId: string;
  readonly storageLocationId: string | null;
  readonly userId: string;
}): Promise<CreateBottleCaptureResult> {
  validateCaptureFiles(files);

  const captureId = crypto.randomUUID();
  try {
    await database.insert(bottleCaptures).values({
      id: captureId,
      siteId,
      userId,
      storageLocationId,
      positionHint,
      quantity,
      status: "upload_failed",
      errorMessage: "Capture image upload did not complete. Submit the capture again.",
      errorDetailJson: JSON.stringify(
        captureUploadFailureDetail({
          files,
          imageAssetCount: 0,
          stage: "intake_started",
        }),
      ),
    });
  } catch (error) {
    logError("bottle_capture_insert_failed", {
      captureId,
      error: errorDetails(error),
      fileCount: files.length,
      siteId,
      storageLocationId,
    });
    throw error;
  }

  const imageAssetIds: string[] = [];
  try {
    for (const [index, file] of files.entries()) {
      await updateCaptureStatus({
        captureId,
        database,
        status: "upload_failed",
        errorMessage: "Capture image upload did not complete. Submit the capture again.",
        errorDetail: captureUploadFailureDetail({
          files,
          imageAssetCount: imageAssetIds.length,
          nextSortOrder: index,
          stage: "storing_image",
        }),
      });
      const imageAssetId = await upsertImageAsset({
        bucket,
        database,
        file,
        images,
        siteId,
        userId,
      });
      imageAssetIds.push(imageAssetId);
      await updateCaptureStatus({
        captureId,
        database,
        status: "upload_failed",
        errorMessage: "Capture image upload did not complete. Submit the capture again.",
        errorDetail: captureUploadFailureDetail({
          files,
          imageAssetCount: imageAssetIds.length,
          nextSortOrder: index,
          stage: "linking_image",
        }),
      });
      await database.insert(bottleCaptureImages).values({
        captureId,
        imageAssetId,
        sortOrder: index,
        originalFilename: file.name === "" ? null : file.name,
      });
    }
  } catch (error) {
    const details = errorDetails(error);
    const errorMessage = "Capture image upload did not complete. Submit the capture again.";
    await updateCaptureStatus({
      captureId,
      database,
      status: "upload_failed",
      errorMessage,
      errorDetail: captureUploadFailureDetail({
        error: details,
        files,
        imageAssetCount: imageAssetIds.length,
        stage: "failed",
      }),
    });
    logError("bottle_capture_image_intake_failed", {
      captureId,
      error: details,
      fileCount: files.length,
      imageAssetCount: imageAssetIds.length,
      files: captureFileSummaries(files),
      siteId,
      storageLocationId,
    });
    return { captureId, errorMessage, status: "upload_failed" };
  }

  await updateCaptureStatus({
    captureId,
    database,
    status: "queued",
    errorMessage: null,
    errorDetail: null,
  });
  return { captureId, status: "queued" };
}

export async function setCaptureWorkflowInstance({
  captureId,
  database,
  workflowInstanceId,
}: {
  readonly captureId: string;
  readonly database: BoozeDatabase;
  readonly workflowInstanceId: string;
}): Promise<void> {
  await database
    .update(bottleCaptures)
    .set({ workflowInstanceId, updatedAt: sql`CURRENT_TIMESTAMP` })
    .where(eq(bottleCaptures.id, captureId));
}

export async function listBottleCaptures({
  database,
  userId,
}: {
  readonly database: BoozeDatabase;
  readonly userId: string;
}): Promise<readonly CaptureResource[]> {
  const rows = await database
    .select({
      id: bottleCaptures.id,
      siteId: bottleCaptures.siteId,
      siteName: sites.name,
      storageLocationId: bottleCaptures.storageLocationId,
      storageLocationName: storageLocations.name,
      positionHint: bottleCaptures.positionHint,
      quantity: bottleCaptures.quantity,
      status: bottleCaptures.status,
      importedBottleIdsJson: bottleCaptures.importedBottleIdsJson,
      errorMessage: bottleCaptures.errorMessage,
      createdAt: bottleCaptures.createdAt,
      updatedAt: bottleCaptures.updatedAt,
    })
    .from(bottleCaptures)
    .innerJoin(sites, eq(bottleCaptures.siteId, sites.id))
    .innerJoin(siteMemberships, eq(bottleCaptures.siteId, siteMemberships.siteId))
    .leftJoin(
      storageLocations,
      and(
        eq(bottleCaptures.siteId, storageLocations.siteId),
        eq(bottleCaptures.storageLocationId, storageLocations.id),
      ),
    )
    .where(eq(siteMemberships.userId, userId))
    .orderBy(desc(bottleCaptures.createdAt));

  return Promise.all(
    rows.map(async (row) => ({
      ...row,
      status: captureStatus(row.status),
      importedBottleIds: parseStringArray(row.importedBottleIdsJson),
      images: await listCaptureImages({ database, captureId: row.id }),
      latestRun: await getLatestRun({ database, captureId: row.id }),
    })),
  );
}

export async function getBottleCapture({
  captureId,
  database,
  userId,
}: {
  readonly captureId: string;
  readonly database: BoozeDatabase;
  readonly userId: string;
}): Promise<CaptureResource> {
  const rows = await listBottleCaptures({ database, userId });
  const capture = rows.find((row) => row.id === captureId);
  if (capture === undefined) {
    throw new HTTPException(404, { message: "Capture not found" });
  }
  return capture;
}

export async function getCaptureForWorkflow({
  captureId,
  database,
}: {
  readonly captureId: string;
  readonly database: BoozeDatabase;
}): Promise<CaptureWorkflowRecord> {
  const captures = await database
    .select({
      id: bottleCaptures.id,
      siteId: bottleCaptures.siteId,
      userId: bottleCaptures.userId,
      storageLocationId: bottleCaptures.storageLocationId,
      positionHint: bottleCaptures.positionHint,
      quantity: bottleCaptures.quantity,
    })
    .from(bottleCaptures)
    .where(eq(bottleCaptures.id, captureId))
    .limit(1);
  const capture = captures[0];
  if (capture === undefined) {
    throw new Error(`Capture ${captureId} not found`);
  }

  const images = await database
    .select({
      imageAssetId: imageAssets.id,
      r2Key: imageAssets.r2Key,
      contentType: imageAssets.contentType,
      sortOrder: bottleCaptureImages.sortOrder,
    })
    .from(bottleCaptureImages)
    .innerJoin(imageAssets, eq(bottleCaptureImages.imageAssetId, imageAssets.id))
    .where(eq(bottleCaptureImages.captureId, captureId))
    .orderBy(bottleCaptureImages.sortOrder);

  return { ...capture, images };
}

export async function getCaptureImageObject({
  captureId,
  database,
  imageAssetId,
  userId,
}: {
  readonly captureId: string;
  readonly database: BoozeDatabase;
  readonly imageAssetId: string;
  readonly userId: string;
}): Promise<{ readonly r2Key: string; readonly contentType: string }> {
  await getBottleCapture({ captureId, database, userId });
  const rows = await database
    .select({
      r2Key: sql<string>`coalesce(${imageAssets.thumbnailR2Key}, ${imageAssets.r2Key})`,
      contentType: sql<string>`coalesce(${imageAssets.thumbnailContentType}, ${imageAssets.contentType})`,
    })
    .from(bottleCaptureImages)
    .innerJoin(imageAssets, eq(bottleCaptureImages.imageAssetId, imageAssets.id))
    .where(
      and(
        eq(bottleCaptureImages.captureId, captureId),
        eq(bottleCaptureImages.imageAssetId, imageAssetId),
      ),
    )
    .limit(1);
  const image = rows[0];
  if (image === undefined) {
    throw new HTTPException(404, { message: "Capture image not found" });
  }
  return image;
}

export async function createCaptureRun({
  captureId,
  database,
  status,
}: {
  readonly captureId: string;
  readonly database: BoozeDatabase;
  readonly status: string;
}): Promise<{ readonly runId: string; readonly attemptNumber: number }> {
  const previousRuns = await database
    .select({ id: bottleCaptureRuns.id })
    .from(bottleCaptureRuns)
    .where(eq(bottleCaptureRuns.captureId, captureId));
  const attemptNumber = previousRuns.length + 1;
  const runId = crypto.randomUUID();
  await database.insert(bottleCaptureRuns).values({
    id: runId,
    captureId,
    status,
    extractorVersion: "bottle-ocr-v1",
    promptVersion: "capture-v1",
    schemaVersion: "wine-vintage-v1",
    attemptNumber,
    startedAt: new Date().toISOString(),
  });
  return { runId, attemptNumber };
}

export async function updateCaptureStatus({
  captureId,
  database,
  errorDetail,
  errorMessage,
  importedBottleIds,
  status,
}: {
  readonly captureId: string;
  readonly database: BoozeDatabase;
  readonly errorDetail?: unknown;
  readonly errorMessage?: string | null;
  readonly importedBottleIds?: readonly string[];
  readonly status: CaptureStatus;
}): Promise<void> {
  await database
    .update(bottleCaptures)
    .set({
      status,
      ...(errorMessage === undefined ? {} : { errorMessage }),
      ...(errorDetail === undefined
        ? {}
        : { errorDetailJson: errorDetail === null ? null : JSON.stringify(errorDetail) }),
      ...(importedBottleIds === undefined
        ? {}
        : { importedBottleIdsJson: JSON.stringify(importedBottleIds) }),
      updatedAt: sql`CURRENT_TIMESTAMP`,
    })
    .where(eq(bottleCaptures.id, captureId));
}

export async function claimCaptureForImport({
  captureId,
  database,
}: {
  readonly captureId: string;
  readonly database: BoozeDatabase;
}): Promise<boolean> {
  const result = await database.run(
    sql`UPDATE ${bottleCaptures}
        SET status = 'importing', updated_at = CURRENT_TIMESTAMP
        WHERE id = ${captureId}
          AND status IN ('extracting', 'needs_review')`,
  );
  return result.meta.changes === 1;
}

export async function updateCaptureRun({
  database,
  errorDetailArtifact,
  errorMessage,
  extractionArtifact,
  importCandidate,
  importResult,
  matchResult,
  model,
  runId,
  status,
}: {
  readonly database: BoozeDatabase;
  readonly errorDetailArtifact?:
    | {
        readonly contentType: string;
        readonly r2Key: string;
        readonly sizeBytes: number;
      }
    | undefined;
  readonly errorMessage?: string | null;
  readonly extractionArtifact?:
    | {
        readonly contentType: string;
        readonly r2Key: string;
        readonly sizeBytes: number;
      }
    | undefined;
  readonly importCandidate?: unknown;
  readonly importResult?: unknown;
  readonly matchResult?: unknown;
  readonly model?: string | null;
  readonly runId: string;
  readonly status: string;
}): Promise<void> {
  await database
    .update(bottleCaptureRuns)
    .set({
      status,
      ...(extractionArtifact === undefined
        ? {}
        : {
            extractionR2Key: extractionArtifact.r2Key,
            extractionContentType: extractionArtifact.contentType,
            extractionSizeBytes: extractionArtifact.sizeBytes,
          }),
      ...(importCandidate === undefined
        ? {}
        : {
            importCandidateJson: JSON.stringify(importCandidate),
          }),
      ...(matchResult === undefined ? {} : { matchResultJson: JSON.stringify(matchResult) }),
      ...(importResult === undefined ? {} : { importResultJson: JSON.stringify(importResult) }),
      ...(model === undefined ? {} : { model }),
      ...(errorMessage === undefined ? {} : { errorMessage }),
      ...(errorDetailArtifact === undefined
        ? {}
        : {
            errorDetailR2Key: errorDetailArtifact.r2Key,
            errorDetailContentType: errorDetailArtifact.contentType,
            errorDetailSizeBytes: errorDetailArtifact.sizeBytes,
          }),
      completedAt: new Date().toISOString(),
    })
    .where(eq(bottleCaptureRuns.id, runId));
}

async function upsertImageAsset({
  bucket,
  database,
  file,
  images,
  siteId,
  userId,
}: {
  readonly bucket: R2Bucket;
  readonly database: BoozeDatabase;
  readonly file: File;
  readonly images: ImagesBinding | undefined;
  readonly siteId: string;
  readonly userId: string;
}): Promise<string> {
  const bytes = await file.arrayBuffer();
  const sha256 = await sha256Hex(bytes);
  const existing = await database
    .select({
      id: imageAssets.id,
      thumbnailR2Key: imageAssets.thumbnailR2Key,
    })
    .from(imageAssets)
    .where(and(eq(imageAssets.siteId, siteId), eq(imageAssets.sha256, sha256)))
    .limit(1);
  const existingImage = existing[0];
  if (existingImage !== undefined) {
    if (existingImage.thumbnailR2Key === null) {
      await createImageThumbnail({
        bucket,
        bytes,
        database,
        imageAssetId: existingImage.id,
        images,
        sha256,
        siteId,
      });
    }
    return existingImage.id;
  }

  const imageAssetId = crypto.randomUUID();
  const r2Key = `sites/${siteId}/images/${sha256}${extensionForContentType(file.type)}`;
  await bucket.put(r2Key, bytes, { httpMetadata: { contentType: file.type } });
  await database.insert(imageAssets).values({
    id: imageAssetId,
    siteId,
    sha256,
    r2Key,
    contentType: file.type,
    sizeBytes: file.size,
    uploadedByUserId: userId,
  });
  await createImageThumbnail({
    bucket,
    bytes,
    database,
    imageAssetId,
    images,
    sha256,
    siteId,
  });
  return imageAssetId;
}

async function createImageThumbnail({
  bucket,
  bytes,
  database,
  imageAssetId,
  images,
  sha256,
  siteId,
}: {
  readonly bucket: R2Bucket;
  readonly bytes: ArrayBuffer;
  readonly database: BoozeDatabase;
  readonly imageAssetId: string;
  readonly images: ImagesBinding | undefined;
  readonly sha256: string;
  readonly siteId: string;
}): Promise<void> {
  if (images === undefined) {
    return;
  }

  try {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(bytes));
        controller.close();
      },
    });

    const result = await images
      .input(body)
      .transform({
        fit: "cover",
        gravity: "auto",
        height: thumbnailSizePixels,
        width: thumbnailSizePixels,
      })
      .output({ format: thumbnailContentType, quality: thumbnailQuality });
    const thumbnailBytes = await new Response(result.image()).arrayBuffer();
    const thumbnailR2Key = `sites/${siteId}/thumbnails/${sha256}${thumbnailExtension}`;
    await bucket.put(thumbnailR2Key, thumbnailBytes, {
      httpMetadata: { contentType: result.contentType() },
    });
    await database
      .update(imageAssets)
      .set({
        thumbnailR2Key,
        thumbnailContentType: result.contentType(),
        thumbnailSizeBytes: thumbnailBytes.byteLength,
        thumbnailWidth: thumbnailSizePixels,
        thumbnailHeight: thumbnailSizePixels,
        updatedAt: sql`CURRENT_TIMESTAMP`,
      })
      .where(eq(imageAssets.id, imageAssetId));
  } catch (error) {
    logError("image_thumbnail_create_failed", {
      error: errorDetails(error),
      imageAssetId,
      siteId,
    });
  }
}

async function listCaptureImages({
  captureId,
  database,
}: {
  readonly captureId: string;
  readonly database: BoozeDatabase;
}): Promise<readonly CaptureImageResource[]> {
  const rows = await database
    .select({
      imageAssetId: imageAssets.id,
      originalFilename: bottleCaptureImages.originalFilename,
      sortOrder: bottleCaptureImages.sortOrder,
      contentType: sql<string>`coalesce(${imageAssets.thumbnailContentType}, ${imageAssets.contentType})`,
      sizeBytes: sql<number>`coalesce(${imageAssets.thumbnailSizeBytes}, ${imageAssets.sizeBytes})`,
    })
    .from(bottleCaptureImages)
    .innerJoin(imageAssets, eq(bottleCaptureImages.imageAssetId, imageAssets.id))
    .where(eq(bottleCaptureImages.captureId, captureId))
    .orderBy(bottleCaptureImages.sortOrder);

  return rows.map((row) => ({
    ...row,
    imageUrl: `/api/bottle-captures/${captureId}/images/${row.imageAssetId}`,
  }));
}

async function getLatestRun({
  captureId,
  database,
}: {
  readonly captureId: string;
  readonly database: BoozeDatabase;
}): Promise<CaptureRunResource | null> {
  const rows = await database
    .select({
      id: bottleCaptureRuns.id,
      status: bottleCaptureRuns.status,
      extractionR2Key: bottleCaptureRuns.extractionR2Key,
      extractionContentType: bottleCaptureRuns.extractionContentType,
      extractionSizeBytes: bottleCaptureRuns.extractionSizeBytes,
      importCandidateJson: bottleCaptureRuns.importCandidateJson,
      matchResultJson: bottleCaptureRuns.matchResultJson,
      importResultJson: bottleCaptureRuns.importResultJson,
      errorMessage: bottleCaptureRuns.errorMessage,
      errorDetailR2Key: bottleCaptureRuns.errorDetailR2Key,
      errorDetailContentType: bottleCaptureRuns.errorDetailContentType,
      errorDetailSizeBytes: bottleCaptureRuns.errorDetailSizeBytes,
      createdAt: bottleCaptureRuns.createdAt,
      completedAt: bottleCaptureRuns.completedAt,
    })
    .from(bottleCaptureRuns)
    .where(eq(bottleCaptureRuns.captureId, captureId))
    .orderBy(desc(bottleCaptureRuns.createdAt))
    .limit(1);
  const row = rows[0];
  if (row === undefined) {
    return null;
  }
  return {
    id: row.id,
    status: row.status,
    extractionR2Key: row.extractionR2Key,
    extractionContentType: row.extractionContentType,
    extractionSizeBytes: row.extractionSizeBytes,
    importCandidate: parseJson(row.importCandidateJson),
    matchResult: parseJson(row.matchResultJson),
    importResult: parseJson(row.importResultJson),
    errorMessage: row.errorMessage,
    errorDetailR2Key: row.errorDetailR2Key,
    errorDetailContentType: row.errorDetailContentType,
    errorDetailSizeBytes: row.errorDetailSizeBytes,
    createdAt: row.createdAt,
    completedAt: row.completedAt,
  };
}

async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function extensionForContentType(contentType: string): string {
  switch (contentType) {
    case "image/jpeg":
      return ".jpg";
    case "image/png":
      return ".png";
    case "image/webp":
      return ".webp";
    case "image/heic":
      return ".heic";
    case "image/heif":
      return ".heif";
    default:
      return "";
  }
}

function captureStatus(value: string): CaptureStatus {
  return isCaptureStatus(value) ? value : "failed";
}

function parseStringArray(value: string | null): readonly string[] {
  const parsed = parseJson(value);
  if (!Array.isArray(parsed)) {
    return [];
  }
  return parsed.filter((entry): entry is string => typeof entry === "string");
}

function parseJson(value: string | null): unknown {
  if (value === null) {
    return null;
  }
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

function captureFileSummaries(files: readonly File[]): readonly {
  readonly contentType: string;
  readonly sizeBytes: number;
}[] {
  return files.map((file) => ({ contentType: file.type, sizeBytes: file.size }));
}

function captureUploadFailureDetail({
  error,
  files,
  imageAssetCount,
  nextSortOrder,
  stage,
}: {
  readonly error?: ReturnType<typeof errorDetails>;
  readonly files: readonly File[];
  readonly imageAssetCount: number;
  readonly nextSortOrder?: number;
  readonly stage: "failed" | "intake_started" | "linking_image" | "storing_image";
}): {
  readonly error?: ReturnType<typeof errorDetails>;
  readonly fileCount: number;
  readonly files: ReturnType<typeof captureFileSummaries>;
  readonly imageAssetCount: number;
  readonly nextSortOrder?: number;
  readonly stage: "failed" | "intake_started" | "linking_image" | "storing_image";
} {
  return {
    ...(error === undefined ? {} : { error }),
    fileCount: files.length,
    files: captureFileSummaries(files),
    imageAssetCount,
    ...(nextSortOrder === undefined ? {} : { nextSortOrder }),
    stage,
  };
}

export function captureDatabaseFromEnv(database: D1Database): BoozeDatabase {
  return createD1Client(database);
}
