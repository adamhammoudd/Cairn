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
      <main className="mx-auto w-full max-w-[1560px] flex-1 overflow-auto px-5.5 pt-6.5 pb-15 sm:px-7">{children}</main>
      <ChatPanel />
    </div>
  );
}
