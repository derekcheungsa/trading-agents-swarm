import { motion } from "framer-motion";
import { Target, RefreshCw, Sparkles } from "lucide-react";
import { MarkdownContent } from "./MarkdownContent";
import { type OptionsStrategyState } from "@/hooks/use-options-strategy";

interface OptionsStrategyCardProps {
  state: OptionsStrategyState;
  onGenerate: () => void;
}

export function OptionsStrategyCard({ state, onGenerate }: OptionsStrategyCardProps) {
  return (
    <div className="glass-panel rounded-2xl p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-emerald-400/20 border border-emerald-400/30 flex items-center justify-center">
            <Target className="h-5 w-5 text-emerald-400" />
          </div>
          <div>
            <h3 className="font-display font-bold text-base">Options Strategy Advisor</h3>
            <p className="text-xs text-muted-foreground font-mono">Options-specific synthesis · GLM-5</p>
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
            Translate the multi-model equity analysis into actionable options strategies — directional assessment, strike selection, and risk/reward profiles.
          </p>
          <button
            onClick={onGenerate}
            className="flex items-center gap-2 bg-emerald-400/10 hover:bg-emerald-400/20 border border-emerald-400/30 hover:border-emerald-400/50 text-emerald-400 font-mono text-sm px-5 py-2.5 rounded-xl transition-all"
          >
            <Sparkles className="h-4 w-4" />
            Generate Options Strategy
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
            Synthesizing options strategy analysis… this may take 30–60s
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

      {/* Strategy output */}
      {state.status === "done" && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <MarkdownContent content={state.strategy} />
        </motion.div>
      )}
    </div>
  );
}
