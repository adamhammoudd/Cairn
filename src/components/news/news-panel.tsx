import type { NewsFeedItem } from "@/lib/news";

const RELEVANCE_LABEL: Record<NewsFeedItem["relevance"], string> = {
  holding: "In your portfolio",
  sector: "Matches your sectors",
  general: "Market-wide",
};

const RELEVANCE_COLOR: Record<NewsFeedItem["relevance"], string> = {
  holding: "text-accent",
  sector: "text-info",
  general: "text-muted",
};

export function NewsPanel({ items }: { items: NewsFeedItem[] }) {
  if (items.length === 0) {
    return (
      <div className="rounded-card border border-dashed border-line p-12 text-center text-sm text-muted">
        No news ingested yet.
      </div>
    );
  }

  return (
    <div className="flex max-w-[720px] flex-col gap-3">
      {items.map((item) => (
        <a
          key={item.id}
          href={item.url ?? undefined}
          target={item.url ? "_blank" : undefined}
          rel={item.url ? "noreferrer" : undefined}
          className="rounded-card border border-line bg-panel p-5 transition-colors duration-fast ease-standard hover:bg-active"
        >
          <div className="mb-2 flex items-center gap-2 text-[11px] tracking-[0.06em] uppercase">
            <span className={RELEVANCE_COLOR[item.relevance]}>{RELEVANCE_LABEL[item.relevance]}</span>
            {item.matchedOn.length > 0 && (
              <span className="text-dim normal-case">· {item.matchedOn.join(", ")}</span>
            )}
          </div>
          <div className="text-[14px] text-primary">{item.title}</div>
          <div className="mt-1.5 text-[12px] text-muted">
            {item.source_name} · {new Date(item.published_at).toLocaleDateString()}
          </div>
        </a>
      ))}
    </div>
  );
}
