import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle2, CircleDashed, Loader2, ChevronDown, Clock, Zap } from "lucide-react";
import { useState } from "react";
import { AgentState } from "@/hooks/use-agent-stream";
import { cn } from "./Badge";
import { MarkdownContent } from "./MarkdownContent";

const AGENT_DESCRIPTIONS: Record<string, string> = {
  fundamentals_analyst: "Reads SEC filings, earnings, and financial ratios",
  market_analyst: "Analyzes price action, RSI, MACD, and chart patterns",
  social_analyst: "Scans Reddit, X/Twitter, and forums for sentiment signals",
  news_analyst: "Processes recent headlines, news, and press releases",
  bull_researcher: "Builds the strongest bullish case for the trade",
  bear_researcher: "Builds the strongest bearish case against the trade",
  research_manager: "Adjudicates the bull/bear debate and synthesizes a view",
  trader: "Generates a specific trade plan with entry and sizing",
  risk_manager: "Stress-tests the plan and flags potential risks",
  portfolio_manager: "Makes the final BUY / HOLD / SELL decision",
};

const PHASES: { label: string; agents: string[] }[] = [
  {
    label: "Data Collection",
    agents: ["fundamentals_analyst", "market_analyst", "social_analyst", "news_analyst"],
  },
  {
    label: "Research & Debate",
    agents: ["bull_researcher", "bear_researcher", "research_manager"],
  },
  {
    label: "Trading Decision",
    agents: ["trader", "risk_manager", "portfolio_manager"],
  },
];

function formatElapsed(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m ${s.toString().padStart(2, "0")}s`;
}

interface AgentLogProps {
  agents: AgentState[];
  elapsedSeconds?: number;
  completedCount?: number;
  isConnecting?: boolean;
}

export function AgentLog({ agents, elapsedSeconds = 0, completedCount = 0, isConnecting = false }: AgentLogProps) {
  const total = agents.length || 10;
  const pct = total > 0 ? Math.round((completedCount / total) * 100) : 0;
  const hasRunning = agents.some((a) => a.status === "running");

  if (agents.length === 0 && !isConnecting) return null;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h3 className="font-display text-lg font-semibold flex items-center gap-2">
          {hasRunning ? (
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
              <span className="relative inline-flex rounded-full h-3 w-3 bg-primary" />
            </span>
          ) : (
            <Zap className="h-4 w-4 text-muted-foreground" />
          )}
          Agent Swarm Execution
        </h3>
        <div className="flex items-center gap-3 text-xs text-muted-foreground font-mono">
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {formatElapsed(elapsedSeconds)}
          </span>
          <span className="text-white/30">|</span>
          <span>
            <span className="text-primary font-semibold">{completedCount}</span>
            <span className="text-white/40"> / {total} agents</span>
          </span>
        </div>
      </div>

      <div className="space-y-1">
        <div className="h-1.5 w-full rounded-full bg-white/5 overflow-hidden">
          <motion.div
            className="h-full rounded-full bg-gradient-to-r from-primary/70 to-primary"
            initial={{ width: 0 }}
            animate={{ width: `${pct}%` }}
            transition={{ duration: 0.5, ease: "easeOut" }}
          />
        </div>
        <p className="text-[11px] text-muted-foreground font-mono text-right">
          {pct}% complete
        </p>
      </div>

      {isConnecting && agents.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-10 gap-3 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
          <p className="text-sm font-mono animate-pulse">Initializing agent swarm…</p>
        </div>
      ) : (
        <div className="space-y-6">
          {PHASES.map((phase) => {
            const phaseAgents = agents.filter((a) => phase.agents.includes(a.agent));
            const unmatched = agents.filter(
              (a) =>
                !PHASES.some((p) => p.agents.includes(a.agent)) &&
                phase.label === "Trading Decision"
            );
            const rows = phase.label === "Trading Decision" ? [...phaseAgents, ...unmatched] : phaseAgents;
            if (rows.length === 0) return null;

            const phaseCompleted = rows.filter((a) => a.status === "completed").length;
            const phaseActive = rows.some((a) => a.status === "running");

            return (
              <div key={phase.label} className="space-y-2">
                <div className="flex items-center gap-3">
                  <span
                    className={cn(
                      "text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full border",
                      phaseActive
                        ? "text-primary border-primary/40 bg-primary/10"
                        : phaseCompleted === rows.length
                        ? "text-success border-success/30 bg-success/10"
                        : "text-muted-foreground border-white/10 bg-white/5"
                    )}
                  >
                    {phase.label}
                  </span>
                  <span className="text-[10px] text-muted-foreground font-mono">
                    {phaseCompleted} / {rows.length}
                  </span>
                  <div className="flex-1 h-px bg-white/5" />
                </div>

                <div className="grid gap-2 pl-1">
                  <AnimatePresence initial={false}>
                    {rows.map((agent) => (
                      <AgentRow key={agent.agent} agent={agent} />
                    ))}
                  </AnimatePresence>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function AgentRow({ agent }: { agent: AgentState }) {
  const [expanded, setExpanded] = useState(false);

  const isRunning = agent.status === "running";
  const isCompleted = agent.status === "completed";
  const isPending = agent.status === "pending";
  const description = AGENT_DESCRIPTIONS[agent.agent];

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className={cn(
        "rounded-xl border transition-colors duration-300 overflow-hidden",
        isPending && "border-white/5 bg-white/[0.02] opacity-60",
        isRunning && "border-primary/60 bg-primary/5",
        isCompleted && "border-white/10 bg-card/40"
      )}
      style={isRunning ? { boxShadow: "0 0 18px 0 rgba(0,255,255,0.12)" } : undefined}
    >
      <div
        className={cn(
          "flex items-start gap-3 px-4 py-3",
          isCompleted && agent.output && "cursor-pointer hover:bg-white/5 transition-colors"
        )}
        onClick={() => isCompleted && agent.output && setExpanded(!expanded)}
      >
        <div className="shrink-0 mt-0.5">
          {isPending && <CircleDashed className="h-4 w-4 text-muted-foreground/50" />}
          {isRunning && (
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ repeat: Infinity, duration: 1.2, ease: "linear" }}
              className="h-4 w-4"
            >
              <Loader2 className="h-4 w-4 text-primary" />
            </motion.div>
          )}
          {isCompleted && <CheckCircle2 className="h-4 w-4 text-success" />}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <span
              className={cn(
                "font-mono text-sm font-semibold leading-tight",
                isPending && "text-muted-foreground/60",
                isRunning && "text-primary",
                isCompleted && "text-foreground"
              )}
            >
              {agent.displayName}
              {isRunning && (
                <span className="ml-2 text-[10px] font-normal text-primary/70 animate-pulse">
                  ● working
                </span>
              )}
            </span>
            {isCompleted && agent.output && (
              <ChevronDown
                className={cn(
                  "h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200",
                  expanded && "rotate-180"
                )}
              />
            )}
          </div>
          {description && (
            <p
              className={cn(
                "text-[11px] mt-0.5 leading-snug",
                isPending && "text-muted-foreground/40",
                isRunning && "text-primary/60",
                isCompleted && "text-muted-foreground/70"
              )}
            >
              {description}
            </p>
          )}
        </div>
      </div>

      <AnimatePresence>
        {expanded && agent.output && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="border-t border-white/5 bg-black/50"
          >
            <div className="p-4 max-h-80 overflow-y-auto">
              <MarkdownContent content={agent.output} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
