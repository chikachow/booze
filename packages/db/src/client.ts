import { drizzle } from "drizzle-orm/d1";
import type { AnyD1Database, DrizzleD1Database } from "drizzle-orm/d1";

import * as schema from "./schema.ts";

export type BoozeDatabase = DrizzleD1Database<typeof schema>;

export function createD1Client(database: AnyD1Database): BoozeDatabase {
  return drizzle(database, { schema });
}
