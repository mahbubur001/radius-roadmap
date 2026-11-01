import "server-only";
import { type NextRequest, NextResponse } from "next/server";
import { ZodError, type z } from "zod";
import { db } from "@/server/db/client";
import { hit } from "@/server/rate-limit";
import { type ApiCaller, verifyApiKey } from "@/server/services/api-keys";
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from "@/server/services/context";
import { serialize } from "./serialize";

// The public REST API's request pipeline (doc 27 A4, A5): bearer key →
// permission → rate limit → handler → snake_case JSON, with one error shape.

export const RATE_LIMIT = 100; // per key per minute (A4)

type ErrorCode =
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "conflict"
  | "invalid_request"
  | "rate_limited"
  | "server_error";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
};

export function apiError(
  status: number,
  code: ErrorCode,
  message: string,
  headers?: Record<string, string>,
) {
  return NextResponse.json(
    { error: { code, message } },
    { status, headers: { ...CORS, ...headers } },
  );
}

/** Preflight: the API takes no cookies, so any origin may call it. */
export function apiOptions() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

export type ApiContext<P> = {
  request: NextRequest;
  caller: ApiCaller;
  params: P;
  /** Query parameters parsed with `schema` (400 when they don't fit). */
  query<S extends z.ZodType>(schema: S): z.output<S>;
  /** JSON body parsed with `schema` (422 when it doesn't fit). */
  body<S extends z.ZodType>(schema: S): Promise<z.output<S>>;
};

class BodyError extends Error {}

/**
 * Wraps a v1 route. The handler returns the response body (camelCase; it's
 * serialized here) or a Response. `write` routes need a read + write key.
 */
export function apiRoute<P = Record<string, never>>(
  options: { write?: boolean; status?: number },
  handler: (ctx: ApiContext<P>) => Promise<unknown>,
) {
  return async (
    request: NextRequest,
    route: { params: Promise<P> },
  ): Promise<Response> => {
    const header = request.headers.get("authorization") ?? "";
    const key = header.match(/^Bearer\s+(\S+)$/i)?.[1];
    if (!key) {
      return apiError(
        401,
        "unauthorized",
        "Send your API key as `Authorization: Bearer <key>`.",
      );
    }
    const caller = await verifyApiKey(db, key);
    if (!caller) {
      return apiError(
        401,
        "unauthorized",
        "This API key is invalid or revoked, its plan has no API access, or the account is suspended.",
      );
    }
    if (options.write && caller.permission !== "write") {
      return apiError(403, "forbidden", "This key is read-only.");
    }
    const allowed = await hit([
      { key: `api:${caller.keyId}`, max: RATE_LIMIT, windowSeconds: 60 },
    ]);
    if (!allowed) {
      return apiError(
        429,
        "rate_limited",
        `Too many requests: ${RATE_LIMIT} a minute per key.`,
        {
          "Retry-After": "60",
          "X-RateLimit-Limit": String(RATE_LIMIT),
        },
      );
    }

    try {
      const result = await handler({
        request,
        caller,
        params: await route.params,
        query: (schema) =>
          schema.parse(Object.fromEntries(request.nextUrl.searchParams)),
        body: async (schema) => {
          const json = await request.json().catch(() => {
            throw new BodyError("The body must be JSON.");
          });
          const parsed = schema.safeParse(json);
          if (!parsed.success) throw new BodyError(describe(parsed.error));
          return parsed.data;
        },
      });
      if (result instanceof Response) return result;
      if (result === null || result === undefined) {
        return new NextResponse(null, { status: 204, headers: CORS });
      }
      return NextResponse.json(serialize(result), {
        status: options.status ?? 200,
        headers: { ...CORS, "X-RateLimit-Limit": String(RATE_LIMIT) },
      });
    } catch (error) {
      if (error instanceof BodyError) {
        return apiError(422, "invalid_request", error.message);
      }
      if (error instanceof ZodError) {
        return apiError(400, "invalid_request", describe(error));
      }
      if (error instanceof NotFoundError) {
        return apiError(404, "not_found", error.message);
      }
      if (error instanceof ConflictError) {
        return apiError(409, "conflict", error.message);
      }
      if (error instanceof ForbiddenError) {
        return apiError(403, "forbidden", error.message);
      }
      console.error("[api]", error);
      return apiError(500, "server_error", "Something went wrong.");
    }
  };
}

function describe(error: ZodError) {
  const issue = error.issues[0];
  if (!issue) return "Invalid request.";
  const path = issue.path.join(".");
  return path ? `${path}: ${issue.message}` : issue.message;
}

/** 404 helper for "one item" endpoints. */
export function found<T>(value: T | null | undefined, what: string): T {
  if (value === null || value === undefined) {
    throw new NotFoundError(`${what} not found.`);
  }
  return value;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A path id; anything that isn't a UUID can't exist (404, not 500). */
export function idParam(id: string, what: string) {
  if (!UUID.test(id)) throw new NotFoundError(`${what} not found.`);
  return id;
}
