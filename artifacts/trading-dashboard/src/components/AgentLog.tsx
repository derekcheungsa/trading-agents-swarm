import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle2, CircleDashed, Loader2, ChevronDown } from "lucide-react";
import { useState } from "react";
import { AgentState } from "@/hooks/use-agent-stream";
import { cn } from "./Badge";

export function AgentLog({ agents }: { agents: AgentState[] }) {
  if (!agents || agents.length === 0) return null;

  return (
    <div className="space-y-4">
      <h3 className="font-display text-lg font-semibold flex items-center gap-2">
        <span className="relative flex h-3 w-3">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
          <span className="relative inline-flex rounded-full h-3 w-3 bg-primary"></span>
        </span>
        Live Agent Swarm Execution
      </h3>
      
      <div className="grid gap-3">
        <AnimatePresence initial={false}>
          {agents.map((agent) => (
            <AgentRow key={agent.agent} agent={agent} />
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}

function AgentRow({ agent }: { agent: AgentState }) {
  const [expanded, setExpanded] = useState(false);
  
  const isRunning = agent.status === "running";
  const isCompleted = agent.status === "completed";
  const isPending = agent.status === "pending";

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        "rounded-xl border transition-all duration-300 overflow-hidden",
        isPending && "border-white/5 bg-white/5 opacity-50",
        isRunning && "border-primary/50 bg-primary/5 terminal-glow",
        isCompleted && "border-white/10 bg-card/40 glass-panel"
      )}
    >
      <div 
        className={cn(
          "flex items-center gap-4 p-4",
          isCompleted && agent.output && "cursor-pointer hover:bg-white/5 transition-colors"
        )}
        onClick={() => isCompleted && agent.output && setExpanded(!expanded)}
      >
        <div className="shrink-0">
          {isPending && <CircleDashed className="h-5 w-5 text-muted-foreground" />}
          {isRunning && <Loader2 className="h-5 w-5 text-primary animate-spin" />}
          {isCompleted && <CheckCircle2 className="h-5 w-5 text-success" />}
        </div>
        
        <div className="flex-1 flex justify-between items-center">
          <span className={cn(
            "font-mono text-sm font-medium",
            isRunning ? "text-primary" : "text-foreground"
          )}>
            {agent.displayName}
          </span>
          
          {isCompleted && agent.output && (
            <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform duration-200", expanded && "rotate-180")} />
          )}
        </div>
      </div>

      <AnimatePresence>
        {expanded && agent.output && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="border-t border-white/5 bg-black/50"
          >
            <div className="p-4">
              <pre className="font-mono text-xs text-muted-foreground whitespace-pre-wrap overflow-x-auto">
                {agent.output}
              </pre>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
