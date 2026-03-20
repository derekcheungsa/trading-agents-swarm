import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { format } from "date-fns";
import { Activity, Plus, Search, Calendar, Cpu, Layers } from "lucide-react";
import {
  useCreateAnalysis,
  useListAnalyses,
  useGetAnalysis,
  getListAnalysesQueryKey,
  getGetAnalysisQueryKey,
} from "@workspace/api-client-react";
import { useAgentStream, type AgentState } from "@/hooks/use-agent-stream";
import { useConsensusStream } from "@/hooks/use-consensus-stream";
import { ConsensusView } from "@/components/ConsensusView";

interface AnalysisLog {
  id: number; analysisId: number; sequence: number;
  eventType: string; agent: string | null; displayName: string | null;
  status: string | null; output: string | null; message: string | null;
}
import { Badge, cn } from "@/components/Badge";
import { AgentLog } from "@/components/AgentLog";
import { DecisionCard } from "@/components/DecisionCard";

const formSchema = z.object({
  ticker: z.string().min(1, "Ticker is required").max(10).toUpperCase(),
  date: z.string().min(1, "Date is required"),
  model: z.string().min(1, "Model is required"),
  maxDebateRounds: z.coerce.number().min(1).max(5),
});

type FormValues = z.infer<typeof formSchema>;

const DEFAULT_CONSENSUS_MODELS: [string, string, string] = [
  "minimax/minimax-m2.5:nitro",
  "google/gemini-flash-1.5",
  "meta-llama/llama-3.3-70b-instruct",
];

export default function Dashboard() {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [isLiveRun, setIsLiveRun] = useState(false);

  // Consensus mode state
  const [mode, setMode] = useState<"single" | "consensus">("single");
  const [consensusIds, setConsensusIds] = useState<[number, number, number] | null>(null);
  const [consensusModels, setConsensusModels] = useState<[string, string, string]>(DEFAULT_CONSENSUS_MODELS);
  // Track ticker/date for the consensus header (form values at submit time)
  const [consensusTicker, setConsensusTicker] = useState("");
  const [consensusDate, setConsensusDate] = useState("");

  // Fetch History (polls every 30s)
  const { data: analyses = [], isLoading: isLoadingHistory } = useListAnalyses({
    query: { queryKey: getListAnalysesQueryKey(), refetchInterval: 30000 }
  });

  // Fetch selected analysis details if not streaming
  const { data: analysisRecord, isLoading: isLoadingRecord } = useGetAnalysis(selectedId!, {
    query: { queryKey: getGetAnalysisQueryKey(selectedId!), enabled: !!selectedId }
  });

  // Single-analysis SSE stream hook
  const { streamData, resetStream, elapsedSeconds, completedCount } = useAgentStream(selectedId, isLiveRun && mode === "single");

  // Consensus SSE stream hooks (always called — React rules require unconditional hooks)
  const { streams, consensus, resetAll } = useConsensusStream(
    consensusIds ?? [null, null, null],
    isLiveRun && mode === "consensus"
  );

  // Persisted agent logs — fetched for completed/error analyses when live stream data is unavailable
  const [persistedAgents, setPersistedAgents] = useState<AgentState[]>([]);
  useEffect(() => {
    if (!selectedId || isLiveRun || mode === "consensus") { setPersistedAgents([]); return; }
    const status = analysisRecord?.status;
    if (status !== "completed" && status !== "error") { setPersistedAgents([]); return; }
    fetch(`/api/analyses/${selectedId}/logs`)
      .then(r => r.json())
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
        setPersistedAgents(Array.from(agentMap.values()));
      })
      .catch(console.error);
  }, [selectedId, analysisRecord?.status, isLiveRun, mode]);

  // Create Mutation
  const createMutation = useCreateAnalysis();

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      ticker: "",
      date: format(new Date(), "yyyy-MM-dd"),
      model: "minimax/minimax-m2.5:nitro",
      maxDebateRounds: 1,
    }
  });

  const onSubmit = async (data: FormValues) => {
    resetStream();
    resetAll();
    setIsLiveRun(false);
    setSelectedId(null);
    setConsensusIds(null);

    try {
      if (mode === "consensus") {
        setConsensusTicker(data.ticker);
        setConsensusDate(data.date);
        const [r1, r2, r3] = await Promise.all(
          consensusModels.map((model) =>
            createMutation.mutateAsync({ data: { ...data, model } })
          )
        );
        setIsLiveRun(true);
        setConsensusIds([r1.id, r2.id, r3.id]);
      } else {
        const result = await createMutation.mutateAsync({ data });
        setIsLiveRun(true);
        setSelectedId(result.id);
      }
    } catch (err) {
      console.error("Failed to start analysis", err);
    }
  };

  const handleNewAnalysis = () => {
    setMode("single");
    setIsLiveRun(false);
    setSelectedId(null);
    setConsensusIds(null);
    resetStream();
    resetAll();
    form.reset();
  };

  // Determine what to display for the active single-analysis view
  const isViewingHistory = !!selectedId && mode === "single";
  const isViewingConsensus = !!consensusIds && mode === "consensus";
  const activeRecord = analysisRecord;
  const isConnecting = streamData.status === "connecting";
  const isStreaming = streamData.status === "streaming" || isConnecting;
  const displayAgents = streamData.agents.length > 0 ? streamData.agents : persistedAgents;
  const showStream = isStreaming || displayAgents.length > 0;

  // Combine DB state and Stream state smoothly
  const displayDecision = (streamData.decision || activeRecord?.decision) ?? null;
  const displayReasoning = (streamData.reasoning || activeRecord?.reasoning) ?? null;
  const displayStatus = isStreaming ? "running" : (activeRecord?.status || "pending");

  const showForm = !isViewingHistory && !isViewingConsensus;

  return (
    <div className="flex h-screen w-full bg-background overflow-hidden text-foreground">
      {/* Sidebar */}
      <aside className="w-80 shrink-0 border-r border-border bg-card/50 flex flex-col backdrop-blur-xl z-20">
        <div className="p-6 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-lg bg-primary/20 flex items-center justify-center border border-primary/50">
              <Activity className="h-4 w-4 text-primary" />
            </div>
            <div>
              <h1 className="font-display font-bold text-lg leading-none tracking-tight">TradingAgents</h1>
              <p className="text-xs text-muted-foreground font-mono mt-1">AI Swarm Terminal</p>
            </div>
          </div>

          <button
            onClick={handleNewAnalysis}
            className="mt-6 w-full flex items-center justify-center gap-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 px-4 py-2.5 text-sm font-medium transition-colors"
          >
            <Plus className="h-4 w-4" /> New Analysis
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-4 px-2">History</h3>
          {isLoadingHistory ? (
            <div className="p-4 text-center text-sm text-muted-foreground">Loading...</div>
          ) : analyses.length === 0 ? (
            <div className="p-4 text-center text-sm text-muted-foreground border border-dashed rounded-lg">No analyses yet</div>
          ) : (
            analyses.map(item => (
              <button
                key={item.id}
                onClick={() => { setMode("single"); setIsLiveRun(false); setSelectedId(item.id); setConsensusIds(null); resetStream(); resetAll(); }}
                className={cn(
                  "w-full text-left p-3 rounded-xl border transition-all duration-200 group",
                  selectedId === item.id && mode === "single"
                    ? "bg-primary/10 border-primary/30"
                    : "bg-transparent border-transparent hover:bg-white/5 hover:border-white/10"
                )}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="font-mono font-bold text-lg">{item.ticker}</span>
                  <StatusBadge status={item.status} decision={item.decision} />
                </div>
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1"><Calendar className="h-3 w-3" /> {item.date}</span>
                </div>
              </button>
            ))
          )}
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 relative overflow-y-auto">
        <div className="max-w-4xl mx-auto p-8 lg:p-12 min-h-full flex flex-col">

          {/* ── Form (new analysis) ── */}
          {showForm && (
            <div className="flex-1 flex flex-col justify-center max-w-2xl mx-auto w-full animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="mb-8">
                <h2 className="text-3xl font-display font-bold">Deploy Agent Swarm</h2>
                <p className="text-muted-foreground mt-2">Initialize a multi-agent quantitative analysis protocol.</p>
              </div>

              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 glass-panel p-8 rounded-2xl">
                {/* Mode toggle */}
                <div className="flex rounded-xl border border-border overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setMode("single")}
                    className={cn(
                      "flex-1 py-2.5 text-sm font-medium transition-colors",
                      mode === "single" ? "bg-primary/20 text-primary" : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    Single Model
                  </button>
                  <button
                    type="button"
                    onClick={() => setMode("consensus")}
                    className={cn(
                      "flex-1 py-2.5 text-sm font-medium transition-colors border-l border-border",
                      mode === "consensus" ? "bg-primary/20 text-primary" : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    Consensus (3 Models)
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-sm font-medium flex items-center gap-2">
                      <Search className="h-4 w-4 text-muted-foreground" /> Asset Ticker
                    </label>
                    <input
                      {...form.register("ticker")}
                      placeholder="e.g. NVDA"
                      className="w-full bg-input border border-border rounded-xl px-4 py-3 font-mono text-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all uppercase placeholder:text-muted-foreground"
                    />
                    {form.formState.errors.ticker && <p className="text-destructive text-xs">{form.formState.errors.ticker.message}</p>}
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-muted-foreground" /> Target Date
                    </label>
                    <input
                      type="date"
                      {...form.register("date")}
                      className="w-full bg-input border border-border rounded-xl px-4 py-3 font-mono text-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
                    />
                    {form.formState.errors.date && <p className="text-destructive text-xs">{form.formState.errors.date.message}</p>}
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium flex items-center gap-2">
                    <Cpu className="h-4 w-4 text-muted-foreground" />
                    {mode === "consensus" ? "LLM Models (OpenRouter)" : "LLM Core (OpenRouter)"}
                  </label>
                  {mode === "single" ? (
                    <input
                      {...form.register("model")}
                      className="w-full bg-input border border-border rounded-xl px-4 py-3 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
                    />
                  ) : (
                    <div className="space-y-2">
                      {([0, 1, 2] as const).map((i) => (
                        <input
                          key={i}
                          value={consensusModels[i]}
                          onChange={(e) => setConsensusModels((prev) => {
                            const next = [...prev] as [string, string, string];
                            next[i] = e.target.value;
                            return next;
                          })}
                          placeholder={`Model ${i + 1}`}
                          className="w-full bg-input border border-border rounded-xl px-4 py-2.5 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
                        />
                      ))}
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium flex items-center gap-2">
                    <Layers className="h-4 w-4 text-muted-foreground" /> Debate Rounds
                  </label>
                  <div className="flex items-center gap-4">
                    <input
                      type="range"
                      min="1" max="5"
                      {...form.register("maxDebateRounds")}
                      className="flex-1 accent-primary"
                    />
                    <span className="font-mono bg-white/10 px-3 py-1 rounded-md">{form.watch("maxDebateRounds")}</span>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={createMutation.isPending}
                  className="w-full mt-4 bg-primary hover:bg-primary/90 text-primary-foreground font-bold py-4 rounded-xl shadow-[0_0_20px_rgba(0,255,255,0.3)] transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {createMutation.isPending
                    ? "Initializing Swarm..."
                    : mode === "consensus" ? "Execute Consensus Analysis" : "Execute Analysis"}
                </button>
              </form>
            </div>
          )}

          {/* ── Consensus results ── */}
          {isViewingConsensus && (
            <ConsensusView
              streams={streams}
              consensus={consensus}
              models={consensusModels}
              ticker={consensusTicker}
              date={consensusDate}
            />
          )}

          {/* ── Single-analysis results ── */}
          {isViewingHistory && (
            <div className="space-y-12 animate-in fade-in duration-500">
              {/* Header */}
              <div className="flex items-end justify-between border-b border-border pb-6">
                <div>
                  <div className="flex items-center gap-3 mb-2">
                    <h2 className="text-5xl font-display font-bold tracking-tight">{activeRecord?.ticker || '---'}</h2>
                    <Badge variant="outline" className="font-mono text-sm px-3 py-1">
                      {activeRecord?.date}
                    </Badge>
                  </div>
                  <p className="text-muted-foreground font-mono text-sm flex items-center gap-2">
                    <Cpu className="h-4 w-4" /> {activeRecord?.model}
                  </p>
                </div>
                <div className="text-right">
                  <StatusBadge status={displayStatus} decision={displayDecision} size="lg" />
                </div>
              </div>

              {/* Streaming or Historical Content */}
              {isLoadingRecord && !isStreaming ? (
                <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mb-4"></div>
                  Loading historical record...
                </div>
              ) : (
                <div className="grid gap-12">
                  {(displayStatus === "completed" && displayDecision) && (
                    <DecisionCard decision={displayDecision} reasoning={displayReasoning} />
                  )}

                  {showStream && (
                    <AgentLog
                      agents={displayAgents}
                      elapsedSeconds={elapsedSeconds}
                      completedCount={completedCount}
                      isConnecting={isConnecting}
                    />
                  )}

                  {(streamData.error || activeRecord?.errorMessage) && (
                    <div className="p-6 bg-destructive/10 border border-destructive/30 rounded-xl text-destructive">
                      <h4 className="font-bold mb-2">Analysis Error</h4>
                      <p className="font-mono text-sm">{streamData.error || activeRecord?.errorMessage}</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

function StatusBadge({ status, decision, size = "sm" }: { status: string, decision?: string | null, size?: "sm" | "lg" }) {
  if (status === "completed" && decision) {
    const isBuy = decision.toUpperCase().includes("BUY");
    const isSell = decision.toUpperCase().includes("SELL");

    return (
      <Badge variant={isBuy ? "success" : isSell ? "destructive" : "warning"} className={size === "lg" ? "text-sm px-4 py-1.5" : ""}>
        {decision}
      </Badge>
    );
  }

  if (status === "running") {
    return (
      <Badge variant="outline" className={cn("border-primary text-primary bg-primary/10", size === "lg" ? "text-sm px-4 py-1.5" : "")}>
        <span className="flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
          </span>
          Processing
        </span>
      </Badge>
    );
  }

  if (status === "error") {
    return <Badge variant="destructive" className={size === "lg" ? "text-sm px-4 py-1.5" : ""}>Error</Badge>;
  }

  return <Badge variant="secondary" className={size === "lg" ? "text-sm px-4 py-1.5" : ""}>Pending</Badge>;
}
