import { HTTPException } from "hono/http-exception";
import { ZodError } from "zod";

export function created(data: unknown, headers?: HeadersInit): Response {
  return Response.json({ data }, { ...(headers === undefined ? {} : { headers }), status: 201 });
}

export function noContent(): Response {
  return new Response(null, { status: 204 });
}

export function locationHeader(path: string): HeadersInit {
  return { location: path };
}

export function problemResponse({
  detail,
  status,
  title,
}: {
  readonly detail?: string | undefined;
  readonly status: number;
  readonly title: string;
}): Response {
  return Response.json(
    {
      type: "about:blank",
      title,
      status,
      ...(detail === undefined ? {} : { detail, message: detail }),
    },
    {
      headers: { "content-type": "application/problem+json" },
      status,
    },
  );
}

export function problemResponseForError(error: unknown): Response {
  if (error instanceof ZodError) {
    return problemResponse({
      detail: error.issues.map((issue) => issue.message).join("; "),
      status: 400,
      title: "Invalid request body",
    });
  }

  if (error instanceof HTTPException) {
    return problemResponse({
      detail: error.message,
      status: error.status,
      title: error.status < 500 ? "Request failed" : "Server error",
    });
  }

  return problemResponse({ status: 500, title: "Server error" });
}
