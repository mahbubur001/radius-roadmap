import "server-only";
import { unstable_rethrow } from "next/navigation";
import type { z } from "zod";
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from "@/server/services/context";

export type ActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; error: string };

/**
 * Wraps a server action: re-validates the input with the same Zod schema the
 * form uses, then maps our service errors to `{ ok: false, error }`. The
 * handler does its own tenant gate (requireAccount / requireWorkspace).
 * Next's redirect/notFound signals are re-thrown untouched.
 */
export function action<S extends z.ZodType, T>(
  schema: S,
  handler: (input: z.output<S>) => Promise<T>,
) {
  return async (input: z.input<S>): Promise<ActionResult<T>> => {
    const parsed = schema.safeParse(input);
    if (!parsed.success) {
      return {
        ok: false,
        error: parsed.error.issues[0]?.message ?? "Please check the form.",
      };
    }
    try {
      return { ok: true, data: await handler(parsed.data) };
    } catch (error) {
      unstable_rethrow(error);
      if (
        error instanceof ForbiddenError ||
        error instanceof NotFoundError ||
        error instanceof ConflictError
      ) {
        return { ok: false, error: error.message };
      }
      console.error("[action]", error);
      return { ok: false, error: "Something went wrong. Please try again." };
    }
  };
}
