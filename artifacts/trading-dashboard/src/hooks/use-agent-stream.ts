import { useState, useEffect, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getGetAnalysisQueryKey, getListAnalysesQueryKey } from "@workspace/api-client-react";

export type StreamStatus = "idle" | "connecting" | "streaming" | "completed" | "error";

export interface AgentState {
  agent: string;
  displayName: string;
  status: "pending" | "running" | "completed";
  output: string;
}

export interface StreamData {
  agents: AgentState[];
  decision: string | null;
  reasoning: string | null;
  status: StreamStatus;
  error: string | null;
}

const INITIAL_AGENTS = [
  "fundamentals_analyst",
  "market_analyst",
  "social_analyst",
  "news_analyst",
  "bull_researcher",
  "bear_researcher",
  "research_manager",
  "trader",
  "risk_manager",
  "portfolio_manager"
];

export function useAgentStream(analysisId: number | null) {
  const queryClient = useQueryClient();
  const [data, setData] = useState<StreamData>({
    agents: [],
    decision: null,
    reasoning: null,
    status: "idle",
    error: null,
  });

  const reset = useCallback(() => {
    setData({
      agents: [],
      decision: null,
      reasoning: null,
      status: "idle",
      error: null,
    });
  }, []);

  useEffect(() => {
    if (!analysisId) {
      reset();
      return;
    }

    setData(prev => ({ ...prev, status: "connecting", error: null }));
    
    // Connect to the proxy endpoint in the Express server
    const es = new EventSource(`/api/analyses/${analysisId}/stream`);

    es.onopen = () => {
      setData(prev => ({ ...prev, status: "streaming" }));
    };

    es.onmessage = (event) => {
      // Ignore keepalives
      if (event.data === ": keepalive") return;

      try {
        const payload = JSON.parse(event.data);

        switch (payload.type) {
          case "started":
            // Initialize agents list
            setData(prev => ({
              ...prev,
              agents: (payload.agents || INITIAL_AGENTS).map((a: string) => ({
                agent: a,
                displayName: a.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '),
                status: "pending",
                output: ""
              }))
            }));
            break;

          case "agent_update":
          case "agent_report":
            setData(prev => {
              const newAgents = [...prev.agents];
              const idx = newAgents.findIndex(a => a.agent === payload.agent);
              
              if (idx >= 0) {
                newAgents[idx] = {
                  ...newAgents[idx],
                  status: payload.status || newAgents[idx].status,
                  output: payload.output || newAgents[idx].output,
                };
              } else {
                // If agent wasn't in initial list, add it
                newAgents.push({
                  agent: payload.agent,
                  displayName: payload.displayName || payload.agent,
                  status: payload.status || "completed",
                  output: payload.output || "",
                });
              }
              return { ...prev, agents: newAgents };
            });
            break;

          case "completed":
            setData(prev => ({
              ...prev,
              decision: payload.decision,
              reasoning: payload.reasoning,
              status: "completed"
            }));
            // Refresh analysis data in cache to reflect completion in DB
            queryClient.invalidateQueries({ queryKey: getGetAnalysisQueryKey(analysisId) });
            queryClient.invalidateQueries({ queryKey: getListAnalysesQueryKey() });
            break;

          case "error":
            setData(prev => ({ ...prev, status: "error", error: payload.message }));
            es.close();
            break;

          case "done":
            setData(prev => ({ ...prev, status: prev.status === "streaming" ? "completed" : prev.status }));
            es.close();
            break;
        }
      } catch (err) {
        console.error("Failed to parse SSE message", err);
      }
    };

    es.onerror = (err) => {
      console.error("EventSource error", err);
      setData(prev => ({ 
        ...prev, 
        status: prev.status === "completed" ? "completed" : "error", 
        error: "Connection to analysis stream lost." 
      }));
      es.close();
    };

    return () => {
      es.close();
    };
  }, [analysisId, queryClient, reset]);

  return { streamData: data, resetStream: reset };
}
