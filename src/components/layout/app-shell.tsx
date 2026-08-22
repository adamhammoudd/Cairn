import type { ReactNode } from "react";
import { TopNav } from "@/components/layout/top-nav";
import { ChatPanel } from "@/components/chat/chat-panel";

interface AppShellProps {
  displayName: string;
  plan: "free" | "premium";
  /** Adds the internal Operations link to the account menu. */
  isAdmin?: boolean;
  children: ReactNode;
}

export function AppShell({ displayName, plan, isAdmin = false, children }: AppShellProps) {
  // overflow-x-clip, not -hidden: `hidden` would make this a scroll container
  // and the sticky header would stop sticking.
  return (
    <div className="flex min-h-screen max-w-screen flex-col overflow-x-clip bg-canvas">
      <TopNav displayName={displayName} plan={plan} isAdmin={isAdmin} />
      <main className="mx-auto w-full max-w-[1560px] flex-1 overflow-auto px-5.5 pt-6.5 pb-15">{children}</main>
      <ChatPanel />
    </div>
  );
}
