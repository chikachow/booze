// oxlint-disable import/max-dependencies -- Tool registrar composes review persistence, authorization, audit, and schemas.
import { criticReviews, sites, type createD1Client } from "@chikachow/booze-db";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";

import { requireSitePermission } from "../api/auth.ts";
import {
  createCriticReviewUpsert,
  createOrUpdateReviewSource,
  createReviewSourceUpsert,
  deleteCriticReview,
  listCriticReviews,
  listReviewSources,
  reviewSourceIdForInput,
  upsertCriticReview,
  type CriticReviewResource,
  type ReviewSourceResource,
} from "../api/critic-reviews.ts";
import { generatedId, optionalText } from "../api/ids.ts";
import { createMcpToolAuditEventInsert } from "./audit.ts";
import { getWineVintageSummary, resolveWineVintageId } from "./catalogue.ts";
import { mcpEntityId } from "./ids.ts";
import {
  decodePageCursor,
  pageFromRows,
  rowsAfterCursor,
  toolJson,
  type Page,
} from "./pagination.ts";
import {
  createReviewSourceInputSchema,
  createReviewSourceOutputSchema,
  criticReviewSummarySchema,
  deleteCriticReviewInputSchema,
  deleteCriticReviewOutputSchema,
  listCriticReviewsInputSchema,
  listReviewSourcesInputSchema,
  paginationOutputSchema,
  reviewSourceSummarySchema,
  upsertCriticReviewInputSchema,
  upsertCriticReviewOutputSchema,
} from "./schemas.ts";

const listReviewSourcesToolName = "cellar.list_review_sources";
const listCriticReviewsToolName = "cellar.list_critic_reviews";
const listReviewSourcesCursorSchema = z.strictObject({
  reviewSourceId: z.string(),
});
const listCriticReviewsCursorSchema = z.strictObject({
  reviewId: z.string(),
});

type ToolAnnotations = {
  readonly destructiveHint: boolean;
  readonly idempotentHint: boolean;
  readonly openWorldHint: boolean;
  readonly readOnlyHint: boolean;
};

export function registerCriticReviewTools({
  database,
  readOnlyToolAnnotations,
  server,
  userId,
  writeToolAnnotations,
}: {
  readonly database: ReturnType<typeof createD1Client>;
  readonly readOnlyToolAnnotations: ToolAnnotations;
  readonly server: McpServer;
  readonly userId: string;
  readonly writeToolAnnotations: ToolAnnotations;
}): void {
  server.registerTool(
    "cellar.list_review_sources",
    {
      annotations: readOnlyToolAnnotations,
      title: "List review sources",
      description: "List authorised critic review sources available for wine review facts.",
      inputSchema: listReviewSourcesInputSchema,
      outputSchema: {
        ...paginationOutputSchema,
        reviewSources: z.array(reviewSourceSummarySchema),
      },
    },
    async (input) => {
      const sources = await listReviewSourceSummaries({ database, input, userId });
      return toolJson({ reviewSources: sources.items, ...sources.metadata });
    },
  );

  server.registerTool(
    "cellar.create_review_source",
    {
      annotations: writeToolAnnotations,
      title: "Create review source",
      description: "Create or update one site-scoped critic review source.",
      inputSchema: createReviewSourceInputSchema,
      outputSchema: createReviewSourceOutputSchema.shape,
    },
    async (input) => {
      await requireSitePermission({
        database,
        permission: "site.content.write",
        siteId: input.siteId,
        userId,
      });
      const sourceInput = {
        isActive: input.isActive,
        name: input.name,
        notes: input.notes ?? undefined,
        siteId: input.siteId,
        sourceType: input.sourceType,
        url: input.url ?? undefined,
      };
      const persistedReviewSourceId = reviewSourceIdForInput(sourceInput);
      const reviewSourceId = mcpEntityId("review_source", persistedReviewSourceId);
      const site = await database
        .select({ name: sites.name })
        .from(sites)
        .where(eq(sites.id, input.siteId))
        .limit(1);
      const siteName = site[0]?.name;
      if (siteName === undefined) {
        throw new HTTPException(404, { message: "Site not found" });
      }
      const beforeSource = (
        await listReviewSources({ database, siteId: input.siteId, userId })
      ).find((source) => source.id === persistedReviewSourceId);
      const before = beforeSource === undefined ? {} : reviewSourceSummary(beforeSource);
      const afterAudit = {
        isActive: input.isActive,
        notes: optionalText(input.notes ?? undefined),
        reviewSource: input.name.trim(),
        reviewSourceId,
        site: siteName,
        siteId: input.siteId,
        sourceType: optionalText(input.sourceType) ?? "critic",
        url: optionalText(input.url ?? undefined),
      };
      const changed = JSON.stringify(before) !== JSON.stringify(afterAudit);
      const auditEventId = crypto.randomUUID();
      await database.batch([
        createReviewSourceUpsert({
          database,
          input: sourceInput,
          reviewSourceId: persistedReviewSourceId,
        }),
        createMcpToolAuditEventInsert({
          auditEventId,
          database,
          event: {
            affectedRecordCount: changed ? 1 : 0,
            after: afterAudit,
            before,
            input,
            siteId: input.siteId,
            targetKind: "review_source",
            targetMcpId: reviewSourceId,
            targetPersistedId: persistedReviewSourceId,
            toolName: "cellar.create_review_source",
            userId,
          },
        }),
      ]);
      const source = (await listReviewSources({ database, siteId: input.siteId, userId })).find(
        (candidate) => candidate.id === persistedReviewSourceId,
      );
      if (source === undefined) {
        throw new Error("Review source upsert did not return a row");
      }
      return toolJson({ changed, reviewSource: reviewSourceSummary(source) });
    },
  );

  server.registerTool(
    "cellar.list_critic_reviews",
    {
      annotations: readOnlyToolAnnotations,
      title: "List critic reviews",
      description: "List authorised critic review facts for wine vintages.",
      inputSchema: listCriticReviewsInputSchema,
      outputSchema: {
        criticReviews: z.array(criticReviewSummarySchema),
        ...paginationOutputSchema,
      },
    },
    async ({ wineId, ...input }) => {
      const wineVintageId =
        wineId === undefined ? undefined : await resolveWineVintageId({ database, userId, wineId });
      const reviews = await listCriticReviewSummaries({
        database,
        input: { wineId, ...input },
        userId,
        wineVintageId,
      });
      return toolJson({ criticReviews: reviews.items, ...reviews.metadata });
    },
  );

  server.registerTool(
    "cellar.upsert_critic_review",
    {
      annotations: writeToolAnnotations,
      title: "Upsert critic review",
      description: "Create or update one critic review fact for an authorised wine vintage.",
      inputSchema: upsertCriticReviewInputSchema,
      outputSchema: upsertCriticReviewOutputSchema.shape,
    },
    async (input) => upsertCriticReviewTool({ database, input, userId }),
  );

  server.registerTool(
    "cellar.delete_critic_review",
    {
      annotations: writeToolAnnotations,
      title: "Delete critic review",
      description: "Delete one authorised critic review fact.",
      inputSchema: deleteCriticReviewInputSchema,
      outputSchema: deleteCriticReviewOutputSchema.shape,
    },
    async ({ criticReviewId }) => {
      const persistedCriticReviewId = await resolveCriticReviewId({
        criticReviewId,
        database,
        userId,
      });
      const persistedReview = (await listCriticReviews({ database, userId })).find(
        (review) => review.id === persistedCriticReviewId,
      );
      if (persistedReview === undefined) {
        throw new HTTPException(404, { message: "Critic review not found" });
      }
      await requireSitePermission({
        database,
        permission: "site.content.write",
        siteId: persistedReview.siteId,
        userId,
      });
      const criticReview = criticReviewSummary(persistedReview);
      const auditEventId = crypto.randomUUID();
      await database.batch([
        database.delete(criticReviews).where(eq(criticReviews.id, persistedCriticReviewId)),
        createMcpToolAuditEventInsert({
          auditEventId,
          database,
          event: {
            affectedRecordCount: 1,
            after: {},
            before: criticReview,
            input: { criticReviewId },
            siteId: criticReview.siteId,
            targetKind: "critic_review",
            targetMcpId: criticReview.criticReviewId,
            targetPersistedId: persistedCriticReviewId,
            toolName: "cellar.delete_critic_review",
            userId,
          },
        }),
      ]);
      return toolJson({ criticReview, deleted: true });
    },
  );
}

async function upsertCriticReviewTool({
  database,
  input: { wineId, ...input },
  userId,
}: {
  readonly database: ReturnType<typeof createD1Client>;
  readonly input: z.infer<typeof upsertCriticReviewInputSchema>;
  readonly userId: string;
}): Promise<ReturnType<typeof toolJson>> {
  const wine = await getWineVintageSummary({ database, userId, wineId });
  await requireSitePermission({
    database,
    permission: "site.content.write",
    siteId: wine.siteId,
    userId,
  });
  const wineVintageId = await resolveWineVintageId({ database, userId, wineId });
  const { persistedReviewSourceId, reviewSourceName, sourceInput } =
    await resolveUpsertReviewSource({
      database,
      reviewSourceId: input.reviewSourceId,
      reviewSourceName: input.reviewSourceName,
      siteId: wine.siteId,
      userId,
    });
  const existingReview = (await listCriticReviews({ database, userId, wineVintageId })).find(
    (review) => review.reviewSourceId === persistedReviewSourceId,
  );
  const persistedCriticReviewId = existingReview?.id ?? generatedId("critic-review");
  const criticReviewId = mcpEntityId("critic_review", persistedCriticReviewId);
  const reviewInput = {
    notes: input.notes ?? undefined,
    provenance: input.provenance ?? undefined,
    ratingScale: input.ratingScale ?? undefined,
    ratingText: input.ratingText,
    ratingValue: input.ratingValue ?? undefined,
    reviewSourceId: persistedReviewSourceId,
    reviewedAt: input.reviewedAt ?? undefined,
    sourceUrl: input.sourceUrl ?? undefined,
  };
  const before: Record<string, unknown> =
    existingReview === undefined ? {} : criticReviewSummary(existingReview);
  const afterAudit = {
    criticReviewId,
    notes: optionalText(input.notes ?? undefined),
    provenance: optionalText(input.provenance ?? undefined),
    ratingScale: optionalText(input.ratingScale ?? undefined),
    ratingText: input.ratingText.trim(),
    ratingValue: input.ratingValue ?? null,
    reviewSource: reviewSourceName,
    reviewSourceId: mcpEntityId("review_source", persistedReviewSourceId),
    reviewedAt: optionalText(input.reviewedAt ?? undefined),
    siteId: wine.siteId,
    sourceUrl: optionalText(input.sourceUrl ?? undefined),
    wineId,
  };
  const changed = JSON.stringify(before) !== JSON.stringify(afterAudit);
  const auditEventId = crypto.randomUUID();
  const reviewWrite = createCriticReviewUpsert({
    database,
    review: reviewInput,
    reviewId: persistedCriticReviewId,
    reviewSourceId: persistedReviewSourceId,
    siteId: wine.siteId,
    userId,
    wineVintageId,
  });
  const auditWrite = createMcpToolAuditEventInsert({
    auditEventId,
    database,
    event: {
      affectedRecordCount: changed ? 1 : 0,
      after: afterAudit,
      before,
      input: { wineId, ...input },
      siteId: wine.siteId,
      targetKind: "critic_review",
      targetMcpId: criticReviewId,
      targetPersistedId: persistedCriticReviewId,
      toolName: "cellar.upsert_critic_review",
      userId,
    },
  });
  if (sourceInput === null) {
    await database.batch([reviewWrite, auditWrite]);
  } else {
    await database.batch([
      createReviewSourceUpsert({
        database,
        input: sourceInput,
        reviewSourceId: persistedReviewSourceId,
      }),
      reviewWrite,
      auditWrite,
    ]);
  }
  const storedReview = (await listCriticReviews({ database, userId, wineVintageId })).find(
    (review) => review.id === persistedCriticReviewId,
  );
  if (storedReview === undefined) {
    throw new Error("Critic review upsert did not return a row");
  }
  const criticReview = criticReviewSummary(storedReview);
  return toolJson({ changed, criticReview });
}

async function resolveUpsertReviewSource({
  database,
  reviewSourceId,
  reviewSourceName,
  siteId,
  userId,
}: {
  readonly database: ReturnType<typeof createD1Client>;
  readonly reviewSourceId?: string | undefined;
  readonly reviewSourceName?: string | undefined;
  readonly siteId: string;
  readonly userId: string;
}): Promise<{
  readonly persistedReviewSourceId: string;
  readonly reviewSourceName: string;
  readonly sourceInput: {
    readonly isActive: true;
    readonly name: string;
    readonly siteId: string;
    readonly sourceType: "critic";
  } | null;
}> {
  const sourceInput =
    reviewSourceName === undefined
      ? null
      : {
          isActive: true as const,
          name: reviewSourceName,
          siteId,
          sourceType: "critic" as const,
        };
  if (reviewSourceId === undefined && sourceInput === null) {
    throw new HTTPException(400, { message: "Review source is required" });
  }
  const persistedReviewSourceId =
    sourceInput === null
      ? await resolveReviewSourceId({
          database,
          reviewSourceId: reviewSourceId ?? "",
          userId,
        })
      : reviewSourceIdForInput(sourceInput);
  const source = (await listReviewSources({ database, siteId, userId })).find(
    (candidate) => candidate.id === persistedReviewSourceId,
  );
  const resolvedReviewSourceName = source?.name ?? reviewSourceName;
  if (resolvedReviewSourceName === undefined) {
    throw new HTTPException(400, { message: "Review source is required" });
  }
  return {
    persistedReviewSourceId,
    reviewSourceName: resolvedReviewSourceName,
    sourceInput,
  };
}

export async function listReviewSourceSummaries({
  database,
  input,
  userId,
}: {
  readonly database: ReturnType<typeof createD1Client>;
  readonly input: z.infer<typeof listReviewSourcesInputSchema>;
  readonly userId: string;
}): Promise<Page<z.infer<typeof reviewSourceSummarySchema>>> {
  const cursor = decodePageCursor({
    cursorSchema: listReviewSourcesCursorSchema,
    input,
    toolName: listReviewSourcesToolName,
  });
  const rows = (await listReviewSources({ database, siteId: input.siteId, userId })).filter(
    (source) => input.includeInactive || source.isActive,
  );
  const summaries = rows.map((source) => reviewSourceSummary(source));
  return pageFromRows({
    cursorForItem: (item) => ({ reviewSourceId: item.reviewSourceId }),
    input,
    items: rowsAfterCursor({
      cursor,
      cursorForItem: (item) => ({ reviewSourceId: item.reviewSourceId }),
      items: summaries,
    }),
    toolName: listReviewSourcesToolName,
  });
}

export async function createReviewSourceSummary({
  database,
  input,
  userId,
}: {
  readonly database: ReturnType<typeof createD1Client>;
  readonly input: {
    readonly isActive: boolean;
    readonly name: string;
    readonly notes?: string | null | undefined;
    readonly siteId: string;
    readonly sourceType: string;
    readonly url?: string | null | undefined;
  };
  readonly userId: string;
}): Promise<z.infer<typeof reviewSourceSummarySchema>> {
  const source = await createOrUpdateReviewSource({
    database,
    input: {
      isActive: input.isActive,
      name: input.name,
      notes: input.notes ?? undefined,
      siteId: input.siteId,
      sourceType: input.sourceType,
      url: input.url ?? undefined,
    },
    userId,
  });
  return reviewSourceSummary(source);
}

export async function listCriticReviewSummaries({
  database,
  input,
  userId,
  wineVintageId,
}: {
  readonly database: ReturnType<typeof createD1Client>;
  readonly input: z.infer<typeof listCriticReviewsInputSchema>;
  readonly userId: string;
  readonly wineVintageId?: string | undefined;
}): Promise<Page<z.infer<typeof criticReviewSummarySchema>>> {
  const cursor = decodePageCursor({
    cursorSchema: listCriticReviewsCursorSchema,
    input,
    toolName: listCriticReviewsToolName,
  });
  const rows = (await listCriticReviews({ database, userId, wineVintageId })).filter(
    (review) => input.siteId === undefined || review.siteId === input.siteId,
  );
  const summaries = rows.map((review) => criticReviewSummary(review));
  return pageFromRows({
    cursorForItem: (item) => ({ reviewId: item.criticReviewId }),
    input,
    items: rowsAfterCursor({
      cursor,
      cursorForItem: (item) => ({ reviewId: item.criticReviewId }),
      items: summaries,
    }),
    toolName: listCriticReviewsToolName,
  });
}

export async function upsertCriticReviewSummary({
  database,
  input,
  userId,
  wineVintageId,
}: {
  readonly database: ReturnType<typeof createD1Client>;
  readonly input: {
    readonly notes?: string | null | undefined;
    readonly provenance?: string | null | undefined;
    readonly ratingScale?: string | null | undefined;
    readonly ratingText: string;
    readonly ratingValue?: number | null | undefined;
    readonly reviewSourceId?: string | undefined;
    readonly reviewSourceName?: string | undefined;
    readonly reviewedAt?: string | null | undefined;
    readonly sourceUrl?: string | null | undefined;
  };
  readonly userId: string;
  readonly wineVintageId: string;
}): Promise<z.infer<typeof criticReviewSummarySchema>> {
  const reviewSourceId =
    input.reviewSourceId === undefined
      ? undefined
      : await resolveReviewSourceId({ database, reviewSourceId: input.reviewSourceId, userId });
  const review = await upsertCriticReview({
    database,
    review: {
      notes: input.notes ?? undefined,
      provenance: input.provenance ?? undefined,
      ratingScale: input.ratingScale ?? undefined,
      ratingText: input.ratingText,
      ratingValue: input.ratingValue ?? undefined,
      reviewSourceId,
      reviewSourceName: input.reviewSourceName,
      reviewedAt: input.reviewedAt ?? undefined,
      sourceUrl: input.sourceUrl ?? undefined,
    },
    userId,
    wineVintageId,
  });
  return criticReviewSummary(review);
}

export async function deleteCriticReviewSummary({
  criticReviewId,
  database,
  userId,
}: {
  readonly criticReviewId: string;
  readonly database: ReturnType<typeof createD1Client>;
  readonly userId: string;
}): Promise<z.infer<typeof criticReviewSummarySchema>> {
  const review = await deleteCriticReview({
    database,
    reviewId: await resolveCriticReviewId({ criticReviewId, database, userId }),
    userId,
  });
  return criticReviewSummary(review);
}

export async function resolveReviewSourceId({
  database,
  reviewSourceId,
  userId,
}: {
  readonly database: ReturnType<typeof createD1Client>;
  readonly reviewSourceId: string;
  readonly userId: string;
}): Promise<string> {
  const sources = await listReviewSources({ database, userId });
  const source = sources.find(
    (candidate) => mcpEntityId("review_source", candidate.id) === reviewSourceId,
  );
  if (source === undefined) {
    throw new HTTPException(404, { message: "Review source not found" });
  }
  return source.id;
}

export async function resolveCriticReviewId({
  criticReviewId,
  database,
  userId,
}: {
  readonly criticReviewId: string;
  readonly database: ReturnType<typeof createD1Client>;
  readonly userId: string;
}): Promise<string> {
  const reviews = await listCriticReviews({ database, userId });
  const review = reviews.find(
    (candidate) => mcpEntityId("critic_review", candidate.id) === criticReviewId,
  );
  if (review === undefined) {
    throw new HTTPException(404, { message: "Critic review not found" });
  }
  return review.id;
}

export function reviewSourceSummary(
  source: ReviewSourceResource,
): z.infer<typeof reviewSourceSummarySchema> {
  return {
    isActive: source.isActive,
    notes: source.notes,
    reviewSource: source.name,
    reviewSourceId: mcpEntityId("review_source", source.id),
    site: source.siteName,
    siteId: source.siteId,
    sourceType: source.sourceType,
    url: source.url,
  };
}

export function criticReviewSummary(
  review: CriticReviewResource,
): z.infer<typeof criticReviewSummarySchema> {
  return {
    criticReviewId: mcpEntityId("critic_review", review.id),
    notes: review.notes,
    provenance: review.provenance,
    ratingScale: review.ratingScale,
    ratingText: review.ratingText,
    ratingValue: review.ratingValue,
    reviewSource: review.reviewSourceName,
    reviewSourceId: mcpEntityId("review_source", review.reviewSourceId),
    reviewedAt: review.reviewedAt,
    siteId: review.siteId,
    sourceUrl: review.sourceUrl,
    wineId: mcpEntityId("wine", review.wineVintageId),
  };
}
