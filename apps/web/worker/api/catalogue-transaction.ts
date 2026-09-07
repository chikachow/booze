import { HTTPException } from "hono/http-exception";

const catalogueUniqueConstraints = new Set([
  "wineries.site_id, wineries.name, wineries.region",
  "wine_vintages.site_id, wine_vintages.winery_id, wine_vintages.base_name, wine_vintages.vintage_label",
  "grape_varieties.name",
  "review_sources.site_id, review_sources.name",
  "wine_awards.site_id, wine_awards.wine_vintage_id, wine_awards.award_name, wine_awards.award_level, wine_awards.award_year",
]);

export class CatalogueConflictError extends HTTPException {
  public constructor(cause: unknown) {
    super(409, {
      cause,
      message: "The catalogue changed while saving. Retry the operation.",
    });
  }
}

export async function retryCatalogueTransaction<Result>(
  prepareAndCommit: () => Promise<Result>,
): Promise<Result> {
  // A natural-key conflict proves the batch rolled back. Re-read the winning
  // IDs and rebuild every dependent statement; never replay an uncertain write.
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await prepareAndCommit();
    } catch (error) {
      if (!isCatalogueUniqueConflict(error)) throw error;
      if (attempt === 1) throw new CatalogueConflictError(error);
    }
  }
}

function isCatalogueUniqueConflict(error: unknown): boolean {
  const seen = new Set<Error>();
  let cause = error;
  while (cause instanceof Error && !seen.has(cause)) {
    seen.add(cause);
    const match =
      /^(?:D1_ERROR: )?UNIQUE constraint failed: ([a-z_., ]+)(?:: SQLITE_CONSTRAINT)?$/u.exec(
        cause.message,
      );
    if (match?.[1] !== undefined && catalogueUniqueConstraints.has(match[1])) return true;
    cause = cause.cause;
  }
  return false;
}
