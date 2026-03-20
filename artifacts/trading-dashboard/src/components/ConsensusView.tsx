import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { AgentLog } from "./AgentLog";
import { DecisionCard } from "./DecisionCard";
import { ConsensusBanner } from "./ConsensusBanner";
import { type ConsensusResult } from "@/hooks/use-consensus-stream";
import { type useAgentStream } from "@/hooks/use-agent-stream";
import { cn } from "./Badge";

type StreamInstance = ReturnType<typeof useAgentStream>;

interface ConsensusViewProps {
  streams: readonly [StreamInstance, StreamInstance, StreamInstance, StreamInstance];
  consensus: ConsensusResult;
  models: [string, string, string, string];
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

export function ConsensusView({ streams, consensus, models, ticker, date }: ConsensusViewProps) {
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
          const showAgentLog = isStreaming || streamData.agents.length > 0;

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
                  agents={streamData.agents}
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
