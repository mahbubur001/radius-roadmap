import { ago } from "@/lib/time";
import type { listVoters } from "@/server/services/votes";

export type Voters = Awaited<ReturnType<typeof listVoters>>;

/** Admin "Votes" tab: named voters, anonymous and imported counts. */
export function VotersList({ voters }: { voters: Voters }) {
  const total = voters.named.length + voters.anonymous + voters.imported;
  if (!total) {
    return <p className="text-sm text-muted-foreground">No votes yet.</p>;
  }
  return (
    <div className="flex flex-col gap-3 text-sm">
      <ul className="flex flex-col divide-y rounded-md border">
        {voters.named.map((v) => (
          <li key={v.id} className="flex items-center gap-2 px-3 py-2">
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{v.name || v.email}</p>
              <p className="truncate text-xs text-muted-foreground">
                {v.email}
                {v.kind === "guest" ? " · guest (unverified)" : ""}
              </p>
              <p
                className="text-xs text-muted-foreground"
                suppressHydrationWarning
              >
                {ago(new Date(v.createdAt))}
              </p>
            </div>
            <span className="text-xs text-muted-foreground">
              {[v.city, v.country].filter(Boolean).join(", ")}
            </span>
          </li>
        ))}
        {voters.anonymous ? (
          <li className="px-3 py-2 text-muted-foreground">
            {voters.anonymous} anonymous{" "}
            {voters.anonymous === 1 ? "vote" : "votes"}
          </li>
        ) : null}
        {voters.imported ? (
          <li className="px-3 py-2 text-muted-foreground">
            {voters.imported} imported from LoopedIn
          </li>
        ) : null}
      </ul>
    </div>
  );
}
