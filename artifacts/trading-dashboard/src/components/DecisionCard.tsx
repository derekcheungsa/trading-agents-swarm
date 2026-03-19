import { motion } from "framer-motion";
import { TrendingUp, TrendingDown, Minus, BrainCircuit } from "lucide-react";
import { cn } from "./Badge";

interface DecisionCardProps {
  decision: string | null;
  reasoning: string | null;
}

export function DecisionCard({ decision, reasoning }: DecisionCardProps) {
  if (!decision) return null;

  const normalized = decision.toUpperCase();
  const isBuy = normalized.includes("BUY");
  const isSell = normalized.includes("SELL");
  const isHold = !isBuy && !isSell;

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.5, type: "spring", bounce: 0.4 }}
      className={cn(
        "relative overflow-hidden rounded-2xl border p-8 shadow-2xl",
        isBuy && "border-success/50 bg-success/5 shadow-success/10",
        isSell && "border-destructive/50 bg-destructive/5 shadow-destructive/10",
        isHold && "border-warning/50 bg-warning/5 shadow-warning/10"
      )}
    >
      <div className="absolute top-0 right-0 -mt-8 -mr-8 h-32 w-32 rounded-full opacity-20 blur-2xl" 
        style={{
          background: isBuy ? 'hsl(var(--success))' : isSell ? 'hsl(var(--destructive))' : 'hsl(var(--warning))'
        }}
      />
      
      <div className="relative z-10 flex items-start gap-6">
        <div className={cn(
          "flex h-16 w-16 shrink-0 items-center justify-center rounded-xl",
          isBuy && "bg-success text-success-foreground",
          isSell && "bg-destructive text-destructive-foreground",
          isHold && "bg-warning text-warning-foreground"
        )}>
          {isBuy && <TrendingUp className="h-8 w-8" />}
          {isSell && <TrendingDown className="h-8 w-8" />}
          {isHold && <Minus className="h-8 w-8" />}
        </div>
        
        <div className="flex-1 space-y-4">
          <div>
            <h3 className="text-sm font-medium tracking-wider text-muted-foreground uppercase">
              Final Trading Decision
            </h3>
            <p className={cn(
              "font-display text-4xl font-bold tracking-tight mt-1",
              isBuy && "text-success",
              isSell && "text-destructive",
              isHold && "text-warning"
            )}>
              {decision}
            </p>
          </div>
          
          <div className="rounded-lg border border-white/5 bg-black/40 p-4 backdrop-blur-sm">
            <div className="flex items-center gap-2 mb-2 text-muted-foreground">
              <BrainCircuit className="h-4 w-4" />
              <span className="text-sm font-semibold uppercase tracking-wider">Agent Consensus Reasoning</span>
            </div>
            <p className="text-sm leading-relaxed text-foreground/90 whitespace-pre-wrap font-sans">
              {reasoning || "No reasoning provided."}
            </p>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
