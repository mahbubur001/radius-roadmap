import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/server/db/client";
import { trackedUserSessions } from "@/server/db/schema";
import { cleanup, createTestAccount } from "@/test/factories";
import { NotFoundError, type PublicContext } from "./context";
import {
  createTrackedSession,
  getTrackedSession,
  getTrackedUser,
  identifyTrackedUser,
  revokeTrackedSession,
} from "./tracked-users";

let a: PublicContext;
let b: PublicContext;
const accounts: string[] = [];

beforeAll(async () => {
  a = { accountId: await createTestAccount(db, "voters-a") };
  b = { accountId: await createTestAccount(db, "voters-b") };
  accounts.push(a.accountId, b.accountId);
});

afterAll(() => cleanup(db, accounts, []));

describe("identifyTrackedUser", () => {
  it("keeps one row per email per account, case-insensitive", async () => {
    const first = await identifyTrackedUser(db, a, {
      kind: "guest",
      email: "Voter@Example.test",
      name: "Guest Name",
    });
    const again = await identifyTrackedUser(db, a, {
      kind: "guest",
      email: "voter@example.test",
    });
    expect(again.id).toBe(first.id);
    expect(again.email).toBe("voter@example.test");
  });

  it("the same email in another account is a different voter", async () => {
    const inA = await identifyTrackedUser(db, a, {
      kind: "guest",
      email: "same@example.test",
    });
    const inB = await identifyTrackedUser(db, b, {
      kind: "guest",
      email: "same@example.test",
    });
    expect(inB.id).not.toBe(inA.id);
    await expect(getTrackedUser(db, b, inA.id)).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it("verifying upgrades a guest; a later guest can't overwrite it", async () => {
    await identifyTrackedUser(db, a, {
      kind: "guest",
      email: "up@example.test",
      name: "Typed",
    });
    const verified = await identifyTrackedUser(db, a, {
      kind: "email",
      email: "up@example.test",
      name: "Real Name",
      verified: true,
    });
    expect(verified.kind).toBe("email");
    expect(verified.emailVerifiedAt).not.toBeNull();

    const spoof = await identifyTrackedUser(db, a, {
      kind: "guest",
      email: "up@example.test",
      name: "Impostor",
    });
    expect(spoof.id).toBe(verified.id);
    expect(spoof.name).toBe("Real Name");
    expect(spoof.kind).toBe("email");
  });

  it("matches SSO users by external id", async () => {
    const one = await identifyTrackedUser(db, a, {
      kind: "sso",
      externalId: "cust-42",
      email: "sso@example.test",
      verified: true,
    });
    const two = await identifyTrackedUser(db, a, {
      kind: "sso",
      externalId: "cust-42",
      email: "renamed@example.test",
      verified: true,
    });
    expect(two.id).toBe(one.id);
  });
});

describe("voter sessions", () => {
  it("resolves only in the right account and only until revoked", async () => {
    const voter = await identifyTrackedUser(db, a, {
      kind: "guest",
      email: "s@example.test",
    });
    const { token } = await createTrackedSession(db, a, voter.id);

    expect((await getTrackedSession(db, a, token))?.id).toBe(voter.id);
    expect(await getTrackedSession(db, b, token)).toBeNull();

    await revokeTrackedSession(db, a, token);
    expect(await getTrackedSession(db, a, token)).toBeNull();
  });

  it("stores only a hash and ignores expired sessions", async () => {
    const voter = await identifyTrackedUser(db, a, {
      kind: "guest",
      email: "x@example.test",
    });
    const { token } = await createTrackedSession(db, a, voter.id);
    const rows = await db
      .select()
      .from(trackedUserSessions)
      .where(eq(trackedUserSessions.trackedUserId, voter.id));
    expect(rows[0]?.tokenHash).not.toBe(token);

    await db
      .update(trackedUserSessions)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(trackedUserSessions.trackedUserId, voter.id));
    expect(await getTrackedSession(db, a, token)).toBeNull();
  });

  it("can't start a session for another account's voter", async () => {
    const voter = await identifyTrackedUser(db, a, {
      kind: "guest",
      email: "y@example.test",
    });
    await expect(createTrackedSession(db, b, voter.id)).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });
});
