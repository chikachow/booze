import { siteMemberships, sites, users, type BoozeDatabase } from "@chikachow/booze-db";
import { verifyToken } from "@clerk/backend";
import { and, eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";

import { stableId, userIdForClerkUser } from "./ids.ts";
import type { AuthenticatedUser } from "./types.ts";

export const siteRoleSchema = z.enum(["owner", "editor", "viewer"]);
export type SiteRole = z.infer<typeof siteRoleSchema>;

export const sitePermissionSchema = z.enum(["site.read", "site.content.write", "site.manage"]);
export type SitePermission = z.infer<typeof sitePermissionSchema>;

const permissionsByRole = {
  owner: new Set<SitePermission>(["site.read", "site.content.write", "site.manage"]),
  editor: new Set<SitePermission>(["site.read", "site.content.write"]),
  viewer: new Set<SitePermission>(["site.read"]),
} satisfies Record<SiteRole, ReadonlySet<SitePermission>>;

export function roleHasSitePermission(role: SiteRole, permission: SitePermission): boolean {
  return permissionsByRole[role].has(permission);
}

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
  const bearerToken =
    authorizationHeader !== null && authorizationHeader.startsWith("Bearer ")
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
  const legacySiteId = stableId("site", site);
  const existingMembership = await database
    .select({ siteId: siteMemberships.siteId })
    .from(siteMemberships)
    .where(and(eq(siteMemberships.siteId, legacySiteId), eq(siteMemberships.userId, userId)))
    .limit(1);
  if (existingMembership[0] !== undefined) {
    return { siteId: legacySiteId };
  }

  // Site names are not globally unique. New IDs include the owner so one user cannot
  // acquire membership in another user's deterministic legacy site by choosing its name.
  const siteId = stableId("site", `${userId}:${site}`);
  await database.batch([
    database.insert(sites).values({ id: siteId, name: site }).onConflictDoNothing({
      target: sites.id,
    }),
    database
      .insert(siteMemberships)
      .values({ siteId, userId, role: "owner" })
      .onConflictDoNothing({ target: [siteMemberships.siteId, siteMemberships.userId] }),
  ]);

  return { siteId };
}

export async function requireSitePermission({
  database,
  permission,
  siteId,
  userId,
}: {
  readonly database: BoozeDatabase;
  readonly permission: SitePermission;
  readonly siteId: string;
  readonly userId: string;
}): Promise<{ readonly role: SiteRole }> {
  const membership = await database
    .select({ role: siteMemberships.role })
    .from(siteMemberships)
    .where(and(eq(siteMemberships.siteId, siteId), eq(siteMemberships.userId, userId)))
    .limit(1);

  const row = membership[0];
  if (row === undefined) {
    throw new HTTPException(404, { message: "Site not found" });
  }

  const parsedRole = siteRoleSchema.safeParse(row.role);
  if (!parsedRole.success || !roleHasSitePermission(parsedRole.data, permission)) {
    throw new HTTPException(403, { message: "Site permission required" });
  }

  return { role: parsedRole.data };
}
