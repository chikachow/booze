// oxlint-disable import/max-dependencies -- Capture route composes storage, workflow, OCR, import, and authorization boundaries.
import { createD1Client, storageLocations } from "@chikachow/booze-db";
import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { validateBottleQuantity } from "../../shared/quantity.ts";
import { z } from "zod";

import { requireAuthenticatedUser, requireSitePermission, upsertSite } from "../api/auth.ts";
import { upsertStorageLocation } from "../api/catalogue.ts";
import { created, noContent } from "../api/http.ts";
import { optionalText } from "../api/ids.ts";
import type { Bindings } from "../api/types.ts";
import { putCaptureRunArtifact, type CaptureRunArtifact } from "../capture-artifacts.ts";
import { importReviewedCapture } from "../bottle-importer.ts";
import type { ImportCandidate } from "../bottle-extractor.ts";
import { canImportCapture, canRetryCapture } from "../capture-state.ts";
import {
  createBottleCapture,
  claimCaptureForImport,
  getBottleCapture,
  getCaptureImageObject,
  listBottleCaptures,
  setCaptureWorkflowInstance,
  updateCaptureRun,
  updateCaptureStatus,
} from "../capture-store.ts";
import { deleteBottleCaptureData, tryDrainR2ObjectDeletionQueue } from "../deletion.ts";
import { errorDetails, logError } from "../observability.ts";

const importCandidateSchema = z.object({
  wine: z.object({
    wineryName: z.string(),
    brandName: z.string().optional(),
    baseName: z.string().optional(),
    designation: z.string(),
    displayName: z.string().optional(),
    vintageYear: z.number().optional(),
    grapeVarieties: z.array(z.string()).optional(),
    country: z.string().optional(),
    region: z.string().optional(),
    appellation: z.string().optional(),
    classification: z.string().optional(),
    wineType: z.string().optional(),
    wineColor: z.string().optional(),
    addressQualification: z.string().optional(),
    alcoholPercent: z.number().optional(),
    drinkFromYear: z.number().optional(),
    drinkToYear: z.number().optional(),
    description: z.string().optional(),
    drinkingAdvice: z.string().optional(),
    labelText: z.string().optional(),
    sourceUrl: z.string().optional(),
    notes: z.string().optional(),
  }),
  bottle: z.object({
    bottleNumber: z.string().optional(),
    volumeMl: z.number().optional(),
    barcode: z.string().optional(),
    lotCode: z.string().optional(),
    notes: z.string().optional(),
  }),
  rawSuggestion: z.record(z.string(), z.unknown()),
});

const manualImportSchema = z.object({
  wineVintageId: z.string().trim().min(1).optional(),
});

export const bottleCaptureRoutes = new Hono<{ Bindings: Bindings }>()
  .get("/bottle-captures", async (context) => {
    const database = createD1Client(context.env.DB);
    const authenticatedUser = await requireAuthenticatedUser({
      database,
      request: context.req.raw,
      headers: context.req.raw.headers,
      secretKey: context.env.CLERK_SECRET_KEY,
    });
    return context.json({
      data: await listBottleCaptures({ database, userId: authenticatedUser.userId }),
    });
  })
  .post("/bottle-captures", async (context) => {
    const contentType = context.req.header("content-type") ?? "";
    if (!contentType.toLowerCase().includes("multipart/form-data")) {
      throw new HTTPException(415, { message: "Use multipart/form-data for capture images" });
    }

    const formData = await context.req.formData();
    const database = createD1Client(context.env.DB);
    const authenticatedUser = await requireAuthenticatedUser({
      database,
      request: context.req.raw,
      headers: context.req.raw.headers,
      secretKey: context.env.CLERK_SECRET_KEY,
    });
    const siteId = await siteIdFromForm({ database, formData, userId: authenticatedUser.userId });
    await requireSitePermission({
      database,
      permission: "site.content.write",
      siteId,
      userId: authenticatedUser.userId,
    });
    const storageLocationId = await storageLocationIdFromForm({ database, formData, siteId });
    const files = formData.getAll("images").filter((entry) => entry instanceof File);

    const capture = await createBottleCapture({
      bucket: context.env.IMAGE_BUCKET,
      database,
      files,
      images: context.env.IMAGES,
      positionHint: optionalText(stringField(formData, "positionHint")),
      quantity: parseCaptureQuantity(stringField(formData, "quantity")),
      siteId,
      storageLocationId,
      userId: authenticatedUser.userId,
    });
    if (capture.status === "upload_failed") {
      return created({
        captureId: capture.captureId,
        errorMessage: capture.errorMessage,
        workflowInstanceId: null,
      });
    }
    try {
      const instance = await context.env.BOTTLE_CAPTURE_WORKFLOW.create({
        id: capture.captureId,
        params: { captureId: capture.captureId },
      });
      await setCaptureWorkflowInstance({
        captureId: capture.captureId,
        database,
        workflowInstanceId: instance.id,
      });

      return created({ captureId: capture.captureId, workflowInstanceId: instance.id });
    } catch (error) {
      const details = errorDetails(error);
      logError("bottle_capture_workflow_start_failed", {
        captureId: capture.captureId,
        error: details,
        fileCount: files.length,
        siteId,
        storageLocationId,
      });
      await updateCaptureStatus({
        captureId: capture.captureId,
        database,
        status: "failed",
        errorMessage: "Capture was saved, but extraction did not start. Retry the capture.",
        errorDetail: details,
      });
      return created({ captureId: capture.captureId, workflowInstanceId: null });
    }
  })
  .get("/bottle-captures/:captureId", async (context) => {
    const database = createD1Client(context.env.DB);
    const authenticatedUser = await requireAuthenticatedUser({
      database,
      request: context.req.raw,
      headers: context.req.raw.headers,
      secretKey: context.env.CLERK_SECRET_KEY,
    });
    return context.json({
      data: await getBottleCapture({
        captureId: context.req.param("captureId"),
        database,
        userId: authenticatedUser.userId,
      }),
    });
  })
  .get("/bottle-captures/:captureId/images/:imageAssetId", async (context) => {
    const database = createD1Client(context.env.DB);
    const authenticatedUser = await requireAuthenticatedUser({
      database,
      request: context.req.raw,
      headers: context.req.raw.headers,
      secretKey: context.env.CLERK_SECRET_KEY,
    });
    const image = await getCaptureImageObject({
      captureId: context.req.param("captureId"),
      database,
      imageAssetId: context.req.param("imageAssetId"),
      userId: authenticatedUser.userId,
    });
    const object = await context.env.IMAGE_BUCKET.get(image.r2Key);
    if (object === null) {
      throw new HTTPException(404, { message: "Capture image object not found" });
    }
    return new Response(object.body, { headers: { "content-type": image.contentType } });
  })
  .post("/bottle-captures/:captureId/retry", async (context) => {
    const database = createD1Client(context.env.DB);
    const authenticatedUser = await requireAuthenticatedUser({
      database,
      request: context.req.raw,
      headers: context.req.raw.headers,
      secretKey: context.env.CLERK_SECRET_KEY,
    });
    const capture = await getBottleCapture({
      captureId: context.req.param("captureId"),
      database,
      userId: authenticatedUser.userId,
    });
    await requireSitePermission({
      database,
      permission: "site.content.write",
      siteId: capture.siteId,
      userId: authenticatedUser.userId,
    });
    if (!canRetryCapture(capture.status)) {
      throw new HTTPException(409, { message: "Capture is not retryable" });
    }
    await updateCaptureStatus({
      captureId: capture.id,
      database,
      status: "queued",
      errorMessage: null,
      errorDetail: null,
    });
    const instance = await context.env.BOTTLE_CAPTURE_WORKFLOW.create({
      id: `${capture.id}-${crypto.randomUUID()}`,
      params: { captureId: capture.id },
    });
    await setCaptureWorkflowInstance({
      captureId: capture.id,
      database,
      workflowInstanceId: instance.id,
    });
    return context.json({ data: { captureId: capture.id, workflowInstanceId: instance.id } });
  })
  .post("/bottle-captures/:captureId/import", async (context) => {
    const payload = manualImportSchema.parse(await context.req.json());
    const database = createD1Client(context.env.DB);
    const authenticatedUser = await requireAuthenticatedUser({
      database,
      request: context.req.raw,
      headers: context.req.raw.headers,
      secretKey: context.env.CLERK_SECRET_KEY,
    });
    const capture = await getBottleCapture({
      captureId: context.req.param("captureId"),
      database,
      userId: authenticatedUser.userId,
    });
    await requireSitePermission({
      database,
      permission: "site.content.write",
      siteId: capture.siteId,
      userId: authenticatedUser.userId,
    });
    if (!canImportCapture(capture.status)) {
      throw new HTTPException(409, { message: "Capture is not ready for manual import" });
    }
    if (capture.latestRun === null) {
      throw new HTTPException(409, { message: "Capture has no extraction run" });
    }
    const candidate = importCandidateSchema.parse(capture.latestRun.importCandidate);
    if (
      payload.wineVintageId === undefined &&
      (candidate.wine.wineryName.trim() === "" || candidate.wine.designation.trim() === "")
    ) {
      throw new HTTPException(400, {
        message: "Select an existing wine before importing an incomplete OCR candidate",
      });
    }
    if (!(await claimCaptureForImport({ captureId: capture.id, database }))) {
      throw new HTTPException(409, {
        message: "Capture import is already in progress or complete",
      });
    }
    try {
      const imported = await importReviewedCapture({
        candidate: candidate satisfies ImportCandidate,
        captureId: capture.id,
        database,
        quantity: capture.quantity,
        siteId: capture.siteId,
        storageLocationId: capture.storageLocationId,
        positionHint: capture.positionHint,
        wineVintageId: payload.wineVintageId,
      });
      await updateCaptureRun({
        database,
        runId: capture.latestRun.id,
        status: "imported",
        importResult: imported,
        matchResult: imported.matchResult,
      });
      await updateCaptureStatus({
        captureId: capture.id,
        database,
        status: "imported",
        errorMessage: null,
        errorDetail: null,
        importedBottleIds: imported.bottleIds,
      });
      return context.json({ data: imported });
    } catch (error) {
      const message = shortErrorMessage(error);
      const details = errorDetails(error);
      const errorDetailArtifact = await tryPutErrorArtifact({
        bucket: context.env.IMAGE_BUCKET,
        captureId: capture.id,
        details,
        runId: capture.latestRun.id,
        siteId: capture.siteId,
      });
      await updateCaptureRun({
        database,
        runId: capture.latestRun.id,
        status: "failed",
        errorMessage: message,
        ...(errorDetailArtifact === null ? {} : { errorDetailArtifact }),
      });
      await updateCaptureStatus({
        captureId: capture.id,
        database,
        status: "failed",
        errorMessage: message,
        errorDetail: null,
      });
      throw error;
    }
  })
  .delete("/bottle-captures/:captureId", async (context) => {
    const database = createD1Client(context.env.DB);
    const authenticatedUser = await requireAuthenticatedUser({
      database,
      request: context.req.raw,
      headers: context.req.raw.headers,
      secretKey: context.env.CLERK_SECRET_KEY,
    });
    const capture = await getBottleCapture({
      captureId: context.req.param("captureId"),
      database,
      userId: authenticatedUser.userId,
    });
    await requireSitePermission({
      database,
      permission: "site.content.write",
      siteId: capture.siteId,
      userId: authenticatedUser.userId,
    });
    if (["queued", "extracting", "importing"].includes(capture.status)) {
      throw new HTTPException(409, {
        message: "Wait for capture processing to finish before deleting it",
      });
    }

    await deleteBottleCaptureData({
      captureId: capture.id,
      database: context.env.DB,
    });
    await tryDrainR2ObjectDeletionQueue({
      bucket: context.env.IMAGE_BUCKET,
      database: context.env.DB,
    });
    return noContent();
  });

function shortErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const firstLine = message.split("\n", 1)[0]?.trim() ?? "";
  const preview = firstLine === "" ? "Capture import failed" : firstLine;
  return preview.length <= 300 ? preview : `${preview.slice(0, 297)}...`;
}

async function tryPutErrorArtifact({
  bucket,
  captureId,
  details,
  runId,
  siteId,
}: {
  readonly bucket: R2Bucket;
  readonly captureId: string;
  readonly details: unknown;
  readonly runId: string;
  readonly siteId: string;
}): Promise<CaptureRunArtifact | null> {
  try {
    return await putCaptureRunArtifact({
      bucket,
      captureId,
      kind: "error",
      runId,
      siteId,
      value: { captureId, errorDetail: details, runId },
    });
  } catch (artifactError) {
    logError("capture_import_error_artifact_write_failed", {
      captureId,
      error: errorDetails(artifactError),
      runId,
      siteId,
    });
    return null;
  }
}

async function siteIdFromForm({
  database,
  formData,
  userId,
}: {
  readonly database: ReturnType<typeof createD1Client>;
  readonly formData: FormData;
  readonly userId: string;
}): Promise<string> {
  const explicitSiteId = optionalText(stringField(formData, "siteId"));
  if (explicitSiteId !== null) {
    return explicitSiteId;
  }
  return (
    await upsertSite({
      database,
      site: stringField(formData, "siteName") ?? "home",
      userId,
    })
  ).siteId;
}

async function storageLocationIdFromForm({
  database,
  formData,
  siteId,
}: {
  readonly database: ReturnType<typeof createD1Client>;
  readonly formData: FormData;
  readonly siteId: string;
}): Promise<string | null> {
  const explicitStorageLocationId = optionalText(stringField(formData, "storageLocationId"));
  if (explicitStorageLocationId !== null) {
    await assertStorageLocationInSite({
      database,
      siteId,
      storageLocationId: explicitStorageLocationId,
    });
    return explicitStorageLocationId;
  }
  const name = optionalText(stringField(formData, "storageLocationName"));
  if (name === null) {
    return null;
  }
  return (await upsertStorageLocation({ database, siteId, name })).storageLocationId;
}

async function assertStorageLocationInSite({
  database,
  siteId,
  storageLocationId,
}: {
  readonly database: ReturnType<typeof createD1Client>;
  readonly siteId: string;
  readonly storageLocationId: string;
}): Promise<void> {
  const rows = await database
    .select({ id: storageLocations.id })
    .from(storageLocations)
    .where(and(eq(storageLocations.siteId, siteId), eq(storageLocations.id, storageLocationId)))
    .limit(1);
  if (rows[0] === undefined) {
    throw new HTTPException(400, { message: "Storage location does not belong to site" });
  }
}

function stringField(formData: FormData, name: string): string | undefined {
  const value = formData.get(name);
  return typeof value === "string" ? value : undefined;
}

export function parseCaptureQuantity(value: string | undefined): number {
  const result = validateBottleQuantity(value);
  if (!result.ok) {
    throw new HTTPException(400, { message: result.message });
  }
  return result.value;
}
