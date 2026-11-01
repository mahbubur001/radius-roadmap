import { eq } from "drizzle-orm";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { db } from "@/server/db/client";
import { member } from "@/server/db/schema";
import {
  addTestMember,
  cleanup,
  createTestAccount,
  createTestUser,
} from "@/test/factories";
import {
  createApiKey,
  listApiKeys,
  revokeApiKey,
  verifyApiKey,
} from "./api-keys";
import {
  type AccountContext,
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from "./context";
import { billing, PlanLimitError } from "./plan-limits";
import { removeMember } from "./team";

// Public REST API keys (doc 27 step 1).

let owner: AccountContext; // account A
let admin: AccountContext; // account A
let mate: AccountContext; // member, account A
let other: AccountContext; // owner, account B
const accounts: string[] = [];
const users: string[] = [];

beforeAll(async () => {
  const [a, b] = [
    await createTestAccount(db, "key-a"),
    await createTestAccount(db, "key-b"),
  ];
  const ids = [
    await createTestUser(db, "key-owner"),
    await createTestUser(db, "key-admin"),
    await createTestUser(db, "key-member"),
    await createTestUser(db, "key-other"),
  ];
  accounts.push(a, b);
  users.push(...ids);
  owner = await addTestMember(db, a, ids[0] as string, "owner");
  admin = await addTestMember(db, a, ids[1] as string, "admin");
  mate = await addTestMember(db, a, ids[2] as string, "member");
  other = await addTestMember(db, b, ids[3] as string, "owner");
});

afterAll(() => cleanup(db, accounts, users));

afterEach(() => {
  vi.restoreAllMocks();
});

describe("API keys", () => {
  it("are created by owners and admins, shown once, stored hashed", async () => {
    await expect(
      createApiKey(db, mate, { name: "x", permission: "read" }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    const { id, key } = await createApiKey(db, owner, {
      name: "Zapier",
      permission: "write",
    });
    expect(key).toMatch(/^rr_live_[\w-]{32}$/);
    const list = await listApiKeys(db, owner);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({
      id,
      name: "Zapier",
      prefix: key.slice(0, 16),
    });
    expect(JSON.stringify(list)).not.toContain(key);
    expect(await listApiKeys(db, other)).toHaveLength(0);

    const caller = await verifyApiKey(db, key);
    expect(caller).toMatchObject({
      keyId: id,
      permission: "write",
      ctx: { accountId: owner.accountId, userId: owner.userId, role: "owner" },
    });
    expect(await verifyApiKey(db, `${key}x`)).toBeNull();
    expect(await verifyApiKey(db, "not-a-key")).toBeNull();
  });

  it("revoked keys stop working; another account can't revoke them", async () => {
    const { id, key } = await createApiKey(db, owner, {
      name: "Temp",
      permission: "read",
    });
    await expect(revokeApiKey(db, other, id)).rejects.toBeInstanceOf(
      NotFoundError,
    );
    expect(await verifyApiKey(db, key)).not.toBeNull();
    await revokeApiKey(db, admin, id);
    expect(await verifyApiKey(db, key)).toBeNull();
  });

  it("stop working when the creator leaves or is no longer an admin", async () => {
    const { key } = await createApiKey(db, admin, {
      name: "Admin's",
      permission: "read",
    });
    await db
      .update(member)
      .set({ role: "member" })
      .where(eq(member.userId, admin.userId));
    expect(await verifyApiKey(db, key)).toBeNull();
    await db
      .update(member)
      .set({ role: "admin" })
      .where(eq(member.userId, admin.userId));
    expect(await verifyApiKey(db, key)).not.toBeNull();

    const [row] = await db
      .select({ id: member.id })
      .from(member)
      .where(eq(member.userId, admin.userId));
    await removeMember(db, owner, row?.id ?? "");
    expect(await verifyApiKey(db, key)).toBeNull();
    expect((await listApiKeys(db, owner)).map((k) => k.name)).not.toContain(
      "Admin's",
    );
  });

  it("need the Enterprise plan when billing is on", async () => {
    const { key } = await createApiKey(db, other, {
      name: "B",
      permission: "read",
    });
    vi.spyOn(billing, "enabled").mockReturnValue(true); // B is on Free
    expect(await verifyApiKey(db, key)).toBeNull();
    await expect(
      createApiKey(db, other, { name: "C", permission: "read" }),
    ).rejects.toBeInstanceOf(PlanLimitError);
  });

  it("are limited to 10 per account", async () => {
    const existing = (await listApiKeys(db, other)).length;
    for (let i = existing; i < 10; i++) {
      await createApiKey(db, other, { name: `k${i}`, permission: "read" });
    }
    await expect(
      createApiKey(db, other, { name: "eleventh", permission: "read" }),
    ).rejects.toBeInstanceOf(ConflictError);
  });
});
