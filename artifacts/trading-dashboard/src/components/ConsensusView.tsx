import { useState, useEffect } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { AgentLog } from "./AgentLog";
import { DecisionCard } from "./DecisionCard";
import { ConsensusBanner } from "./ConsensusBanner";
import { type ConsensusResult } from "@/hooks/use-consensus-stream";
import { type useAgentStream, type AgentState } from "@/hooks/use-agent-stream";
import { cn } from "./Badge";

type StreamInstance = ReturnType<typeof useAgentStream>;

interface AnalysisLog {
  id: number; analysisId: number; sequence: number;
  eventType: string; agent: string | null; displayName: string | null;
  status: string | null; output: string | null; message: string | null;
}

interface ConsensusViewProps {
  streams: readonly [StreamInstance, StreamInstance, StreamInstance, StreamInstance];
  consensus: ConsensusResult;
  models: [string, string, string, string];
  ids: [number | null, number | null, number | null, number | null];
  ticker: string;
  date: string;
}

function shortModelName(model: string): string {
  // "minimax/minimax-m2.5:nitro" → "minimax-m2.5"
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
  const persisted3 = usePersistedLogs(ids[3], streams[3]);
  const persistedAll = [persisted0, persisted1, persisted2, persisted3] as const;

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <ConsensusBanner consensus={consensus} ticker={ticker} date={date} />

      <Tabs defaultValue="0" className="w-full">
        <TabsList className="w-full grid grid-cols-4 h-auto p-1 bg-card/50 border border-border rounded-xl">
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
    </div>
  );
}
