import { randomUUID } from "node:crypto";
import { inArray } from "drizzle-orm";
import type { Db } from "@/server/db/client";
import { member, organization, user } from "@/server/db/schema";
import type { AccountContext, Role } from "@/server/services/context";

// Direct inserts for service tests. Each test file creates its own
// accounts/users with random ids and deletes them in afterAll.

export async function createTestAccount(db: Db, label = "acct") {
  const id = `test-${label}-${randomUUID()}`;
  await db
    .insert(organization)
    .values({ id, name: label, slug: id, createdAt: new Date() });
  return id;
}

export async function createTestUser(db: Db, label = "user") {
  const id = `test-${label}-${randomUUID()}`;
  await db.insert(user).values({
    id,
    name: label,
    email: `${id}@example.test`,
    emailVerified: true,
  });
  return id;
}

/** Adds `userId` to the account with `role` and returns their context. */
export async function addTestMember(
  db: Db,
  accountId: string,
  userId: string,
  role: Role,
): Promise<AccountContext> {
  await db.insert(member).values({
    id: randomUUID(),
    organizationId: accountId,
    userId,
    role,
    createdAt: new Date(),
  });
  return { accountId, userId, role };
}

export async function cleanup(db: Db, accountIds: string[], userIds: string[]) {
  if (accountIds.length) {
    await db.delete(organization).where(inArray(organization.id, accountIds));
  }
  if (userIds.length) await db.delete(user).where(inArray(user.id, userIds));
}
