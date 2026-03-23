import { motion } from "framer-motion";
import { Swords, RefreshCw, Sparkles } from "lucide-react";
import { MarkdownContent } from "./MarkdownContent";
import { type DeliberationState } from "@/hooks/use-deliberation";

interface DeliberationCardProps {
  state: DeliberationState;
  onGenerate: () => void;
}

export function DeliberationCard({ state, onGenerate }: DeliberationCardProps) {
  return (
    <div className="glass-panel rounded-2xl p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-warning/20 border border-warning/30 flex items-center justify-center">
            <Swords className="h-5 w-5 text-warning" />
          </div>
          <div>
            <h3 className="font-display font-bold text-base">Investment Committee Deliberation</h3>
            <p className="text-xs text-muted-foreground font-mono">Structured bull/bear debate · GLM-5</p>
          </div>
        </div>
        {state.status === "done" && (
          <button
            onClick={onGenerate}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors font-mono px-3 py-1.5 rounded-lg border border-border hover:border-foreground/20"
          >
            <RefreshCw className="h-3 w-3" />
            Regenerate
          </button>
        )}
      </div>

      {/* Idle — show generate CTA */}
      {state.status === "idle" && (
        <div className="flex flex-col items-center justify-center py-8 gap-4">
          <p className="text-sm text-muted-foreground text-center max-w-sm">
            Convene a structured bull vs bear debate — models argue against each other with devil's advocate challenges and a committee verdict.
          </p>
          <button
            onClick={onGenerate}
            className="flex items-center gap-2 bg-warning/10 hover:bg-warning/20 border border-warning/30 hover:border-warning/50 text-warning font-mono text-sm px-5 py-2.5 rounded-xl transition-all"
          >
            <Sparkles className="h-4 w-4" />
            Convene Deliberation
          </button>
        </div>
      )}

      {/* Loading skeleton */}
      {state.status === "loading" && (
        <div className="space-y-3">
          {[100, 75, 90, 60, 80].map((w, i) => (
            <div
              key={i}
              className="h-3 bg-white/5 rounded animate-pulse"
              style={{ width: `${w}%` }}
            />
          ))}
          <p className="text-xs text-muted-foreground font-mono mt-6 animate-pulse">
            Convening investment committee deliberation… this may take 30–60s
          </p>
        </div>
      )}

      {/* Error */}
      {state.status === "error" && (
        <div className="p-4 bg-destructive/10 border border-destructive/30 rounded-xl">
          <p className="text-destructive font-mono text-sm">{state.error}</p>
          <button
            onClick={onGenerate}
            className="mt-3 text-xs text-muted-foreground hover:text-foreground font-mono underline"
          >
            Try again
          </button>
        </div>
      )}

      {/* Deliberation output */}
      {state.status === "done" && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <MarkdownContent content={state.deliberation} />
        </motion.div>
      )}
    </div>
  );
}
