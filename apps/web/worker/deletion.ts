import { errorDetails, logError, logInfo } from "./observability.ts";

const deletionBatchSize = 1_000;
const maximumDeletionBatchesPerDrain = 10;

export async function deleteBottleCaptureData({
  captureId,
  database,
}: {
  readonly captureId: string;
  readonly database: D1Database;
}): Promise<void> {
  await database.batch([
    database
      .prepare(
        `INSERT INTO r2_object_deletion_queue (r2_key, source_kind, source_id)
         SELECT image_assets.r2_key, 'image_asset', image_assets.id
         FROM image_assets
         INNER JOIN bottle_capture_images
           ON bottle_capture_images.image_asset_id = image_assets.id
         WHERE bottle_capture_images.capture_id = ?
           AND NOT EXISTS (
             SELECT 1
             FROM bottle_capture_images AS other_capture_image
             WHERE other_capture_image.image_asset_id = image_assets.id
               AND other_capture_image.capture_id <> ?
           )
         ON CONFLICT (r2_key) DO NOTHING`,
      )
      .bind(captureId, captureId),
    database
      .prepare(
        `INSERT INTO r2_object_deletion_queue (r2_key, source_kind, source_id)
         SELECT image_assets.thumbnail_r2_key, 'image_asset', image_assets.id
         FROM image_assets
         INNER JOIN bottle_capture_images
           ON bottle_capture_images.image_asset_id = image_assets.id
         WHERE bottle_capture_images.capture_id = ?
           AND image_assets.thumbnail_r2_key IS NOT NULL
           AND NOT EXISTS (
             SELECT 1
             FROM bottle_capture_images AS other_capture_image
             WHERE other_capture_image.image_asset_id = image_assets.id
               AND other_capture_image.capture_id <> ?
           )
         ON CONFLICT (r2_key) DO NOTHING`,
      )
      .bind(captureId, captureId),
    database
      .prepare(
        `INSERT INTO r2_object_deletion_queue (r2_key, source_kind, source_id)
         SELECT extraction_r2_key, 'capture_run', id
         FROM bottle_capture_runs
         WHERE capture_id = ? AND extraction_r2_key IS NOT NULL
         ON CONFLICT (r2_key) DO NOTHING`,
      )
      .bind(captureId),
    database
      .prepare(
        `INSERT INTO r2_object_deletion_queue (r2_key, source_kind, source_id)
         SELECT error_detail_r2_key, 'capture_run', id
         FROM bottle_capture_runs
         WHERE capture_id = ? AND error_detail_r2_key IS NOT NULL
         ON CONFLICT (r2_key) DO NOTHING`,
      )
      .bind(captureId),
    database
      .prepare(
        `DELETE FROM label_extractions
         WHERE capture_id = ?
            OR capture_run_id IN (
              SELECT id FROM bottle_capture_runs WHERE capture_id = ?
            )`,
      )
      .bind(captureId, captureId),
    database.prepare("DELETE FROM bottle_capture_images WHERE capture_id = ?").bind(captureId),
    database.prepare("DELETE FROM bottle_capture_runs WHERE capture_id = ?").bind(captureId),
    database.prepare("DELETE FROM bottle_captures WHERE id = ?").bind(captureId),
    database.prepare(
      `DELETE FROM image_assets
       WHERE id IN (
         SELECT source_id
         FROM r2_object_deletion_queue
         WHERE source_kind = 'image_asset'
       )
       AND NOT EXISTS (
         SELECT 1
         FROM bottle_capture_images
         WHERE bottle_capture_images.image_asset_id = image_assets.id
       )`,
    ),
  ]);
}

export async function deleteSiteData({
  database,
  siteId,
}: {
  readonly database: D1Database;
  readonly siteId: string;
}): Promise<void> {
  await database.batch([
    database
      .prepare(
        `INSERT INTO r2_object_deletion_queue (r2_key, source_kind, source_id)
         SELECT r2_key, 'image_asset', id
         FROM image_assets
         WHERE site_id = ?
         ON CONFLICT (r2_key) DO NOTHING`,
      )
      .bind(siteId),
    database
      .prepare(
        `INSERT INTO r2_object_deletion_queue (r2_key, source_kind, source_id)
         SELECT thumbnail_r2_key, 'image_asset', id
         FROM image_assets
         WHERE site_id = ? AND thumbnail_r2_key IS NOT NULL
         ON CONFLICT (r2_key) DO NOTHING`,
      )
      .bind(siteId),
    database
      .prepare(
        `INSERT INTO r2_object_deletion_queue (r2_key, source_kind, source_id)
         SELECT bottle_capture_runs.extraction_r2_key, 'capture_run', bottle_capture_runs.id
         FROM bottle_capture_runs
         INNER JOIN bottle_captures ON bottle_captures.id = bottle_capture_runs.capture_id
         WHERE bottle_captures.site_id = ?
           AND bottle_capture_runs.extraction_r2_key IS NOT NULL
         ON CONFLICT (r2_key) DO NOTHING`,
      )
      .bind(siteId),
    database
      .prepare(
        `INSERT INTO r2_object_deletion_queue (r2_key, source_kind, source_id)
         SELECT bottle_capture_runs.error_detail_r2_key, 'capture_run', bottle_capture_runs.id
         FROM bottle_capture_runs
         INNER JOIN bottle_captures ON bottle_captures.id = bottle_capture_runs.capture_id
         WHERE bottle_captures.site_id = ?
           AND bottle_capture_runs.error_detail_r2_key IS NOT NULL
         ON CONFLICT (r2_key) DO NOTHING`,
      )
      .bind(siteId),
    database
      .prepare(
        `DELETE FROM label_extractions
         WHERE bottle_id IN (SELECT id FROM bottles WHERE site_id = ?)
            OR wine_vintage_id IN (SELECT id FROM wine_vintages WHERE site_id = ?)
            OR capture_id IN (SELECT id FROM bottle_captures WHERE site_id = ?)
            OR capture_run_id IN (
              SELECT bottle_capture_runs.id
              FROM bottle_capture_runs
              INNER JOIN bottle_captures ON bottle_captures.id = bottle_capture_runs.capture_id
              WHERE bottle_captures.site_id = ?
            )`,
      )
      .bind(siteId, siteId, siteId, siteId),
    database.prepare("DELETE FROM critic_reviews WHERE site_id = ?").bind(siteId),
    database.prepare("DELETE FROM wine_awards WHERE site_id = ?").bind(siteId),
    database
      .prepare(
        `DELETE FROM bottle_capture_images
         WHERE capture_id IN (SELECT id FROM bottle_captures WHERE site_id = ?)`,
      )
      .bind(siteId),
    database
      .prepare(
        `DELETE FROM bottle_capture_runs
         WHERE capture_id IN (SELECT id FROM bottle_captures WHERE site_id = ?)`,
      )
      .bind(siteId),
    database.prepare("DELETE FROM bottle_captures WHERE site_id = ?").bind(siteId),
    database.prepare("DELETE FROM image_assets WHERE site_id = ?").bind(siteId),
    database
      .prepare(
        `DELETE FROM bottle_locations
         WHERE bottle_id IN (SELECT id FROM bottles WHERE site_id = ?)`,
      )
      .bind(siteId),
    database.prepare("DELETE FROM bottles WHERE site_id = ?").bind(siteId),
    database.prepare("DELETE FROM wine_constituents WHERE site_id = ?").bind(siteId),
    database.prepare("DELETE FROM review_sources WHERE site_id = ?").bind(siteId),
    database.prepare("DELETE FROM wine_vintages WHERE site_id = ?").bind(siteId),
    database.prepare("DELETE FROM wineries WHERE site_id = ?").bind(siteId),
    database.prepare("DELETE FROM storage_locations WHERE site_id = ?").bind(siteId),
    database.prepare("DELETE FROM site_memberships WHERE site_id = ?").bind(siteId),
    database.prepare("DELETE FROM sites WHERE id = ?").bind(siteId),
  ]);
}

export async function drainR2ObjectDeletionQueue({
  bucket,
  database,
}: {
  readonly bucket: R2Bucket;
  readonly database: D1Database;
}): Promise<number> {
  let deletedObjectCount = 0;
  for (let batchNumber = 0; batchNumber < maximumDeletionBatchesPerDrain; batchNumber += 1) {
    const queued = await database
      .prepare(
        `SELECT r2_key
         FROM r2_object_deletion_queue
         ORDER BY attempts, created_at
         LIMIT ?`,
      )
      .bind(deletionBatchSize)
      .all<{ readonly r2_key: string }>();
    const keys = queued.results.map((row) => row.r2_key);
    if (keys.length === 0) {
      break;
    }

    try {
      await bucket.delete(keys);
    } catch (error) {
      const message = shortQueueError(error);
      try {
        await database.batch(
          keys.map((key) =>
            database
              .prepare(
                `UPDATE r2_object_deletion_queue
                 SET attempts = attempts + 1,
                     last_error = ?,
                     last_attempt_at = CURRENT_TIMESTAMP
                 WHERE r2_key = ?`,
              )
              .bind(message, key),
          ),
        );
      } catch (queueError) {
        logError("r2_deletion_queue_failure_record_failed", {
          error: errorDetails(queueError),
          objectCount: keys.length,
        });
      }
      throw error;
    }

    await database.batch(
      keys.map((key) =>
        database.prepare("DELETE FROM r2_object_deletion_queue WHERE r2_key = ?").bind(key),
      ),
    );
    deletedObjectCount += keys.length;
    if (keys.length < deletionBatchSize) {
      break;
    }
  }
  return deletedObjectCount;
}

export async function tryDrainR2ObjectDeletionQueue({
  bucket,
  database,
}: {
  readonly bucket: R2Bucket;
  readonly database: D1Database;
}): Promise<void> {
  try {
    const deletedObjectCount = await drainR2ObjectDeletionQueue({ bucket, database });
    if (deletedObjectCount > 0) {
      logInfo("r2_deletion_queue_drained", { deletedObjectCount });
    }
  } catch (error) {
    logError("r2_deletion_queue_drain_failed", { error: errorDetails(error) });
  }
}

function shortQueueError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.length <= 1_000 ? message : `${message.slice(0, 997)}...`;
}
