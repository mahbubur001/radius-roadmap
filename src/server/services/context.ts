export type Role = "owner" | "admin" | "member";

/** Who is acting, and in which account (tenant). Built by `src/server/session.ts`. */
export type AccountContext = {
  accountId: string;
  userId: string;
  role: Role;
};

export type WorkspaceContext = AccountContext & {
  workspaceId: string;
  workspaceSlug: string;
};

/**
 * Public pages and the widget: the account comes from the hostname (or the
 * widget's workspace id), never from the client. No team member involved.
 */
export type PublicContext = { accountId: string };

const rank: Record<Role, number> = { member: 0, admin: 1, owner: 2 };

export class ForbiddenError extends Error {
  constructor(message = "You don't have permission to do that.") {
    super(message);
    this.name = "ForbiddenError";
  }
}

export class NotFoundError extends Error {
  constructor(message = "Not found.") {
    super(message);
    this.name = "NotFoundError";
  }
}

/** A unique value (slug, email…) is already taken. */
export class ConflictError extends Error {
  constructor(message = "That is already taken.") {
    super(message);
    this.name = "ConflictError";
  }
}

/** Postgres unique_violation, raw or wrapped by Drizzle. */
export function isUniqueViolation(error: unknown): boolean {
  for (let e = error; e instanceof Error || (e && typeof e === "object"); ) {
    if ((e as { code?: unknown }).code === "23505") return true;
    e = (e as { cause?: unknown }).cause;
  }
  return false;
}

export function assertRole(ctx: AccountContext, min: Role) {
  if (rank[ctx.role] < rank[min]) throw new ForbiddenError();
}

/** Owners and admins see every workspace; members only their granted ones. */
export function seesAllWorkspaces(ctx: AccountContext) {
  return ctx.role !== "member";
}

export function toRole(value: string): Role {
  return value === "owner" || value === "admin" ? value : "member";
}
