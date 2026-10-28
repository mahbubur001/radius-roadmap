import { Suspense } from "react";
import { SettingsNav } from "@/components/dashboard/settings-nav";

export default function SettingsLayout({
  children,
}: LayoutProps<"/dashboard/[workspace]/settings">) {
  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <h2 className="text-2xl font-semibold tracking-tight">Settings</h2>
      <div className="flex flex-col gap-6 md:flex-row">
        <aside className="md:w-48">
          <Suspense fallback={null}>
            <SettingsNav />
          </Suspense>
        </aside>
        <div className="flex min-w-0 flex-1 flex-col gap-6">{children}</div>
      </div>
    </div>
  );
}
