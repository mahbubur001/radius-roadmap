import { ShieldAlert } from "lucide-react";

/** Shown in place of admin-only pages for members (403, not a redirect). */
export function Forbidden({ what = "this page" }: { what?: string }) {
  return (
    <div className="flex flex-col items-start gap-2 rounded-lg border p-6">
      <ShieldAlert className="size-5 text-muted-foreground" />
      <h3 className="font-medium">You don&apos;t have access to {what}</h3>
      <p className="text-sm text-muted-foreground">
        Only account owners and admins can change these settings.
      </p>
    </div>
  );
}
