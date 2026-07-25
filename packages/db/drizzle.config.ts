// oxlint-disable import/no-default-export -- Drizzle Kit discovers configuration through the default export.

import type { Config } from "drizzle-kit";

export default {
  casing: "snake_case",
  dialect: "sqlite",
  out: "./migrations",
  schema: "./src/schema.ts",
  strict: true,
  verbose: true,
} as Config;
