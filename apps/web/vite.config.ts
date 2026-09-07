// oxlint-disable import/no-default-export -- Vite discovers configuration through the default export.

import { cloudflare } from "@cloudflare/vite-plugin";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  build: {
    // Keep the initial stylesheet as one compressed response. Vite 8.2 otherwise
    // emits the App stylesheet separately, making the per-response gzip budget
    // count compression overhead twice.
    cssCodeSplit: false,
    rolldownOptions: {
      output: {
        codeSplitting: {
          // Combine shared UI code already loaded initially; keep lazy-only UI lazy.
          groups: [
            {
              name: "shared-ui",
              test: /@astryxdesign/u,
              minShareCount: 2,
              tags: ["$initial"],
            },
          ],
        },
      },
    },
  },
  envPrefix: ["VITE_", "CLERK_PUBLISHABLE_KEY"],
  plugins: [react(), cloudflare()],
});
