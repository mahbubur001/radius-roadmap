import type { ReactNode } from "react";
import { initials } from "@/lib/initials";
import { PLANS, type PlanId } from "@/lib/plans";
import { cn } from "@/lib/utils";

// Small building blocks shared by the operator console pages.

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="flex flex-col gap-1.5">
        {eyebrow ? (
          <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
            {eyebrow}
          </p>
        ) : null}
        <h1 className="text-[28px] font-semibold leading-tight tracking-[-0.02em]">
          {title}
        </h1>
        {description ? (
          <p className="max-w-2xl text-sm text-muted-foreground">
            {description}
          </p>
        ) : null}
      </div>
      {actions ? <div className="flex gap-2">{actions}</div> : null}
    </div>
  );
}

export function Panel({
  title,
  action,
  children,
  className,
}: {
  title?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "flex flex-col rounded-xl border bg-card shadow-[0_1px_2px_oklch(0.2_0.03_270/0.04)]",
        className,
      )}
    >
      {title ? (
        <div className="flex items-center justify-between gap-3 border-b px-5 py-3.5">
          <h2 className="text-sm font-semibold">{title}</h2>
          {action}
        </div>
      ) : null}
      <div className="flex flex-1 flex-col p-5">{children}</div>
    </section>
  );
}

/** Plan as a pill: Pro in emerald, Free quiet; "granted" when set by us. */
export function PlanPill({
  plan,
  granted,
}: {
  plan: PlanId;
  granted?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium",
        plan === "pro"
          ? "bg-(--admin-pro)/12 text-(--admin-pro)"
          : "bg-muted text-muted-foreground",
      )}
    >
      {PLANS[plan].name}
      {granted ? (
        <span className="font-mono text-[10px] uppercase tracking-wider opacity-80">
          granted
        </span>
      ) : null}
    </span>
  );
}

export type Status = "active" | "suspended" | "awaiting_owner";

const STATUS: Record<Status, { label: string; dot: string }> = {
  active: { label: "Active", dot: "bg-(--admin-pro)" },
  suspended: { label: "Suspended", dot: "bg-(--admin-danger)" },
  awaiting_owner: { label: "Waiting for owner", dot: "bg-(--admin-warn)" },
};

export function StatusDot({ status }: { status: Status }) {
  const s = STATUS[status];
  return (
    <span className="inline-flex items-center gap-2 text-xs text-muted-foreground">
      <span className={cn("size-1.5 rounded-full", s.dot)} />
      {s.label}
    </span>
  );
}

export function AccountMark({
  name,
  size = "md",
}: {
  name: string;
  size?: "md" | "lg";
}) {
  return (
    <span
      className={cn(
        "grid shrink-0 place-items-center rounded-lg bg-primary/10 font-semibold text-primary",
        size === "lg" ? "size-14 text-lg" : "size-9 text-xs",
      )}
    >
      {initials(name)}
    </span>
  );
}

export const shortDate = new Intl.DateTimeFormat("en", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

/** "3 days ago", "in 5 days", "today". */
export function relative(date: Date, now = new Date()) {
  const days = Math.round((date.getTime() - now.getTime()) / 86_400_000);
  if (days === 0) return "today";
  return new Intl.RelativeTimeFormat("en", { numeric: "auto" }).format(
    days,
    "day",
  );
}
