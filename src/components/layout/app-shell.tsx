import type { ReactNode } from "react";
import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";

interface AppShellProps {
  displayName: string;
  plan: "free" | "premium";
  children: ReactNode;
}

export function AppShell({ displayName, plan, children }: AppShellProps) {
  return (
    <div className="flex min-h-screen bg-canvas">
      <Sidebar displayName={displayName} plan={plan} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Header />
        <main className="flex-1 overflow-auto p-7 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
