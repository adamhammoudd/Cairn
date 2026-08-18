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
    <div>
      <TopNav displayName={displayName} plan={plan} />
      <main>{children}</main>
      <ChatPanel />
    </div>
  );
}
