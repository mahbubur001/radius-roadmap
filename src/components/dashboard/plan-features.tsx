"use client";

import { Lock } from "lucide-react";
import Link from "next/link";
import { createContext, useContext } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";

// What the account's plan includes, for the dashboard UI (doc 29 T8). The
// server checks every upload anyway; this only shows the "Pro" walls early.
// Outside the dashboard (no provider) everything counts as included.

type PlanFeatures = {
  /** Images in content and card attachments (Pro). */
  uploads: boolean;
  /** Settings → Billing, or null when billing is off. */
  billingHref: string | null;
};

const Context = createContext<PlanFeatures>({
  uploads: true,
  billingHref: null,
});

export function PlanFeaturesProvider({
  value,
  children,
}: {
  value: PlanFeatures;
  children: React.ReactNode;
}) {
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function usePlanFeatures() {
  return useContext(Context);
}

/** The upgrade toast for a Pro-only action. */
export function useProWall() {
  const { billingHref } = usePlanFeatures();
  return (what: string) =>
    toast.error(`${what} need the Pro plan.`, {
      action: billingHref
        ? {
            label: "Upgrade",
            onClick: () => {
              window.location.href = billingHref;
            },
          }
        : undefined,
    });
}

/** Small "Pro" badge next to a locked control; links to Billing. */
export function ProBadge() {
  const { uploads, billingHref } = usePlanFeatures();
  if (uploads) return null;
  const badge = (
    <Badge variant="secondary" className="gap-1">
      <Lock className="size-3" />
      Pro
    </Badge>
  );
  return billingHref ? (
    <Link href={billingHref} className="cursor-pointer">
      {badge}
    </Link>
  ) : (
    badge
  );
}
