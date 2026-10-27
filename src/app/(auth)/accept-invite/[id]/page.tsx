import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthCard } from "@/components/auth/auth-card";
import { db } from "@/server/db/client";
import { getInvitationPreview } from "@/server/services/invitations";
import { getSession } from "@/server/session";
import { AcceptInvite } from "./accept-invite";

export const metadata: Metadata = { title: "Accept invitation" };

export default function AcceptInvitePage({
  params,
}: PageProps<"/accept-invite/[id]">) {
  return (
    <Suspense fallback={<AuthCard title="Join your team">{null}</AuthCard>}>
      <Invite id={params.then((p) => p.id)} />
    </Suspense>
  );
}

async function Invite({ id: idPromise }: { id: Promise<string> }) {
  const id = await idPromise;
  const [preview, session] = await Promise.all([
    getInvitationPreview(db, id),
    getSession(),
  ]);

  if (!preview?.usable) {
    return (
      <AuthCard
        title="Invitation not available"
        description="This invitation was canceled, already used, or has expired. Ask whoever invited you to send a new one."
      >
        {null}
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title={`Join ${preview.accountName}`}
      description={`${preview.inviterName} invited ${preview.email} to join ${preview.accountName} on Radius Roadmap.`}
    >
      <AcceptInvite
        invitationId={id}
        invitedEmail={preview.email}
        signedInEmail={session?.user.email ?? null}
      />
    </AuthCard>
  );
}
