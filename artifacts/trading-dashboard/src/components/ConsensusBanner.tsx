import { motion } from "framer-motion";
import { type ConsensusResult } from "@/hooks/use-consensus-stream";
import { cn } from "./Badge";

interface ConsensusBannerProps {
  consensus: ConsensusResult;
  ticker: string;
  date: string;
}

const VOTE_CONFIG = [
  { key: "BUY" as const, label: "BUY", color: "bg-success", textColor: "text-success", borderColor: "border-success/30" },
  { key: "HOLD" as const, label: "HOLD", color: "bg-warning", textColor: "text-warning", borderColor: "border-warning/30" },
  { key: "SELL" as const, label: "SELL", color: "bg-destructive", textColor: "text-destructive", borderColor: "border-destructive/30" },
];

function agreementLabel(consensus: ConsensusResult): string {
  const { agreement, votes, completedCount } = consensus;
  if (completedCount === 0) return "Waiting for results...";
  if (agreement === "unanimous") return `Unanimous · ${completedCount}/4`;
  if (agreement === "majority") return `Majority · ${Math.max(votes.BUY, votes.SELL, votes.HOLD)}/4`;
  const parts = (["BUY", "HOLD", "SELL"] as const)
    .filter((k) => votes[k] > 0)
    .map((k) => `${k} ${votes[k]}`);
  return `Split · ${parts.join(", ")}`;
}

function decisionColor(decision: string | null): string {
  if (decision === "BUY") return "text-success";
  if (decision === "SELL") return "text-destructive";
  return "text-warning";
}

export function ConsensusBanner({ consensus, ticker, date }: ConsensusBannerProps) {
  const { votes, decision, completedCount } = consensus;

  return (
    <div className="glass-panel rounded-2xl p-8">
      {/* Header */}
      <div className="flex items-end justify-between mb-8">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <h2 className="text-5xl font-display font-bold tracking-tight">{ticker}</h2>
            <span className="font-mono text-sm px-3 py-1 rounded-full border border-border text-muted-foreground">
              {date}
            </span>
          </div>
          <p className="text-xs text-muted-foreground font-mono uppercase tracking-widest">Consensus Analysis · 4 Models</p>
        </div>
        {completedCount > 0 && decision && (
          <div className="text-right">
            <p className="text-xs text-muted-foreground font-mono mb-1">Consensus</p>
            <p className={cn("text-3xl font-display font-bold", decisionColor(decision))}>
              {decision}
            </p>
          </div>
        )}
        {completedCount > 0 && !decision && (
          <div className="text-right">
            <p className="text-xs text-muted-foreground font-mono mb-1">Consensus</p>
            <p className="text-2xl font-display font-bold text-warning">SPLIT</p>
          </div>
        )}
      </div>

      {/* Vote bars */}
      <div className="space-y-3">
        {VOTE_CONFIG.map(({ key, label, color, textColor }) => {
          const count = votes[key];
          const pct = (count / 4) * 100;
          return (
            <div key={key} className="flex items-center gap-4">
              <span className={cn("font-mono text-xs font-bold w-10", count > 0 ? textColor : "text-muted-foreground/40")}>
                {label}
              </span>
              <div className="flex-1 h-2 rounded-full bg-white/5 overflow-hidden">
                <motion.div
                  className={cn("h-full rounded-full", count > 0 ? color : "bg-white/5")}
                  initial={{ width: 0 }}
                  animate={{ width: `${pct}%` }}
                  transition={{ duration: 0.5, ease: "easeOut" }}
                />
              </div>
              <span className={cn("font-mono text-sm font-bold w-4 text-right", count > 0 ? textColor : "text-muted-foreground/30")}>
                {count}
              </span>
            </div>
          );
        })}
      </div>

      {/* Agreement label */}
      <p className="mt-4 text-xs text-muted-foreground font-mono">
        {agreementLabel(consensus)}
      </p>
    </div>
  );
}
