// oxlint-disable eslint/no-use-before-define
import {
  criticReviews,
  reviewSources,
  siteMemberships,
  sites,
  wineVintages,
  type BoozeDatabase,
} from "@chikachow/booze-db";
import { and, asc, eq, isNull, notInArray, or, sql } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";

import { requireSitePermission } from "./auth.ts";
import { generatedId, optionalText, stableId } from "./ids.ts";

export type ReviewSourceInput = {
  readonly siteId: string;
  readonly name: string;
  readonly sourceType?: string | undefined;
  readonly url?: string | undefined;
  readonly notes?: string | undefined;
  readonly isActive?: boolean | undefined;
};

export type CriticReviewInput = {
  readonly id?: string | undefined;
  readonly reviewSourceId?: string | undefined;
  readonly reviewSourceName?: string | undefined;
  readonly ratingText: string;
  readonly ratingValue?: number | undefined;
  readonly ratingScale?: string | undefined;
  readonly sourceUrl?: string | undefined;
  readonly reviewedAt?: string | undefined;
  readonly provenance?: string | undefined;
  readonly notes?: string | undefined;
};

export type ReviewSourceResource = {
  readonly id: string;
  readonly siteId: string | null;
  readonly siteName: string | null;
  readonly name: string;
  readonly sourceType: string;
  readonly url: string | null;
  readonly notes: string | null;
  readonly isActive: boolean;
};

export type CriticReviewResource = {
  readonly id: string;
  readonly siteId: string;
  readonly wineVintageId: string;
  readonly reviewSourceId: string;
  readonly reviewSourceName: string;
  readonly ratingText: string;
  readonly ratingValue: number | null;
  readonly ratingScale: string | null;
  readonly sourceUrl: string | null;
  readonly reviewedAt: string | null;
  readonly provenance: string | null;
  readonly notes: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
};

export async function listReviewSources({
  database,
  siteId,
  userId,
}: {
  readonly database: BoozeDatabase;
  readonly siteId?: string | undefined;
  readonly userId: string;
}): Promise<readonly ReviewSourceResource[]> {
  const rows = await database
    .select({
      id: reviewSources.id,
      siteId: reviewSources.siteId,
      siteName: sites.name,
      name: reviewSources.name,
      sourceType: reviewSources.sourceType,
      url: reviewSources.url,
      notes: reviewSources.notes,
      isActive: reviewSources.isActive,
    })
    .from(reviewSources)
    .leftJoin(sites, eq(reviewSources.siteId, sites.id))
    .leftJoin(siteMemberships, eq(reviewSources.siteId, siteMemberships.siteId))
    .where(
      and(
        or(isNull(reviewSources.siteId), eq(siteMemberships.userId, userId)),
        siteId === undefined
          ? undefined
          : or(isNull(reviewSources.siteId), eq(reviewSources.siteId, siteId)),
      ),
    )
    .orderBy(asc(reviewSources.name));

  return rows;
}

export async function createOrUpdateReviewSource({
  database,
  input,
  userId,
}: {
  readonly database: BoozeDatabase;
  readonly input: ReviewSourceInput;
  readonly userId: string;
}): Promise<ReviewSourceResource> {
  await requireSitePermission({
    database,
    permission: "site.content.write",
    siteId: input.siteId,
    userId,
  });

  const name = input.name.trim();
  const reviewSourceId = stableId("review-source", `${input.siteId}:${name}`);

  await database
    .insert(reviewSources)
    .values({
      id: reviewSourceId,
      siteId: input.siteId,
      name,
      sourceType: optionalText(input.sourceType) ?? "critic",
      url: optionalText(input.url),
      notes: optionalText(input.notes),
      isActive: input.isActive ?? true,
    })
    .onConflictDoUpdate({
      target: [reviewSources.siteId, reviewSources.name],
      set: {
        sourceType: optionalText(input.sourceType) ?? "critic",
        url: optionalText(input.url),
        notes: optionalText(input.notes),
        isActive: input.isActive ?? true,
        updatedAt: sql`CURRENT_TIMESTAMP`,
      },
    });

  const rows = await listReviewSources({ database, siteId: input.siteId, userId });
  const source = rows.find((candidate) => candidate.id === reviewSourceId);
  if (source === undefined) {
    throw new Error("Review source upsert did not return a row");
  }
  return source;
}

export async function listCriticReviews({
  database,
  wineVintageId,
  userId,
}: {
  readonly database: BoozeDatabase;
  readonly wineVintageId?: string | undefined;
  readonly userId: string;
}): Promise<readonly CriticReviewResource[]> {
  const rows = await database
    .select(criticReviewColumns())
    .from(criticReviews)
    .innerJoin(siteMemberships, eq(criticReviews.siteId, siteMemberships.siteId))
    .innerJoin(reviewSources, eq(criticReviews.reviewSourceId, reviewSources.id))
    .where(
      and(
        eq(siteMemberships.userId, userId),
        wineVintageId === undefined ? undefined : eq(criticReviews.wineVintageId, wineVintageId),
      ),
    )
    .orderBy(asc(reviewSources.name), asc(criticReviews.ratingText));

  return rows.map((row) => criticReviewFromRow(row));
}

export async function replaceCriticReviewsForWine({
  database,
  reviews,
  siteId,
  userId,
  wineVintageId,
}: {
  readonly database: BoozeDatabase;
  readonly reviews: readonly CriticReviewInput[];
  readonly siteId: string;
  readonly userId: string;
  readonly wineVintageId: string;
}): Promise<readonly CriticReviewResource[]> {
  await requireSitePermission({
    database,
    permission: "site.content.write",
    siteId,
    userId,
  });
  await assertWineVintageInSite({ database, siteId, wineVintageId });

  const keptReviewIds: string[] = [];
  for (const review of reviews) {
    const reviewSourceId = await resolveOrCreateReviewSource({
      database,
      review,
      siteId,
      userId,
    });
    const existingRows = await database
      .select({ id: criticReviews.id })
      .from(criticReviews)
      .where(
        and(
          eq(criticReviews.siteId, siteId),
          eq(criticReviews.wineVintageId, wineVintageId),
          eq(criticReviews.reviewSourceId, reviewSourceId),
        ),
      )
      .limit(1);
    const reviewId = existingRows[0]?.id ?? review.id ?? generatedId("critic-review");
    keptReviewIds.push(reviewId);

    await database
      .insert(criticReviews)
      .values({
        id: reviewId,
        siteId,
        wineVintageId,
        reviewSourceId,
        ratingText: review.ratingText.trim(),
        ratingValue: review.ratingValue ?? null,
        ratingScale: optionalText(review.ratingScale),
        sourceUrl: optionalText(review.sourceUrl),
        reviewedAt: optionalText(review.reviewedAt),
        provenance: optionalText(review.provenance),
        notes: optionalText(review.notes),
        createdByUserId: userId,
      })
      .onConflictDoUpdate({
        target: [criticReviews.siteId, criticReviews.wineVintageId, criticReviews.reviewSourceId],
        set: {
          ratingText: review.ratingText.trim(),
          ratingValue: review.ratingValue ?? null,
          ratingScale: optionalText(review.ratingScale),
          sourceUrl: optionalText(review.sourceUrl),
          reviewedAt: optionalText(review.reviewedAt),
          provenance: optionalText(review.provenance),
          notes: optionalText(review.notes),
          updatedAt: sql`CURRENT_TIMESTAMP`,
        },
      });
  }

  if (keptReviewIds.length === 0) {
    await database
      .delete(criticReviews)
      .where(and(eq(criticReviews.siteId, siteId), eq(criticReviews.wineVintageId, wineVintageId)));
  } else {
    await database
      .delete(criticReviews)
      .where(
        and(
          eq(criticReviews.siteId, siteId),
          eq(criticReviews.wineVintageId, wineVintageId),
          notInArray(criticReviews.id, keptReviewIds),
        ),
      );
  }

  return listCriticReviews({ database, userId, wineVintageId });
}

export async function upsertCriticReview({
  database,
  review,
  userId,
  wineVintageId,
}: {
  readonly database: BoozeDatabase;
  readonly review: CriticReviewInput;
  readonly userId: string;
  readonly wineVintageId: string;
}): Promise<CriticReviewResource> {
  const wine = await authorisedWineVintage({ database, userId, wineVintageId });
  const reviews = await replaceCriticReviewsForWine({
    database,
    reviews: [review, ...(await reviewsExceptSource({ database, review, userId, wineVintageId }))],
    siteId: wine.siteId,
    userId,
    wineVintageId,
  });
  const result = reviews.find(
    (candidate) =>
      candidate.id === review.id ||
      candidate.reviewSourceId === review.reviewSourceId ||
      candidate.reviewSourceName === review.reviewSourceName,
  );
  if (result === undefined) {
    throw new Error("Critic review upsert did not return a row");
  }
  return result;
}

export async function deleteCriticReview({
  database,
  reviewId,
  userId,
}: {
  readonly database: BoozeDatabase;
  readonly reviewId: string;
  readonly userId: string;
}): Promise<CriticReviewResource> {
  const rows = await database
    .select(criticReviewColumns())
    .from(criticReviews)
    .innerJoin(siteMemberships, eq(criticReviews.siteId, siteMemberships.siteId))
    .innerJoin(reviewSources, eq(criticReviews.reviewSourceId, reviewSources.id))
    .where(and(eq(criticReviews.id, reviewId), eq(siteMemberships.userId, userId)))
    .limit(1);
  const review = rows[0] === undefined ? undefined : criticReviewFromRow(rows[0]);
  if (review === undefined) {
    throw new HTTPException(404, { message: "Critic review not found" });
  }
  await requireSitePermission({
    database,
    permission: "site.content.write",
    siteId: review.siteId,
    userId,
  });

  await database.delete(criticReviews).where(eq(criticReviews.id, reviewId));
  return review;
}

async function resolveOrCreateReviewSource({
  database,
  review,
  siteId,
  userId,
}: {
  readonly database: BoozeDatabase;
  readonly review: CriticReviewInput;
  readonly siteId: string;
  readonly userId: string;
}): Promise<string> {
  if (review.reviewSourceId !== undefined) {
    await assertReviewSourceUsableForSite({
      database,
      reviewSourceId: review.reviewSourceId,
      siteId,
      userId,
    });
    return review.reviewSourceId;
  }

  if (review.reviewSourceName === undefined || review.reviewSourceName.trim() === "") {
    throw new HTTPException(400, { message: "Review source is required" });
  }

  const source = await createOrUpdateReviewSource({
    database,
    input: {
      siteId,
      name: review.reviewSourceName,
      sourceType: "critic",
      isActive: true,
    },
    userId,
  });
  return source.id;
}

async function assertReviewSourceUsableForSite({
  database,
  reviewSourceId,
  siteId,
  userId,
}: {
  readonly database: BoozeDatabase;
  readonly reviewSourceId: string;
  readonly siteId: string;
  readonly userId: string;
}): Promise<void> {
  const rows = await listReviewSources({ database, siteId, userId });
  const source = rows.find((candidate) => candidate.id === reviewSourceId);
  if (source === undefined || !source.isActive) {
    throw new HTTPException(400, { message: "Review source is not available for this site" });
  }
}

async function assertWineVintageInSite({
  database,
  siteId,
  wineVintageId,
}: {
  readonly database: BoozeDatabase;
  readonly siteId: string;
  readonly wineVintageId: string;
}): Promise<void> {
  const rows = await database
    .select({ id: wineVintages.id })
    .from(wineVintages)
    .where(and(eq(wineVintages.siteId, siteId), eq(wineVintages.id, wineVintageId)))
    .limit(1);
  if (rows[0] === undefined) {
    throw new HTTPException(404, { message: "Wine vintage not found" });
  }
}

async function authorisedWineVintage({
  database,
  userId,
  wineVintageId,
}: {
  readonly database: BoozeDatabase;
  readonly userId: string;
  readonly wineVintageId: string;
}): Promise<{ readonly siteId: string }> {
  const rows = await database
    .select({ siteId: wineVintages.siteId })
    .from(wineVintages)
    .innerJoin(siteMemberships, eq(wineVintages.siteId, siteMemberships.siteId))
    .where(and(eq(wineVintages.id, wineVintageId), eq(siteMemberships.userId, userId)))
    .limit(1);
  const row = rows[0];
  if (row === undefined) {
    throw new HTTPException(404, { message: "Wine vintage not found" });
  }
  return row;
}

async function reviewsExceptSource({
  database,
  review,
  userId,
  wineVintageId,
}: {
  readonly database: BoozeDatabase;
  readonly review: CriticReviewInput;
  readonly userId: string;
  readonly wineVintageId: string;
}): Promise<readonly CriticReviewInput[]> {
  const reviews = await listCriticReviews({ database, userId, wineVintageId });
  return reviews
    .filter(
      (candidate) =>
        candidate.id !== review.id &&
        candidate.reviewSourceId !== review.reviewSourceId &&
        candidate.reviewSourceName !== review.reviewSourceName,
    )
    .map((candidate) => ({
      id: candidate.id,
      reviewSourceId: candidate.reviewSourceId,
      ratingText: candidate.ratingText,
      ratingValue: candidate.ratingValue ?? undefined,
      ratingScale: candidate.ratingScale ?? undefined,
      sourceUrl: candidate.sourceUrl ?? undefined,
      reviewedAt: candidate.reviewedAt ?? undefined,
      provenance: candidate.provenance ?? undefined,
      notes: candidate.notes ?? undefined,
    }));
}

function criticReviewColumns() {
  return {
    id: criticReviews.id,
    siteId: criticReviews.siteId,
    wineVintageId: criticReviews.wineVintageId,
    reviewSourceId: criticReviews.reviewSourceId,
    reviewSourceName: reviewSources.name,
    ratingText: criticReviews.ratingText,
    ratingValue: criticReviews.ratingValue,
    ratingScale: criticReviews.ratingScale,
    sourceUrl: criticReviews.sourceUrl,
    reviewedAt: criticReviews.reviewedAt,
    provenance: criticReviews.provenance,
    notes: criticReviews.notes,
    createdAt: criticReviews.createdAt,
    updatedAt: criticReviews.updatedAt,
  };
}

function criticReviewFromRow(row: CriticReviewResource): CriticReviewResource {
  return row;
}
