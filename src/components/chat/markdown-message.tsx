import { Fragment } from "react";
import { parseBlocks, type Block, type InlineNode } from "@/lib/ai/markdown";

// Renders an assistant reply as real markdown inside the chat bubble. The
// parser (lib/ai/markdown.ts) is intentionally small; this component is the
// only place its AST is turned into elements. Spacing is tuned for a 660px
// bubble - tighter than prose defaults, no top margin on the first block.

function renderInline(nodes: InlineNode[]): React.ReactNode {
  return nodes.map((node, i) => {
    switch (node.type) {
      case "text":
        return <Fragment key={i}>{node.value}</Fragment>;
      case "strong":
        return (
          <strong key={i} className="font-semibold text-primary">
            {renderInline(node.children)}
          </strong>
        );
      case "em":
        return (
          <em key={i} className="italic">
            {renderInline(node.children)}
          </em>
        );
      case "code":
        return (
          <code key={i} className="rounded bg-active px-1 py-0.5 font-mono text-[0.85em] text-primary">
            {node.value}
          </code>
        );
      case "link":
        return (
          <a
            key={i}
            href={node.href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-accent underline decoration-accent/40 underline-offset-2 hover:decoration-accent"
          >
            {node.label}
          </a>
        );
    }
  });
}

function renderBlock(block: Block, i: number): React.ReactNode {
  switch (block.type) {
    case "heading": {
      // h1/h2 -> a serif sub-title; h3+ -> the mock's uppercase mono label.
      if (block.level <= 2) {
        return (
          <h3 key={i} className="mt-3 mb-1.5 font-serif text-[15px] font-normal text-primary first:mt-0">
            {renderInline(block.children)}
          </h3>
        );
      }
      return (
        <h4
          key={i}
          className="mt-3 mb-1 font-mono text-[10px] tracking-[0.14em] text-muted uppercase first:mt-0"
        >
          {renderInline(block.children)}
        </h4>
      );
    }
    case "paragraph":
      return (
        <p key={i} className="mt-2 first:mt-0">
          {renderInline(block.children)}
        </p>
      );
    case "list": {
      const ListTag = block.ordered ? "ol" : "ul";
      return (
        <ListTag
          key={i}
          className={`mt-2 flex flex-col gap-1 first:mt-0 ${
            block.ordered ? "list-decimal" : "list-disc"
          } pl-5 marker:text-dim`}
        >
          {block.items.map((item, j) => (
            <li key={j}>{renderInline(item)}</li>
          ))}
        </ListTag>
      );
    }
    case "rule":
      return <hr key={i} className="my-3 border-line" />;
  }
}

export function MarkdownMessage({ content }: { content: string }) {
  const blocks = parseBlocks(content);
  return <div className="[&_a]:break-words">{blocks.map(renderBlock)}</div>;
}
