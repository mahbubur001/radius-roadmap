import type { Metadata } from "next";
import { Suspense } from "react";
import { Forbidden } from "@/components/dashboard/forbidden";
import { SettingsSection } from "@/components/dashboard/settings-section";
import { ImageUpload } from "@/components/form/image-upload";
import { Skeleton } from "@/components/ui/skeleton";
import { db } from "@/server/db/client";
import { getAccount } from "@/server/services/accounts";
import { seesAllWorkspaces } from "@/server/services/context";
import { requireWorkspace } from "@/server/session";
import { fileUrl } from "@/server/storage";
import { AccountForm } from "./account-form";

export const metadata: Metadata = { title: "Account settings" };

export default function AccountSettingsPage({
  params,
}: PageProps<"/dashboard/[workspace]/settings/account">) {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <AccountSettings slug={params.then((p) => p.workspace)} />
    </Suspense>
  );
}

async function AccountSettings({ slug }: { slug: Promise<string> }) {
  const ctx = await requireWorkspace(await slug);
  if (!seesAllWorkspaces(ctx)) return <Forbidden what="account settings" />;
  const account = await getAccount(db, ctx);

  return (
    <>
      <SettingsSection
        title="Account logo"
        description="Your company logo. Workspaces can have their own logo too."
      >
        <ImageUpload
          purpose="account-logo"
          name={account.name}
          url={fileUrl(account.logo)}
          rounded="md"
        />
      </SettingsSection>
      <AccountForm defaults={{ name: account.name, slug: account.slug }} />
    </>
  );
}
