import { useState, useEffect, useRef } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { AgentLog } from "./AgentLog";
import { DecisionCard } from "./DecisionCard";
import { ConsensusBanner } from "./ConsensusBanner";
import { ConsensusSummaryCard } from "./ConsensusSummaryCard";
import { DeliberationCard } from "./DeliberationCard";
import { OptionsStrategyCard } from "./OptionsStrategyCard";
import { type ConsensusResult } from "@/hooks/use-consensus-stream";
import { useConsensusSummary } from "@/hooks/use-consensus-summary";
import { useDeliberation } from "@/hooks/use-deliberation";
import { useOptionsStrategy } from "@/hooks/use-options-strategy";
import { type useAgentStream, type AgentState } from "@/hooks/use-agent-stream";
import { cn } from "./Badge";
import { BrainCircuit, Swords, Target } from "lucide-react";

type StreamInstance = ReturnType<typeof useAgentStream>;

interface AnalysisLog {
  id: number; analysisId: number; sequence: number;
  eventType: string; agent: string | null; displayName: string | null;
  status: string | null; output: string | null; message: string | null;
}

interface ConsensusViewProps {
  streams: readonly [StreamInstance, StreamInstance, StreamInstance];
  consensus: ConsensusResult;
  models: [string, string, string];
  ids: [number | null, number | null, number | null];
  ticker: string;
  date: string;
}

function shortModelName(model: string): string {
  const afterSlash = model.split("/").pop() ?? model;
  return afterSlash.split(":")[0];
}

function ModelTabLabel({ model, stream }: { model: string; stream: StreamInstance }) {
  const { status, decision } = stream.streamData;
  const isRunning = status === "connecting" || status === "streaming";
  const isDone = status === "completed" || status === "error";

  return (
    <span className="flex items-center gap-2">
      <span className="font-mono text-xs">{shortModelName(model)}</span>
      {isRunning && (
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-primary" />
        </span>
      )}
      {isDone && decision && (
        <span
          className={cn(
            "text-[10px] font-bold px-1.5 py-0.5 rounded-full",
            decision === "BUY" && "bg-success/20 text-success",
            decision === "SELL" && "bg-destructive/20 text-destructive",
            decision === "HOLD" && "bg-warning/20 text-warning"
          )}
        >
          {decision}
        </span>
      )}
      {isDone && !decision && status === "error" && (
        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-destructive/20 text-destructive">ERR</span>
      )}
    </span>
  );
}

function usePersistedLogs(id: number | null, stream: StreamInstance): AgentState[] {
  const [agents, setAgents] = useState<AgentState[]>([]);
  const status = stream.streamData.status;

  useEffect(() => {
    if (!id) { setAgents([]); return; }
    if (status !== "completed" && status !== "error") { setAgents([]); return; }
    if (stream.streamData.agents.length > 0) { setAgents([]); return; }

    fetch(`/api/analyses/${id}/logs`)
      .then((r) => r.json())
      .then((logs: AnalysisLog[]) => {
        const agentMap = new Map<string, AgentState>();
        for (const log of logs) {
          if (log.eventType === "agent_update" && log.agent) {
            agentMap.set(log.agent, {
              agent: log.agent,
              displayName: log.displayName ?? log.agent,
              status: (log.status as AgentState["status"]) ?? "completed",
              output: log.output ?? "",
            });
          }
        }
        setAgents(Array.from(agentMap.values()));
      })
      .catch(console.error);
  }, [id, status]);

  return agents;
}

export function ConsensusView({ streams, consensus, models, ids, ticker, date }: ConsensusViewProps) {
  const persisted0 = usePersistedLogs(ids[0], streams[0]);
  const persisted1 = usePersistedLogs(ids[1], streams[1]);
  const persisted2 = usePersistedLogs(ids[2], streams[2]);
  const persistedAll = [persisted0, persisted1, persisted2] as const;

  const { state: summaryState, generate } = useConsensusSummary(ids, ticker, date, models);
  const { state: deliberationState, generate: generateDeliberation } = useDeliberation(ids, ticker, date, models);
  const { state: optionsState, generate: generateOptions } = useOptionsStrategy(ids, ticker, date, models);

  const [selectedAnalysis, setSelectedAnalysis] = useState<"consensus" | "deliberation" | "options" | null>(null);

  const allDone = streams.every(
    (s) => s.streamData.status === "completed" || s.streamData.status === "error"
  );
  const idsKey = ids.join(",");

  // Reset selection when IDs change (new consensus run)
  useEffect(() => {
    setSelectedAnalysis(null);
  }, [idsKey]);

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <ConsensusBanner consensus={consensus} ticker={ticker} date={date} />

      <Tabs defaultValue="0" className="w-full">
        <TabsList className="w-full grid grid-cols-3 h-auto p-1 bg-card/50 border border-border rounded-xl">
          {models.map((model, i) => (
            <TabsTrigger
              key={i}
              value={String(i)}
              className="py-2.5 data-[state=active]:bg-primary/10 data-[state=active]:text-primary rounded-lg"
            >
              <ModelTabLabel model={model} stream={streams[i]} />
            </TabsTrigger>
          ))}
        </TabsList>

        {streams.map((stream, i) => {
          const { streamData, elapsedSeconds, completedCount } = stream;
          const isConnecting = streamData.status === "connecting";
          const isStreaming = streamData.status === "streaming" || isConnecting;
          const displayAgents = streamData.agents.length > 0 ? streamData.agents : persistedAll[i];
          const showAgentLog = isStreaming || displayAgents.length > 0;

          return (
            <TabsContent key={i} value={String(i)} className="mt-6 space-y-8">
              {/* Error state */}
              {streamData.error && (
                <div className="p-6 bg-destructive/10 border border-destructive/30 rounded-xl text-destructive">
                  <h4 className="font-bold mb-2">Analysis Error</h4>
                  <p className="font-mono text-sm">{streamData.error}</p>
                </div>
              )}

              {/* Decision card */}
              {streamData.status === "completed" && streamData.decision && (
                <DecisionCard decision={streamData.decision} reasoning={streamData.reasoning} />
              )}

              {/* Agent log */}
              {showAgentLog && (
                <AgentLog
                  agents={displayAgents}
                  elapsedSeconds={elapsedSeconds}
                  completedCount={completedCount}
                  isConnecting={isConnecting}
                />
              )}

              {/* Idle / waiting */}
              {!showAgentLog && !streamData.error && streamData.status === "idle" && (
                <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
                  <p className="text-sm font-mono">Starting analysis...</p>
                </div>
              )}
            </TabsContent>
          );
        })}
      </Tabs>

      {/* Deep analysis picker — shown when all models are done */}
      {allDone && ids.some((id) => id !== null) && (
        <div className="space-y-6">
          {/* Picker buttons */}
          <div className="glass-panel rounded-2xl p-6">
            <p className="text-xs text-muted-foreground font-mono uppercase tracking-widest mb-4">
              Deep Analysis
            </p>
            <div className="grid grid-cols-3 gap-3">
              {([
                {
                  key: "consensus" as const,
                  icon: BrainCircuit,
                  label: "Consensus Analysis",
                  desc: "Cross-model phase synthesis",
                  color: "primary",
                  activeClasses: "border-primary/50 bg-primary/10 text-primary",
                  iconClasses: "text-primary",
                },
                {
                  key: "deliberation" as const,
                  icon: Swords,
                  label: "Committee Deliberation",
                  desc: "Bull vs bear debate",
                  color: "warning",
                  activeClasses: "border-warning/50 bg-warning/10 text-warning",
                  iconClasses: "text-warning",
                },
                {
                  key: "options" as const,
                  icon: Target,
                  label: "Options Strategy",
                  desc: "Strike selection & strategy",
                  color: "emerald",
                  activeClasses: "border-emerald-400/50 bg-emerald-400/10 text-emerald-400",
                  iconClasses: "text-emerald-400",
                },
              ]).map(({ key, icon: Icon, label, desc, activeClasses, iconClasses }) => {
                const isActive = selectedAnalysis === key;
                return (
                  <button
                    key={key}
                    onClick={() => setSelectedAnalysis(isActive ? null : key)}
                    className={cn(
                      "flex flex-col items-center gap-2 p-4 rounded-xl border transition-all text-center",
                      isActive
                        ? activeClasses
                        : "border-border hover:border-foreground/20 text-muted-foreground hover:text-foreground"
                    )}
                  >
                    <Icon className={cn("h-5 w-5", isActive ? iconClasses : "text-muted-foreground")} />
                    <span className="font-mono text-xs font-bold">{label}</span>
                    <span className="text-[10px] text-muted-foreground">{desc}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Selected analysis card */}
          {selectedAnalysis === "consensus" && (
            <ConsensusSummaryCard state={summaryState} onGenerate={generate} />
          )}
          {selectedAnalysis === "deliberation" && (
            <DeliberationCard state={deliberationState} onGenerate={generateDeliberation} />
          )}
          {selectedAnalysis === "options" && (
            <OptionsStrategyCard state={optionsState} onGenerate={generateOptions} />
          )}
        </div>
      )}
    </div>
  );
}
