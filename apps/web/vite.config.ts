// oxlint-disable import/no-default-export -- Vite discovers configuration through the default export.

import { cloudflare } from "@cloudflare/vite-plugin";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  envPrefix: ["VITE_", "CLERK_PUBLISHABLE_KEY"],
  plugins: [react(), cloudflare()],
});
