import {
  Ban,
  CircleCheck,
  Gift,
  type LucideIcon,
  MailPlus,
  MailX,
  RotateCw,
  TimerOff,
} from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

// Admin actions as a timeline (doc 28 C9), shared by Activity and account pages.

const ACTIONS: Record<
  string,
  { label: string; icon: LucideIcon; tone: string }
> = {
  "customer.invited": {
    label: "Invited the customer",
    icon: MailPlus,
    tone: "text-primary bg-primary/10",
  },
  "customer.invite_resent": {
    label: "Resent the owner invitation",
    icon: RotateCw,
    tone: "text-primary bg-primary/10",
  },
  "customer.invite_cancelled": {
    label: "Cancelled the owner invitation",
    icon: MailX,
    tone: "text-muted-foreground bg-muted",
  },
  "plan_override.set": {
    label: "Set a plan",
    icon: Gift,
    tone: "text-(--admin-pro) bg-(--admin-pro)/12",
  },
  "plan_override.ended": {
    label: "Ended the granted plan",
    icon: TimerOff,
    tone: "text-(--admin-warn) bg-(--admin-warn)/15",
  },
  "account.suspended": {
    label: "Suspended the account",
    icon: Ban,
    tone: "text-(--admin-danger) bg-(--admin-danger)/10",
  },
  "account.unsuspended": {
    label: "Restored the account",
    icon: CircleCheck,
    tone: "text-(--admin-pro) bg-(--admin-pro)/12",
  },
};

const timeFormat = new Intl.DateTimeFormat("en", {
  dateStyle: "medium",
  timeStyle: "short",
});

/** "plan: pro, endsAt: …" → readable detail, skipping empty values. */
function detail(details: Record<string, unknown>) {
  return Object.entries(details)
    .filter(([, v]) => v !== null && v !== "" && v !== undefined)
    .map(
      ([k, v]) => `${k.replace(/([A-Z])/g, " $1").toLowerCase()}: ${String(v)}`,
    )
    .join(" · ");
}

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
    return (
      <p className="py-6 text-center text-sm text-muted-foreground">
        No admin actions yet.
      </p>
    );
  }
  return (
    <ol className="relative flex flex-col">
      {rows.map((r, i) => {
        const a = ACTIONS[r.action] ?? {
          label: r.action,
          icon: CircleCheck,
          tone: "bg-muted text-muted-foreground",
        };
        const Icon = a.icon;
        const extra = detail(r.details);
        return (
          <li key={r.id} className="relative flex gap-4 pb-5 last:pb-0">
            {i < rows.length - 1 ? (
              <span
                className="absolute top-9 bottom-0 left-4 w-px bg-border"
                aria-hidden
              />
            ) : null}
            <span
              className={cn(
                "relative grid size-8 shrink-0 place-items-center rounded-full",
                a.tone,
              )}
            >
              <Icon className="size-4" />
            </span>
            <div className="flex min-w-0 flex-col gap-0.5 pt-1">
              <p className="text-sm">
                <span className="font-medium">{a.label}</span>
                {showAccount ? (
                  <>
                    <span className="text-muted-foreground"> · </span>
                    {r.accountId ? (
                      <Link
                        href={`/admin/accounts/${r.accountId}`}
                        className="text-primary hover:underline"
                      >
                        {r.accountName}
                      </Link>
                    ) : (
                      <span className="text-muted-foreground">
                        deleted account
                      </span>
                    )}
                  </>
                ) : null}
              </p>
              {extra ? (
                <p className="truncate text-xs text-muted-foreground">
                  {extra}
                </p>
              ) : null}
              <p className="font-mono text-[11px] text-muted-foreground">
                {timeFormat.format(r.createdAt)} · {r.adminEmail}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
