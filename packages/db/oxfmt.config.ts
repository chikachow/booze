// oxlint-disable import/no-default-export -- Oxfmt discovers configuration through the default export.

import { defineConfig } from "oxfmt";

export default defineConfig({
  ignorePatterns: ["migrations/**"],
});
