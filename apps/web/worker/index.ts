// oxlint-disable import/no-default-export
// oxlint-disable import/max-dependencies

import { Hono } from "hono";

import { problemResponse, problemResponseForError } from "./api/http.ts";
import { BottleCaptureWorkflow } from "./bottle-capture-workflow.ts";
import { bottleCaptureRoutes } from "./routes/bottle-captures.ts";
import { healthRoutes } from "./routes/health.ts";
import { bottleRoutes } from "./routes/bottles.ts";
import { criticReviewRoutes } from "./routes/critic-reviews.ts";
import { mcpRoutes } from "./routes/mcp.ts";
import { siteRoutes } from "./routes/sites.ts";
import { storageLocationRoutes } from "./routes/storage-locations.ts";
import type { Bindings } from "./api/types.ts";

const app = new Hono<{ Bindings: Bindings }>();

app.route("/", healthRoutes);
app.route("/api", healthRoutes);
app.route("/api", bottleRoutes);
app.route("/api", bottleCaptureRoutes);
app.route("/api", criticReviewRoutes);
app.route("/api", siteRoutes);
app.route("/api", storageLocationRoutes);
app.route("/", mcpRoutes);

app.notFound(() => problemResponse({ status: 404, title: "Not found" }));
// oxlint-disable-next-line promise/prefer-await-to-callbacks
app.onError(async (error) => problemResponseForError(error));

export default app;
export { BottleCaptureWorkflow };
