// Renders the REAL WatchlistPanel (and, through it, the real SymbolTypeahead)
// in a plain browser page, plus a name={null} clearOnSelect picker wired the
// way comparison-panel.tsx and global-search.tsx use it.
import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { WatchlistPanel } from "@/components/watchlists/watchlist-panel";
import { SymbolTypeahead } from "@/components/symbol-typeahead";
import { store } from "./stub-actions-watchlists";
import { DEFAULT_DISPLAY_PREFS } from "@/lib/watchlists";

store.lists = [{ id: "list-1", name: "Test list", description: null, displayPrefs: DEFAULT_DISPLAY_PREFS, sort_order: 0, items: [] }];

const picked: string[] = [];
Object.assign(window, { __store: store, __picked: picked });

function Harness() {
  const [lists, setLists] = useState(store.lists);
  useEffect(() => {
    store.onChange = () => setLists(store.lists.map((l) => ({ ...l, items: [...l.items] })));
  }, []);
  return (
    <>
      <section id="watchlist">
        <WatchlistPanel watchlists={lists} />
      </section>
      <section id="nameless">
        <SymbolTypeahead name={null} clearOnSelect required={false} placeholder="Nameless picker" onSelect={(r) => picked.push(r.symbol)} />
      </section>
    </>
  );
}

createRoot(document.getElementById("root")!).render(<Harness />);
