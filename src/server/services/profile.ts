import { eq } from "drizzle-orm";
import type { Db } from "@/server/db/client";
import { user } from "@/server/db/schema";

// The signed-in user's own profile. Not tenant data: always keyed by the
// session's user id, never by an id from the client.

/** Sets the avatar's storage key and returns the previous one. */
export async function setUserImage(
  db: Db,
  userId: string,
  image: string | null,
) {
  const [current] = await db
    .select({ image: user.image })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);
  await db.update(user).set({ image }).where(eq(user.id, userId));
  return current?.image ?? null;
}
