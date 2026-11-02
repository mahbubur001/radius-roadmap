import { Suspense } from "react";
import { SettingsNav } from "@/components/dashboard/settings-nav";
import { billing } from "@/server/services/plan-limits";

export default function SettingsLayout({
  children,
}: LayoutProps<"/dashboard/[workspace]/settings">) {
  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <h2 className="font-display text-[28px] font-semibold tracking-[-0.02em]">
        Settings
      </h2>
      <div className="flex flex-col gap-8 md:flex-row">
        <aside className="md:sticky md:top-0 md:w-52 md:self-start">
          <Suspense fallback={null}>
            <SettingsNav billing={billing.enabled()} />
          </Suspense>
        </aside>
        <div className="flex min-w-0 flex-1 flex-col gap-6">{children}</div>
      </div>
    </div>
  );
}
