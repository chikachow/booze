// oxlint-disable import/no-default-export

import { Hono } from "hono";

import { healthRoutes } from "./routes/health.ts";

type Bindings = {
  readonly DB: D1Database;
};

const app = new Hono<{ Bindings: Bindings }>();

app.route("/", healthRoutes);
app.route("/api", healthRoutes);

export default app;
