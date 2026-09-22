// oxlint-disable import/no-default-export -- Drizzle Kit discovers configuration through the default export.

import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "sqlite",
  out: "./migrations",
  schema: "./src/schema.ts",
  strict: true,
  verbose: true,
});
