"use client";

import { useParams, useRouter } from "next/navigation";
import { useCallback } from "react";
import { toast } from "sonner";

/**
 * Shows a failed action's error. When the plan was the reason (`upgrade`),
 * the toast links to Settings → Billing (doc 26 6A).
 */
export function useActionError() {
  const router = useRouter();
  const { workspace } = useParams<{ workspace: string }>();
  return useCallback(
    (result: { error: string; upgrade?: true }) => {
      toast.error(
        result.error,
        result.upgrade
          ? {
              action: {
                label: "Upgrade",
                onClick: () =>
                  router.push(`/dashboard/${workspace}/settings/billing`),
              },
            }
          : undefined,
      );
    },
    [router, workspace],
  );
}
