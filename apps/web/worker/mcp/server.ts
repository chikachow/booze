// oxlint-disable import/max-dependencies -- MCP composition root registers the complete tool surface.
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  bottleLocations,
  bottles as bottleRows,
  storageLocations,
  type createD1Client,
} from "@chikachow/booze-db";
import { and, eq, isNull, sql } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";

import { requireSitePermission } from "../api/auth.ts";
import { generatedId, optionalText } from "../api/ids.ts";
import {
  assertCanReadStorageLocation,
  createWineVintageDrinkWindowUpdate,
  getBottle,
  withDrinkStatus,
} from "../api/inventory.ts";
import { createMcpToolAuditEventInsert } from "./audit.ts";
import {
  bottleDetail,
  listBottleSummaries,
  listDrinkQueueBottleSummaries,
  listLocationBottleSummaries,
} from "./bottles.ts";
import { registerCriticReviewTools } from "./critic-reviews.ts";
import { mcpEntityId } from "./ids.ts";
import {
  getInventorySummary,
  getStorageLocationSummary,
  getWineVintageSummary,
  listSites,
  listStorageLocationDisplayNames,
  listStorageLocations,
  listWineVintages,
  listWineries,
  resolveStorageLocationIdInSite,
  resolveStorageLocationId,
  resolveWineVintageId,
} from "./catalogue.ts";
import { toolJson } from "./pagination.ts";
import {
  bottleDetailSchema,
  bottleSummaryListOutputSchema,
  bottleSummaryOutputSchema,
  createStorageLocationInputSchema,
  createStorageLocationOutputSchema,
  getBottleInputSchema,
  getWineInputSchema,
  inventorySummarySchema,
  listDrinkQueueInputSchema,
  listSitesInputSchema,
  listStorageLocationsInputSchema,
  listWineriesInputSchema,
  listWinesInputSchema,
  markBottleConsumedInputSchema,
  markBottleConsumedOutputSchema,
  locationInventoryInputSchema,
  paginationOutputSchema,
  searchBottlesInputSchema,
  setBottleLocationInputSchema,
  setBottleLocationOutputSchema,
  setDrinkingWindowInputSchema,
  siteSummarySchema,
  storageLocationSummarySchema,
  wineVintageSummarySchema,
  winerySummarySchema,
} from "./schemas.ts";

const MCP_NAME = "booze";
const MCP_VERSION = "0.0.1";

export const boozeMcpToolNames = [
  "cellar.search_bottles",
  "cellar.list_sites",
  "cellar.list_wines",
  "cellar.get_wine",
  "cellar.list_review_sources",
  "cellar.create_review_source",
  "cellar.list_critic_reviews",
  "cellar.upsert_critic_review",
  "cellar.delete_critic_review",
  "cellar.list_wineries",
  "cellar.list_storage_locations",
  "cellar.get_bottle",
  "cellar.list_drink_queue",
  "cellar.list_location_bottles",
  "cellar.get_inventory_summary",
  "cellar.set_drinking_window",
  "cellar.create_storage_location",
  "cellar.set_bottle_location",
  "cellar.mark_bottle_consumed",
] as const;

const readOnlyClosedWorldToolAnnotations = {
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
  readOnlyHint: true,
};
const writeClosedWorldToolAnnotations = {
  destructiveHint: true,
  idempotentHint: true,
  openWorldHint: false,
  readOnlyHint: false,
};

export function createBoozeMcpServer({
  database,
  userId,
}: {
  readonly database: ReturnType<typeof createD1Client>;
  readonly userId: string;
}): McpServer {
  const server = new McpServer({ name: MCP_NAME, version: MCP_VERSION });

  server.registerTool(
    "cellar.search_bottles",
    {
      annotations: readOnlyClosedWorldToolAnnotations,
      title: "Search bottles",
      description: "Search authorised in-stock wine bottles and return compact bottle summaries.",
      inputSchema: searchBottlesInputSchema,
      outputSchema: bottleSummaryListOutputSchema,
    },
    async (input) => {
      const storageLocationId =
        input.locationId === undefined
          ? undefined
          : await resolveStorageLocationId({ database, locationId: input.locationId, userId });
      const page = await listBottleSummaries({
        database,
        input,
        storageLocationId,
        userId,
      });
      return toolJson({ bottles: page.items, ...page.metadata });
    },
  );

  server.registerTool(
    "cellar.list_sites",
    {
      annotations: readOnlyClosedWorldToolAnnotations,
      title: "List sites",
      description: "List authorised storage sites with bottle and location counts.",
      inputSchema: listSitesInputSchema,
      outputSchema: {
        sites: z.array(siteSummarySchema),
        ...paginationOutputSchema,
      },
    },
    async (input) => {
      const sites = await listSites({ database, input, userId });
      return toolJson({ sites: sites.items, ...sites.metadata });
    },
  );

  server.registerTool(
    "cellar.list_wines",
    {
      annotations: readOnlyClosedWorldToolAnnotations,
      title: "List wines",
      description: "List authorised wine vintages with bottle counts and compact wine details.",
      inputSchema: listWinesInputSchema,
      outputSchema: {
        ...paginationOutputSchema,
        wines: z.array(wineVintageSummarySchema),
      },
    },
    async (input) => {
      const wines = await listWineVintages({ database, input, userId });
      return toolJson({ wines: wines.items, ...wines.metadata });
    },
  );

  server.registerTool(
    "cellar.get_wine",
    {
      annotations: readOnlyClosedWorldToolAnnotations,
      title: "Get wine",
      description: "Fetch one authorised wine vintage by MCP wine ID.",
      inputSchema: getWineInputSchema,
      outputSchema: {
        wine: wineVintageSummarySchema,
        wineId: z.string(),
      },
    },
    async ({ wineId }) => {
      const wine = await getWineVintageSummary({ database, userId, wineId });
      return toolJson({ wine, wineId });
    },
  );

  server.registerTool(
    "cellar.list_wineries",
    {
      annotations: readOnlyClosedWorldToolAnnotations,
      title: "List wineries",
      description: "List authorised wineries with brand names, wine counts, and bottle counts.",
      inputSchema: listWineriesInputSchema,
      outputSchema: {
        ...paginationOutputSchema,
        wineries: z.array(winerySummarySchema),
      },
    },
    async (input) => {
      const wineryRows = await listWineries({ database, input, userId });
      return toolJson({ wineries: wineryRows.items, ...wineryRows.metadata });
    },
  );

  registerCriticReviewTools({
    database,
    readOnlyToolAnnotations: readOnlyClosedWorldToolAnnotations,
    server,
    userId,
    writeToolAnnotations: writeClosedWorldToolAnnotations,
  });

  server.registerTool(
    "cellar.list_storage_locations",
    {
      annotations: readOnlyClosedWorldToolAnnotations,
      title: "List storage locations",
      description:
        "List authorised storage locations with display-ready hierarchical location names and bottle counts.",
      inputSchema: listStorageLocationsInputSchema,
      outputSchema: {
        locations: z.array(storageLocationSummarySchema),
        ...paginationOutputSchema,
      },
    },
    async (input) => {
      const locations = await listStorageLocations({ database, input, userId });
      return toolJson({ locations: locations.items, ...locations.metadata });
    },
  );

  server.registerTool(
    "cellar.get_bottle",
    {
      annotations: readOnlyClosedWorldToolAnnotations,
      title: "Get bottle",
      description: "Fetch one authorised bottle by ID.",
      inputSchema: getBottleInputSchema,
      outputSchema: {
        bottle: bottleDetailSchema,
      },
    },
    async ({ bottleId }) => {
      const storageLocationsById = await listStorageLocationDisplayNames({ database, userId });
      const bottle = bottleDetail({
        bottle: withDrinkStatus(await getBottle({ bottleId, database, userId })),
        storageLocationsById,
      });
      return toolJson({ bottle });
    },
  );

  server.registerTool(
    "cellar.list_drink_queue",
    {
      annotations: readOnlyClosedWorldToolAnnotations,
      title: "List drink queue",
      description:
        "List compact summaries of authorised in-stock bottles by calculated drink status.",
      inputSchema: listDrinkQueueInputSchema,
      outputSchema: bottleSummaryListOutputSchema,
    },
    async (input) => {
      const page = await listDrinkQueueBottleSummaries({ database, input, userId });
      return toolJson({ bottles: page.items, ...page.metadata });
    },
  );

  server.registerTool(
    "cellar.list_location_bottles",
    {
      annotations: readOnlyClosedWorldToolAnnotations,
      title: "List location bottles",
      description:
        "List compact summaries of authorised in-stock bottles for one storage location.",
      inputSchema: locationInventoryInputSchema,
      outputSchema: {
        bottles: z.array(z.object(bottleSummaryOutputSchema)),
        locationId: z.string(),
        ...paginationOutputSchema,
      },
    },
    async ({ locationId, ...input }) => {
      const storageLocationId = await resolveStorageLocationId({ database, locationId, userId });
      await assertCanReadStorageLocation({ database, storageLocationId, userId });
      const page = await listLocationBottleSummaries({
        database,
        input: { locationId, ...input },
        storageLocationId,
        userId,
      });
      return toolJson({ bottles: page.items, locationId, ...page.metadata });
    },
  );

  server.registerTool(
    "cellar.get_inventory_summary",
    {
      annotations: readOnlyClosedWorldToolAnnotations,
      title: "Get inventory summary",
      description:
        "Return compact authorised inventory counts by site, bottle status, and drink status.",
      inputSchema: z.strictObject({}),
      outputSchema: {
        summary: inventorySummarySchema,
      },
    },
    async () => {
      const summary = await getInventorySummary({ database, userId });
      return toolJson({ summary });
    },
  );

  server.registerTool(
    "cellar.set_drinking_window",
    {
      annotations: writeClosedWorldToolAnnotations,
      title: "Set drinking window",
      description: "Set the drink-from and drink-to years for one authorised wine vintage.",
      inputSchema: setDrinkingWindowInputSchema,
      outputSchema: {
        affectedBottleCount: z.number().int().min(0),
        changed: z.boolean(),
        drinkFromYear: z.number().int().min(1800).max(2200).nullable(),
        drinkToYear: z.number().int().min(1800).max(2200).nullable(),
        previousDrinkFromYear: z.number().int().min(1800).max(2200).nullable(),
        previousDrinkToYear: z.number().int().min(1800).max(2200).nullable(),
        wine: wineVintageSummarySchema,
        wineId: z.string(),
      },
    },
    async ({ wineId, drinkFromYear, drinkToYear }) => {
      const before = await getWineVintageSummary({ database, userId, wineId });
      await requireSitePermission({
        database,
        permission: "site.content.write",
        siteId: before.siteId,
        userId,
      });
      const wineVintageId = await resolveWineVintageId({ database, userId, wineId });
      const affectedBottleCount = before.bottleCount;
      const auditEventId = crypto.randomUUID();
      const changed = before.drinkFromYear !== drinkFromYear || before.drinkToYear !== drinkToYear;
      const afterAudit = wineAuditSnapshot({
        ...before,
        drinkFromYear,
        drinkToYear,
      });

      const auditInsert = createMcpToolAuditEventInsert({
        auditEventId,
        database,
        event: {
          affectedRecordCount: changed ? 1 : 0,
          after: { ...afterAudit, affectedBottleCount },
          before: wineAuditSnapshot(before),
          input: { drinkFromYear, drinkToYear, wineId },
          siteId: before.siteId,
          targetKind: "wine",
          targetMcpId: wineId,
          targetPersistedId: wineVintageId,
          toolName: "cellar.set_drinking_window",
          userId,
        },
      });
      if (changed) {
        await database.batch([
          createWineVintageDrinkWindowUpdate({
            database,
            drinkFromYear,
            drinkToYear,
            siteId: before.siteId,
            wineVintageId,
          }),
          auditInsert,
        ]);
      } else {
        await database.batch([auditInsert]);
      }

      const wine = await getWineVintageSummary({ database, userId, wineId });
      return toolJson({
        affectedBottleCount,
        changed,
        drinkFromYear,
        drinkToYear,
        previousDrinkFromYear: before.drinkFromYear,
        previousDrinkToYear: before.drinkToYear,
        wine,
        wineId,
      });
    },
  );

  server.registerTool(
    "cellar.create_storage_location",
    {
      annotations: writeClosedWorldToolAnnotations,
      title: "Create storage location",
      description: "Create or update one authorised storage location within a site.",
      inputSchema: createStorageLocationInputSchema,
      outputSchema: createStorageLocationOutputSchema.shape,
    },
    async ({ siteId, parentStorageLocationId, name, locationType }) => {
      await requireSitePermission({
        database,
        permission: "site.content.write",
        siteId,
        userId,
      });
      const parentId =
        parentStorageLocationId === undefined || parentStorageLocationId === null
          ? null
          : await resolveStorageLocationIdInSite({
              database,
              locationId: parentStorageLocationId,
              siteId,
              userId,
            });
      const beforeRows = await database
        .select({ id: storageLocations.id, locationType: storageLocations.locationType })
        .from(storageLocations)
        .where(
          and(
            eq(storageLocations.siteId, siteId),
            parentId === null
              ? isNull(storageLocations.parentId)
              : eq(storageLocations.parentId, parentId),
            eq(storageLocations.name, name),
          ),
        )
        .limit(1);
      const before = beforeRows[0] ?? null;
      const storageLocationId = before?.id ?? generatedId("loc");
      const changed = before === null || before.locationType !== locationType;
      const auditEventId = crypto.randomUUID();
      const locationMcpId = mcpEntityId("location", storageLocationId);
      const locationWrite =
        before === null
          ? database.insert(storageLocations).values({
              id: storageLocationId,
              locationType,
              name,
              parentId,
              siteId,
            })
          : database
              .update(storageLocations)
              .set({ locationType, updatedAt: sql`CURRENT_TIMESTAMP` })
              .where(eq(storageLocations.id, storageLocationId));
      await database.batch([
        locationWrite,
        createMcpToolAuditEventInsert({
          auditEventId,
          database,
          event: {
            affectedRecordCount: changed ? 1 : 0,
            after: {
              locationType,
              name,
              parentStorageLocationId: parentStorageLocationId ?? null,
              siteId,
              storageLocationId: locationMcpId,
            },
            before: before === null ? {} : { locationType: before.locationType },
            input: {
              locationType,
              name,
              parentStorageLocationId: parentStorageLocationId ?? null,
              siteId,
            },
            siteId,
            targetKind: "location",
            targetMcpId: locationMcpId,
            targetPersistedId: storageLocationId,
            toolName: "cellar.create_storage_location",
            userId,
          },
        }),
      ]);
      const location = await getStorageLocationSummary({ database, storageLocationId, userId });
      return toolJson({ changed, location });
    },
  );

  server.registerTool(
    "cellar.set_bottle_location",
    {
      annotations: writeClosedWorldToolAnnotations,
      title: "Set bottle location",
      description:
        "Move one authorised in-stock bottle to a storage location or clear its location.",
      inputSchema: setBottleLocationInputSchema,
      outputSchema: setBottleLocationOutputSchema.shape,
    },
    async ({ bottleId, storageLocationId, position }) => {
      const storageLocationsById = await listStorageLocationDisplayNames({ database, userId });
      const beforeBottle = withDrinkStatus(await getBottle({ bottleId, database, userId }));
      await requireSitePermission({
        database,
        permission: "site.content.write",
        siteId: beforeBottle.siteId,
        userId,
      });
      if (beforeBottle.status !== "in_stock") {
        throw new HTTPException(400, { message: "Only in-stock bottles can be moved" });
      }
      const before = bottleDetail({ bottle: beforeBottle, storageLocationsById });
      const persistedStorageLocationId =
        storageLocationId === null
          ? null
          : await resolveStorageLocationIdInSite({
              database,
              locationId: storageLocationId,
              siteId: before.siteId,
              userId,
            });
      const nextPosition =
        storageLocationId === null
          ? null
          : position === undefined
            ? before.storageLocationId === storageLocationId
              ? before.position
              : null
            : optionalText(position ?? undefined);
      const changed =
        before.storageLocationId !== storageLocationId || before.position !== nextPosition;
      const auditEventId = crypto.randomUUID();

      const auditInsert = createMcpToolAuditEventInsert({
        auditEventId,
        database,
        event: {
          affectedRecordCount: changed ? 1 : 0,
          after: { position: nextPosition, storageLocationId },
          before: {
            position: before.position,
            storageLocationId: before.storageLocationId,
          },
          input: { bottleId, position: position ?? null, storageLocationId },
          siteId: before.siteId,
          targetKind: "bottle",
          targetMcpId: bottleId,
          targetPersistedId: bottleId,
          toolName: "cellar.set_bottle_location",
          userId,
        },
      });
      if (!changed) {
        await database.batch([auditInsert]);
      } else if (persistedStorageLocationId === null) {
        await database.batch([
          database.delete(bottleLocations).where(eq(bottleLocations.bottleId, bottleId)),
          auditInsert,
        ]);
      } else {
        await database.batch([
          database.delete(bottleLocations).where(eq(bottleLocations.bottleId, bottleId)),
          database.insert(bottleLocations).values({
            bottleId,
            positionHint: nextPosition,
            siteId: before.siteId,
            storageLocationId: persistedStorageLocationId,
          }),
          auditInsert,
        ]);
      }

      const afterStorageLocationsById = await listStorageLocationDisplayNames({ database, userId });
      const bottle = bottleDetail({
        bottle: withDrinkStatus(await getBottle({ bottleId, database, userId })),
        storageLocationsById: afterStorageLocationsById,
      });
      return toolJson({
        bottle,
        changed,
        previousPosition: before.position,
        previousStorageLocation: before.storageLocation,
        previousStorageLocationId: before.storageLocationId,
        position: bottle.position,
        storageLocation: bottle.storageLocation,
        storageLocationId: bottle.storageLocationId,
      });
    },
  );

  server.registerTool(
    "cellar.mark_bottle_consumed",
    {
      annotations: writeClosedWorldToolAnnotations,
      title: "Mark bottle consumed",
      description: "Mark one authorised bottle as consumed.",
      inputSchema: markBottleConsumedInputSchema,
      outputSchema: markBottleConsumedOutputSchema.shape,
    },
    async ({ bottleId }) => {
      const storageLocationsById = await listStorageLocationDisplayNames({ database, userId });
      const beforeBottle = withDrinkStatus(await getBottle({ bottleId, database, userId }));
      await requireSitePermission({
        database,
        permission: "site.content.write",
        siteId: beforeBottle.siteId,
        userId,
      });
      const before = bottleDetail({ bottle: beforeBottle, storageLocationsById });
      const changed = before.status !== "consumed";
      const auditEventId = crypto.randomUUID();

      const auditInsert = createMcpToolAuditEventInsert({
        auditEventId,
        database,
        event: {
          affectedRecordCount: changed ? 1 : 0,
          after: { status: "consumed" },
          before: { status: before.status },
          input: { bottleId },
          siteId: before.siteId,
          targetKind: "bottle",
          targetMcpId: bottleId,
          targetPersistedId: bottleId,
          toolName: "cellar.mark_bottle_consumed",
          userId,
        },
      });
      if (changed) {
        await database.batch([
          database
            .update(bottleRows)
            .set({ status: "consumed", updatedAt: sql`CURRENT_TIMESTAMP` })
            .where(eq(bottleRows.id, bottleId)),
          auditInsert,
        ]);
      } else {
        await database.batch([auditInsert]);
      }

      const bottle = bottleDetail({
        bottle: withDrinkStatus(await getBottle({ bottleId, database, userId })),
        storageLocationsById,
      });
      return toolJson({
        bottle,
        changed,
        previousStatus: before.status,
        status: bottle.status,
      });
    },
  );
  return server;
}

function wineAuditSnapshot(
  wine: z.infer<typeof wineVintageSummarySchema>,
): Record<string, unknown> {
  return {
    drinkFromYear: wine.drinkFromYear,
    drinkToYear: wine.drinkToYear,
    siteId: wine.siteId,
    vintageLabel: wine.vintageLabel,
    wine: wine.wine,
    wineId: wine.wineId,
    winery: wine.winery,
  };
}
