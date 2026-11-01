"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { deleteAccountAction } from "@/app/(dashboard)/_actions/workspaces";
import { SettingsSection } from "@/components/dashboard/settings-section";
import { ConfirmDelete } from "@/components/form/confirm-delete";

/** Owner only: delete the account with everything in it (doc 26 6A). */
export function DeleteAccount({
  name,
  paying,
}: {
  name: string;
  paying: boolean;
}) {
  const router = useRouter();
  return (
    <SettingsSection
      title="Delete account"
      description="Deletes every workspace, roadmap, idea, update, article, file and teammate in this account. This can't be undone."
    >
      <div>
        <ConfirmDelete
          trigger="Delete account"
          title={`Delete ${name}?`}
          description={`Everything in ${name} is deleted for good${
            paying
              ? ", and your subscription is cancelled now without a refund"
              : ""
          }. Your own sign-in stays.`}
          confirmText={name}
          actionLabel="Delete account"
          onConfirm={async () => {
            const result = await deleteAccountAction({ confirmName: name });
            if (!result.ok) {
              toast.error(result.error);
              return false;
            }
            toast.success("Account deleted.");
            router.push("/");
            router.refresh();
            return true;
          }}
        />
      </div>
    </SettingsSection>
  );
}
