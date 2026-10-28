import type { Metadata } from "next";
import { Suspense } from "react";
import { SettingsSection } from "@/components/dashboard/settings-section";
import { ImageUpload } from "@/components/form/image-upload";
import { Skeleton } from "@/components/ui/skeleton";
import { requireUser, requireWorkspace } from "@/server/session";
import { fileUrl } from "@/server/storage";
import {
  EmailForm,
  NameForm,
  PasswordForm,
  SessionsSection,
} from "./profile-forms";

export const metadata: Metadata = { title: "Profile" };

export default function ProfilePage({
  params,
}: PageProps<"/dashboard/[workspace]/settings/profile">) {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <Profile slug={params.then((p) => p.workspace)} />
    </Suspense>
  );
}

async function Profile({ slug }: { slug: Promise<string> }) {
  await requireWorkspace(await slug);
  const { user } = await requireUser();

  return (
    <>
      <SettingsSection title="Photo">
        <ImageUpload
          purpose="avatar"
          name={user.name}
          url={fileUrl(user.image ?? null)}
        />
      </SettingsSection>
      <NameForm name={user.name} />
      <EmailForm email={user.email} />
      <PasswordForm />
      <SessionsSection />
    </>
  );
}
