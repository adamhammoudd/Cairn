import { notFound } from "next/navigation";
import { getChatSession } from "@/lib/actions/chat";
import { getUserSettings } from "@/lib/actions/settings";
import { ChatSettingsPanel } from "@/components/chat/chat-settings-panel";

// A dedicated route, not a modal: managing a conversation is its own place in
// the app, and the Back control at the top-left returns to /assistant. Nested
// under /assistant/[sessionId] so the URL says which thread is being edited.
export default async function ChatSettingsPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;

  const [session, settings] = await Promise.all([getChatSession(sessionId), getUserSettings()]);
  // getChatSession is user-scoped, so another user's session id is
  // indistinguishable from a deleted one - both are a 404 here.
  if (!session) notFound();

  return (
    <ChatSettingsPanel
      session={session}
      accountDefaults={{
        expandMethodology: settings?.assistant_expand_methodology ?? true,
        usePortfolioContext: settings?.assistant_use_portfolio_context ?? true,
      }}
      fallbackTitle={`Chat — ${new Date(session.created_at).toLocaleDateString()}`}
    />
  );
}
