import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthCard } from "@/components/auth/auth-card";
import { AcceptInvite } from "./accept-invite";

export const metadata: Metadata = { title: "Accept invitation" };

export default function AcceptInvitePage({
  params,
}: PageProps<"/accept-invite/[id]">) {
  return (
    <AuthCard title="Join your team">
      <Suspense fallback={null}>
        <AcceptInvite idPromise={params.then((p) => p.id)} />
      </Suspense>
    </AuthCard>
  );
}
