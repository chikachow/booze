import { createD1Client } from "@chikachow/booze-db";
import { Hono } from "hono";
import { requireAuthenticatedUser } from "../api/auth.ts";
import { listWineOptions } from "../api/wine-options.ts";
import type { Bindings } from "../api/types.ts";

export const wineRoutes = new Hono<{ Bindings: Bindings }>().get("/wines", async (context) => {
  const database = createD1Client(context.env.DB);
  const user = await requireAuthenticatedUser({
    database,
    request: context.req.raw,
    headers: context.req.raw.headers,
    secretKey: context.env.CLERK_SECRET_KEY,
  });
  return context.json({ data: await listWineOptions({ database, userId: user.userId }) });
});
