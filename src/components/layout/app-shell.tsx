import type { ReactNode } from "react";
import { TopNav } from "@/components/layout/top-nav";
import { ChatPanel } from "@/components/chat/chat-panel";
import { DisplayPrefsProvider } from "@/components/display-prefs-provider";
import { DEFAULT_DISPLAY_PREFS, type DisplayPrefs } from "@/lib/display-prefs";

interface AppShellProps {
  displayName: string;
  plan: "free" | "premium";
  /** Adds the internal Operations link to the account menu. */
  isAdmin?: boolean;
  /** Resolved in the app layout - see lib/actions/display-prefs.ts. */
  displayPrefs?: DisplayPrefs;
  children: ReactNode;
}

export function AppShell({
  displayName,
  plan,
  isAdmin = false,
  displayPrefs = DEFAULT_DISPLAY_PREFS,
  children,
}: AppShellProps) {
  // overflow-x-clip, not -hidden: `hidden` would make this a scroll container
  // and the sticky header would stop sticking.
  //
  // data-density carries the compact-mode setting to the one CSS rule in
  // globals.css that tightens every `.cn-row` in the app. Doing it with an
  // attribute on the root rather than a prop on each table is what makes the
  // toggle reach surfaces uniformly instead of the three someone remembered.
  return (
    <DisplayPrefsProvider value={displayPrefs}>
      <div
        data-density={displayPrefs.compactMode ? "compact" : "comfortable"}
        className="flex min-h-screen max-w-screen flex-col overflow-x-clip bg-canvas"
      >
        <TopNav displayName={displayName} plan={plan} isAdmin={isAdmin} />
        <main className="mx-auto w-full max-w-[1560px] flex-1 overflow-auto px-5.5 pt-6.5 pb-15">{children}</main>
        <ChatPanel />
      </div>
    </DisplayPrefsProvider>
  );
}
