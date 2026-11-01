import Link from "next/link";

// One row per admin action (doc 28 C9), shared by Activity and account pages.

const LABELS: Record<string, string> = {
  "customer.invited": "Invited the customer",
  "customer.invite_resent": "Resent the owner invitation",
  "customer.invite_cancelled": "Cancelled the owner invitation",
  "plan_override.set": "Set a plan",
  "plan_override.ended": "Ended the granted plan",
  "account.suspended": "Suspended the account",
  "account.unsuspended": "Restored the account",
};

const timeFormat = new Intl.DateTimeFormat("en", {
  dateStyle: "medium",
  timeStyle: "short",
});

export function AuditList({
  rows,
  showAccount,
}: {
  rows: {
    id: string;
    adminEmail: string;
    action: string;
    accountId: string | null;
    accountName: string | null;
    details: Record<string, unknown>;
    createdAt: Date;
  }[];
  showAccount: boolean;
}) {
  if (!rows.length) {
    return <p className="text-sm text-muted-foreground">Nothing yet.</p>;
  }
  return (
    <ul className="flex flex-col divide-y rounded-md border text-sm">
      {rows.map((r) => (
        <li key={r.id} className="flex flex-col gap-0.5 px-4 py-2.5">
          <span>
            <strong>{LABELS[r.action] ?? r.action}</strong>
            {showAccount ? (
              <>
                {" · "}
                {r.accountId ? (
                  <Link
                    href={`/admin/accounts/${r.accountId}`}
                    className="underline"
                  >
                    {r.accountName}
                  </Link>
                ) : (
                  <span className="text-muted-foreground">deleted account</span>
                )}
              </>
            ) : null}
          </span>
          <span className="text-xs text-muted-foreground">
            {timeFormat.format(r.createdAt)} · {r.adminEmail}
            {Object.keys(r.details).length
              ? ` · ${Object.entries(r.details)
                  .filter(([, v]) => v !== null && v !== "")
                  .map(([k, v]) => `${k}: ${String(v)}`)
                  .join(", ")}`
              : ""}
          </span>
        </li>
      ))}
    </ul>
  );
}
