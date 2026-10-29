import { env } from "@/lib/env";
import { signInternal } from "./internal-signature";

/** Worker side: ask the web app to refresh a workspace's public pages. */
export async function revalidateFromWorker(
  accountId: string,
  workspaceId: string,
) {
  const ts = Date.now();
  const signature = signInternal(
    env.BETTER_AUTH_SECRET,
    `${accountId}:${workspaceId}`,
    ts,
  );
  try {
    const res = await fetch(
      new URL("/api/internal/revalidate", env.NEXT_PUBLIC_APP_URL),
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ accountId, workspaceId, ts, signature }),
      },
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  } catch (error) {
    // Public pages also expire on their own within minutes.
    console.error("[worker] revalidate failed", workspaceId, error);
  }
}
