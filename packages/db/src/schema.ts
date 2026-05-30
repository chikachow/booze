import { sql } from "drizzle-orm";
import {
  foreignKey,
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

const currentTimestamp = sql`CURRENT_TIMESTAMP`;
const timestampColumns = {
  createdAt: text("created_at").notNull().default(currentTimestamp),
  updatedAt: text("updated_at")
    .notNull()
    .default(currentTimestamp)
    .$onUpdate(() => currentTimestamp),
};

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  clerkUserId: text("clerk_user_id").notNull().unique(),
  ...timestampColumns,
});

export const sites = sqliteTable("sites", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  ...timestampColumns,
});

export const siteMemberships = sqliteTable(
  "site_memberships",
  {
    siteId: text("site_id")
      .notNull()
      .references(() => sites.id),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    role: text("role").notNull(),
    ...timestampColumns,
  },
  (table) => [
    index("site_memberships_user_id_idx").on(table.userId),
    primaryKey({
      columns: [table.siteId, table.userId],
      name: "site_memberships_site_id_user_id_pk",
    }),
  ],
);

export const locations = sqliteTable(
  "locations",
  {
    siteId: text("site_id")
      .notNull()
      .references(() => sites.id),
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    ...timestampColumns,
  },
  (table) => [
    index("locations_site_id_idx").on(table.siteId),
    uniqueIndex("locations_site_id_id_unique").on(table.siteId, table.id),
  ],
);

export const wines = sqliteTable(
  "wines",
  {
    siteId: text("site_id")
      .notNull()
      .references(() => sites.id),
    id: text("id").primaryKey(),
    producer: text("producer").notNull(),
    name: text("name").notNull(),
    varietal: text("varietal"),
    vintage: integer("vintage"),
    ...timestampColumns,
  },
  (table) => [
    index("wines_site_id_idx").on(table.siteId),
    uniqueIndex("wines_site_id_id_unique").on(table.siteId, table.id),
  ],
);

export const wineBottles = sqliteTable(
  "wine_bottles",
  {
    id: text("id").primaryKey(),
    siteId: text("site_id")
      .notNull()
      .references(() => sites.id),
    locationId: text("location_id").notNull(),
    wineId: text("wine_id").notNull(),
    ...timestampColumns,
  },
  (table) => [
    index("wine_bottles_site_id_location_id_idx").on(table.siteId, table.locationId),
    index("wine_bottles_site_id_wine_id_idx").on(table.siteId, table.wineId),
    foreignKey({
      columns: [table.siteId, table.locationId],
      foreignColumns: [locations.siteId, locations.id],
      name: "wine_bottles_site_id_location_id_locations_fk",
    }),
    foreignKey({
      columns: [table.siteId, table.wineId],
      foreignColumns: [wines.siteId, wines.id],
      name: "wine_bottles_site_id_wine_id_wines_fk",
    }),
  ],
);
