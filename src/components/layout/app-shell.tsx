import type { ReactNode } from "react";
import { TopNav } from "@/components/layout/top-nav";
import { PageWash } from "@/components/layout/page-wash";
import { PageToneProvider } from "@/components/layout/page-tone";
import { ScrollbarWidthVar } from "@/components/layout/scrollbar-width-var";
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
      {/* The chart on a page reports which way it points; the wash reads it.
          See layout/page-tone.tsx. */}
      <PageToneProvider>
      <div
        data-density={displayPrefs.compactMode ? "compact" : "comfortable"}
        className="relative isolate flex min-h-screen max-w-screen flex-col overflow-x-clip bg-canvas"
      >
        {/* Anchored to this element, not to the content column, so the
            corner washes reach the real page edges. See page-wash.tsx. */}
        <PageWash />
        <ScrollbarWidthVar />
        <TopNav displayName={displayName} plan={plan} isAdmin={isAdmin} />
        {/* The assistant button is fixed at bottom-6 and is 56px tall, so it
            covers the bottom 80px of the viewport's right edge - but the page
            reserved only 60px, which put it on top of whatever landed in that
            corner ("See all analogs" on a ticker, the last row of a table).
            The extra padding applies from 900px, the same breakpoint that
            shows the button. */}
        <main className="mx-auto w-full max-w-[1560px] flex-1 overflow-auto px-5.5 pt-6.5 pb-15 min-[900px]:pb-28">
          {children}
        </main>
        <ChatPanel />
      </div>
      </PageToneProvider>
    </DisplayPrefsProvider>
  );
}
