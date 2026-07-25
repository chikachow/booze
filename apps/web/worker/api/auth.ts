// oxlint-disable eslint/no-use-before-define
import { siteMemberships, sites, users, type BoozeDatabase } from "@chikachow/booze-db";
import { verifyToken } from "@clerk/backend";
import { and, eq, sql } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";

import { stableId, userIdForClerkUser } from "./ids.ts";
import type { AuthenticatedUser } from "./types.ts";

export async function requireAuthenticatedUser({
  database,
  request,
  headers,
  secretKey,
}: {
  readonly database: BoozeDatabase;
  readonly request: Request;
  readonly headers: Headers;
  readonly secretKey: string | undefined;
}): Promise<AuthenticatedUser> {
  const requestUrl = new URL(request.url);
  const devUser = headers.get("x-dev-user");
  const devUserCookie = cookieValue(headers.get("cookie"), "booze_dev_user");
  const developmentUser = devUser !== null && devUser !== "" ? devUser : devUserCookie;
  const isLocalhost = requestUrl.hostname === "localhost" || requestUrl.hostname === "127.0.0.1";

  if (
    (secretKey === undefined || secretKey === "") &&
    isLocalhost &&
    developmentUser !== null &&
    developmentUser !== ""
  ) {
    return ensureAuthenticatedClerkUser({ database, clerkUserId: `dev:${developmentUser}` });
  }

  if (secretKey === undefined || secretKey === "") {
    throw new HTTPException(503, { message: "Clerk is not configured" });
  }

  const token = tokenForRequest({ headers, request });

  if (token === null) {
    throw new HTTPException(401, { message: "Authentication required" });
  }

  try {
    const payload = await verifyToken(token, { secretKey });
    if (payload.sub === undefined || payload.sub === "") {
      throw new Error("Clerk token did not include a subject");
    }
    return await ensureAuthenticatedClerkUser({ database, clerkUserId: payload.sub });
  } catch {
    throw new HTTPException(401, { message: "Authentication required" });
  }
}

function tokenForRequest({
  headers,
  request,
}: {
  readonly headers: Headers;
  readonly request: Request;
}): string | null {
  const authorizationHeader = headers.get("authorization");
  const bearerToken = authorizationHeader?.startsWith("Bearer ")
    ? authorizationHeader.slice("Bearer ".length)
    : null;

  if (bearerToken !== null && bearerToken !== "") {
    return bearerToken;
  }

  if (!allowsCookieToken({ headers, request })) {
    return null;
  }

  return cookieValue(headers.get("cookie"), "__session");
}

function allowsCookieToken({
  headers,
  request,
}: {
  readonly headers: Headers;
  readonly request: Request;
}): boolean {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return false;
  }

  const fetchSite = headers.get("sec-fetch-site");
  return fetchSite === null || fetchSite === "none" || fetchSite === "same-origin";
}

function cookieValue(cookieHeader: string | null, name: string): string | null {
  if (cookieHeader === null) {
    return null;
  }

  for (const cookie of cookieHeader.split(";")) {
    const separatorIndex = cookie.indexOf("=");
    if (separatorIndex === -1) {
      continue;
    }

    const cookieName = cookie.slice(0, separatorIndex).trim();
    if (cookieName !== name) {
      continue;
    }

    const value = cookie.slice(separatorIndex + 1).trim();
    return value === "" ? null : value;
  }

  return null;
}

export async function ensureAuthenticatedClerkUser({
  database,
  clerkUserId,
}: {
  readonly database: BoozeDatabase;
  readonly clerkUserId: string;
}): Promise<AuthenticatedUser> {
  const userId = userIdForClerkUser(clerkUserId);

  await database
    .insert(users)
    .values({ id: userId, clerkUserId })
    .onConflictDoNothing({ target: users.clerkUserId });

  return { clerkUserId, userId };
}

export async function upsertSite({
  database,
  site,
  userId,
}: {
  readonly database: BoozeDatabase;
  readonly site: string;
  readonly userId: string;
}): Promise<{ readonly siteId: string }> {
  const siteId = stableId("site", site);

  await database
    .insert(sites)
    .values({ id: siteId, name: site })
    .onConflictDoUpdate({
      target: sites.id,
      set: { name: site, updatedAt: sql`CURRENT_TIMESTAMP` },
    });

  await database
    .insert(siteMemberships)
    .values({ siteId, userId, role: "owner" })
    .onConflictDoNothing({ target: [siteMemberships.siteId, siteMemberships.userId] });

  return { siteId };
}

export async function assertCanAccessSite({
  database,
  siteId,
  userId,
}: {
  readonly database: BoozeDatabase;
  readonly siteId: string;
  readonly userId: string;
}): Promise<void> {
  const membership = await database
    .select({ siteId: siteMemberships.siteId })
    .from(siteMemberships)
    .where(and(eq(siteMemberships.siteId, siteId), eq(siteMemberships.userId, userId)))
    .limit(1);

  if (membership.length === 0) {
    throw new HTTPException(404, { message: "Site not found" });
  }
}
