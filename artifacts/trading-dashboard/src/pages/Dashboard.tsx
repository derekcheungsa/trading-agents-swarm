import { useState } from "react";
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
import { useAgentStream } from "@/hooks/use-agent-stream";
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

export default function Dashboard() {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [isLiveRun, setIsLiveRun] = useState(false);

  // Fetch History (polls every 30s)
  const { data: analyses = [], isLoading: isLoadingHistory } = useListAnalyses({
    query: { queryKey: getListAnalysesQueryKey(), refetchInterval: 30000 }
  });

  // Fetch selected analysis details if not streaming
  const { data: analysisRecord, isLoading: isLoadingRecord } = useGetAnalysis(selectedId!, {
    query: { queryKey: getGetAnalysisQueryKey(selectedId!), enabled: !!selectedId }
  });

  // SSE Stream hook — isLiveRun is true only when this is a freshly-started analysis
  const { streamData, resetStream, elapsedSeconds, completedCount } = useAgentStream(selectedId, isLiveRun);

  // Create Mutation
  const createMutation = useCreateAnalysis();

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      ticker: "",
      date: format(new Date(), "yyyy-MM-dd"),
      model: "minimax/minimax-m2.5:online",
      maxDebateRounds: 1,
    }
  });

  const onSubmit = async (data: FormValues) => {
    resetStream();
    setIsLiveRun(false);
    try {
      const result = await createMutation.mutateAsync({ data });
      setIsLiveRun(true);
      setSelectedId(result.id);
    } catch (err) {
      console.error("Failed to start analysis", err);
    }
  };

  // Determine what to display for the active view
  const isViewingHistory = !!selectedId;
  const activeRecord = analysisRecord;
  const isConnecting = streamData.status === "connecting";
  const isStreaming = streamData.status === "streaming" || isConnecting;
  // Only show the agent panel when we have real agent data from SSE events.
  // For history views (isLiveRun=false), agents stays empty until SSE events arrive.
  const showStream = isStreaming || streamData.agents.length > 0;
  
  // Combine DB state and Stream state smoothly
  const displayDecision = (streamData.decision || activeRecord?.decision) ?? null;
  const displayReasoning = (streamData.reasoning || activeRecord?.reasoning) ?? null;
  const displayStatus = isStreaming ? "running" : (activeRecord?.status || "pending");

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
            onClick={() => { setIsLiveRun(false); setSelectedId(null); resetStream(); form.reset(); }}
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
                onClick={() => { setIsLiveRun(false); setSelectedId(item.id); resetStream(); }}
                className={cn(
                  "w-full text-left p-3 rounded-xl border transition-all duration-200 group",
                  selectedId === item.id 
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
          
          {!isViewingHistory ? (
            <div className="flex-1 flex flex-col justify-center max-w-2xl mx-auto w-full animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="mb-8">
                <h2 className="text-3xl font-display font-bold">Deploy Agent Swarm</h2>
                <p className="text-muted-foreground mt-2">Initialize a multi-agent quantitative analysis protocol.</p>
              </div>

              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 glass-panel p-8 rounded-2xl">
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
                    <Cpu className="h-4 w-4 text-muted-foreground" /> LLM Core (OpenRouter)
                  </label>
                  <input 
                    {...form.register("model")}
                    className="w-full bg-input border border-border rounded-xl px-4 py-3 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
                  />
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
                  {createMutation.isPending ? "Initializing Swarm..." : "Execute Analysis"}
                </button>
              </form>
            </div>
          ) : (
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
                  {/* Decision Card - shown if complete */}
                  {(displayStatus === "completed" && displayDecision) && (
                    <DecisionCard decision={displayDecision} reasoning={displayReasoning} />
                  )}

                  {/* Agent Stream - shown if streaming or if we have stream data */}
                  {showStream && (
                    <AgentLog
                      agents={streamData.agents}
                      elapsedSeconds={elapsedSeconds}
                      completedCount={completedCount}
                      isConnecting={isConnecting}
                    />
                  )}
                  
                  {/* Empty state for historical items that didn't record stream */}
                  {displayStatus === "completed" && !showStream && (
                     <div className="text-center p-8 border border-dashed rounded-xl text-muted-foreground bg-white/5">
                       Agent execution logs are not retained in history for this record.
                     </div>
                  )}

                  {/* Errors */}
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
