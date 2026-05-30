import { Hono } from "hono";

type HealthResponse = {
  readonly ok: true;
};

export const healthRoutes = new Hono().get("/healthz", (context) =>
  context.json({ ok: true } satisfies HealthResponse),
);
