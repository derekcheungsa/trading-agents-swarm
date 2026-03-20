import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "./Badge";

interface MarkdownContentProps {
  content: string;
  className?: string;
}

export function MarkdownContent({ content, className }: MarkdownContentProps) {
  return (
    <div
      className={cn(
        "prose prose-sm max-w-none",
        "prose-invert",
        "prose-headings:font-display prose-headings:font-semibold prose-headings:text-foreground prose-headings:mb-2 prose-headings:mt-4 first:prose-headings:mt-0",
        "prose-h1:text-base prose-h2:text-sm prose-h3:text-xs prose-h3:uppercase prose-h3:tracking-wider prose-h3:text-muted-foreground",
        "prose-p:text-foreground/85 prose-p:leading-relaxed prose-p:my-1.5",
        "prose-strong:text-foreground prose-strong:font-semibold",
        "prose-em:text-foreground/80",
        "prose-ul:my-1.5 prose-ul:pl-4 prose-li:my-0.5 prose-li:text-foreground/85",
        "prose-ol:my-1.5 prose-ol:pl-4",
        "prose-code:text-primary prose-code:bg-primary/10 prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-[11px] prose-code:font-mono prose-code:before:content-none prose-code:after:content-none",
        "prose-pre:bg-black/60 prose-pre:border prose-pre:border-white/10 prose-pre:rounded-lg prose-pre:p-3 prose-pre:text-[11px] prose-pre:leading-relaxed prose-pre:overflow-x-auto",
        "prose-blockquote:border-l-2 prose-blockquote:border-primary/50 prose-blockquote:pl-3 prose-blockquote:text-muted-foreground prose-blockquote:not-italic",
        "prose-hr:border-white/10 prose-hr:my-3",
        "prose-table:text-xs prose-table:w-full",
        "prose-thead:border-b prose-thead:border-white/20",
        "prose-th:text-muted-foreground prose-th:font-semibold prose-th:uppercase prose-th:tracking-wider prose-th:text-[10px] prose-th:py-1.5 prose-th:px-2 prose-th:text-left",
        "prose-td:py-1.5 prose-td:px-2 prose-td:text-foreground/80 prose-td:border-b prose-td:border-white/5",
        "prose-tr:even:bg-white/[0.02]",
        className
      )}
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]}>
        {content}
      </ReactMarkdown>
    </div>
  );
}
