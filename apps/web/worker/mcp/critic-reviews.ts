// oxlint-disable eslint/no-use-before-define
import type { createD1Client } from "@chikachow/booze-db";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";

import {
  createOrUpdateReviewSource,
  deleteCriticReview,
  listCriticReviews,
  listReviewSources,
  upsertCriticReview,
  type CriticReviewResource,
  type ReviewSourceResource,
} from "../api/critic-reviews.ts";
import { createMcpToolAuditEventInsert } from "./audit.ts";
import { resolveWineVintageId } from "./catalogue.ts";
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
      const reviewSource = await createReviewSourceSummary({ database, input, userId });
      const persistedReviewSourceId = await resolveReviewSourceId({
        database,
        reviewSourceId: reviewSource.reviewSourceId,
        userId,
      });
      const auditEventId = crypto.randomUUID();
      await createMcpToolAuditEventInsert({
        auditEventId,
        database,
        event: {
          affectedRecordCount: 1,
          after: reviewSource,
          before: {},
          input,
          siteId: input.siteId,
          targetKind: "review_source",
          targetMcpId: reviewSource.reviewSourceId,
          targetPersistedId: persistedReviewSourceId,
          toolName: "cellar.create_review_source",
          userId,
        },
      }).run();
      return toolJson({ changed: true, reviewSource });
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
    async ({ wineId, ...input }) => {
      const wineVintageId = await resolveWineVintageId({ database, userId, wineId });
      const beforePage = await listCriticReviewSummaries({
        database,
        input: { limit: 25, wineId },
        userId,
        wineVintageId,
      });
      const criticReview = await upsertCriticReviewSummary({
        database,
        input,
        userId,
        wineVintageId,
      });
      const before: Record<string, unknown> =
        beforePage.items.find(
          (review) =>
            review.criticReviewId === criticReview.criticReviewId ||
            review.reviewSourceId === criticReview.reviewSourceId,
        ) ?? {};
      const changed = JSON.stringify(before) !== JSON.stringify(criticReview);
      const persistedCriticReviewId = await resolveCriticReviewId({
        criticReviewId: criticReview.criticReviewId,
        database,
        userId,
      });
      const auditEventId = crypto.randomUUID();
      await createMcpToolAuditEventInsert({
        auditEventId,
        database,
        event: {
          affectedRecordCount: changed ? 1 : 0,
          after: criticReview,
          before,
          input: { wineId, ...input },
          siteId: criticReview.siteId,
          targetKind: "critic_review",
          targetMcpId: criticReview.criticReviewId,
          targetPersistedId: persistedCriticReviewId,
          toolName: "cellar.upsert_critic_review",
          userId,
        },
      }).run();
      return toolJson({ changed, criticReview });
    },
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
      const criticReview = await deleteCriticReviewSummary({
        criticReviewId,
        database,
        userId,
      });
      const auditEventId = crypto.randomUUID();
      await createMcpToolAuditEventInsert({
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
      }).run();
      return toolJson({ criticReview, deleted: true });
    },
  );
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
