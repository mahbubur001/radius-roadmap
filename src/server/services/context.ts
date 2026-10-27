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

export function assertRole(ctx: AccountContext, min: Role) {
  if (rank[ctx.role] < rank[min]) throw new ForbiddenError();
}

export function toRole(value: string): Role {
  return value === "owner" || value === "admin" ? value : "member";
}
