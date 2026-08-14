import type { ReactNode } from "react";
import { TopNav } from "@/components/layout/top-nav";
import { ChatPanel } from "@/components/chat/chat-panel";

interface AppShellProps {
  displayName: string;
  plan: "free" | "premium";
  children: ReactNode;
}

export function AppShell({ displayName, plan, children }: AppShellProps) {
  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <TopNav displayName={displayName} plan={plan} />
      <main className="flex-1 overflow-auto p-7 lg:p-8">{children}</main>
      <ChatPanel />
    </div>
  );
}
