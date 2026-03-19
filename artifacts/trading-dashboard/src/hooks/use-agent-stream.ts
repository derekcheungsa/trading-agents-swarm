import { useState, useEffect, useCallback, useRef } from "react";
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

export const AGENT_DISPLAY_NAMES: Record<string, string> = {
  fundamentals_analyst: "Fundamentals Analyst",
  market_analyst: "Technical Analyst",
  social_analyst: "Sentiment Analyst",
  news_analyst: "News Analyst",
  bull_researcher: "Bull Researcher",
  bear_researcher: "Bear Researcher",
  research_manager: "Research Manager",
  trader: "Trader",
  risk_manager: "Risk Manager",
  portfolio_manager: "Portfolio Manager",
};

export const INITIAL_AGENTS: string[] = [
  "fundamentals_analyst",
  "market_analyst",
  "social_analyst",
  "news_analyst",
  "bull_researcher",
  "bear_researcher",
  "research_manager",
  "trader",
  "risk_manager",
  "portfolio_manager",
];

function makeInitialAgentList(): AgentState[] {
  return INITIAL_AGENTS.map((a) => ({
    agent: a,
    displayName: AGENT_DISPLAY_NAMES[a] ?? a.split("_").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" "),
    status: "pending",
    output: "",
  }));
}

/**
 * @param analysisId - The analysis to stream. null means idle.
 * @param isLive - True when this is a freshly-started run (pre-populates agents immediately).
 *                 False for history-view mode (waits for SSE events before showing agents).
 */
export function useAgentStream(analysisId: number | null, isLive = false) {
  const queryClient = useQueryClient();
  const startedAtRef = useRef<number | null>(null);

  const [data, setData] = useState<StreamData>({
    agents: [],
    decision: null,
    reasoning: null,
    status: "idle",
    error: null,
  });

  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  const reset = useCallback(() => {
    startedAtRef.current = null;
    setElapsedSeconds(0);
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

    if (isLive) {
      startedAtRef.current = Date.now();
      setElapsedSeconds(0);
      setData({
        agents: makeInitialAgentList(),
        decision: null,
        reasoning: null,
        status: "connecting",
        error: null,
      });
    } else {
      startedAtRef.current = null;
      setElapsedSeconds(0);
      setData((prev) => ({ ...prev, status: "connecting", agents: [], error: null }));
    }

    const es = new EventSource(`/api/analyses/${analysisId}/stream`);

    es.onopen = () => {
      setData((prev) => ({ ...prev, status: "streaming" }));
    };

    es.onmessage = (event) => {
      if (event.data === ": keepalive") return;

      try {
        const payload = JSON.parse(event.data);

        switch (payload.type) {
          case "started":
            setData((prev) => {
              const incomingAgents: string[] = payload.agents || INITIAL_AGENTS;
              const merged = incomingAgents.map((a: string) => {
                const existing = prev.agents.find((x) => x.agent === a);
                return existing ?? {
                  agent: a,
                  displayName: AGENT_DISPLAY_NAMES[a] ?? a.split("_").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" "),
                  status: "pending" as const,
                  output: "",
                };
              });
              return { ...prev, agents: merged };
            });
            break;

          case "agent_update":
          case "agent_report":
            setData((prev) => {
              const newAgents = [...prev.agents];
              const idx = newAgents.findIndex((a) => a.agent === payload.agent);
              if (idx >= 0) {
                newAgents[idx] = {
                  ...newAgents[idx],
                  status: payload.status || newAgents[idx].status,
                  output: payload.output || newAgents[idx].output,
                };
              } else {
                newAgents.push({
                  agent: payload.agent,
                  displayName: payload.displayName || AGENT_DISPLAY_NAMES[payload.agent] || payload.agent,
                  status: payload.status || "completed",
                  output: payload.output || "",
                });
              }
              return { ...prev, agents: newAgents };
            });
            break;

          case "completed":
            setData((prev) => ({
              ...prev,
              decision: payload.decision,
              reasoning: payload.reasoning,
              status: "completed",
            }));
            queryClient.invalidateQueries({ queryKey: getGetAnalysisQueryKey(analysisId) });
            queryClient.invalidateQueries({ queryKey: getListAnalysesQueryKey() });
            break;

          case "error":
            setData((prev) => ({ ...prev, status: "error", error: payload.message }));
            es.close();
            break;

          case "done":
            setData((prev) => ({
              ...prev,
              status: prev.status === "streaming" ? "completed" : prev.status,
            }));
            es.close();
            break;
        }
      } catch (err) {
        console.error("Failed to parse SSE message", err);
      }
    };

    es.onerror = () => {
      setData((prev) => ({
        ...prev,
        status: prev.status === "completed" ? "completed" : "error",
        error: "Connection to analysis stream lost.",
      }));
      es.close();
    };

    return () => {
      es.close();
    };
  }, [analysisId, isLive, queryClient, reset]);

  useEffect(() => {
    const isActive = data.status === "connecting" || data.status === "streaming";
    if (!isActive) return;

    const interval = setInterval(() => {
      if (startedAtRef.current) {
        setElapsedSeconds(Math.floor((Date.now() - startedAtRef.current) / 1000));
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [data.status]);

  const completedCount = data.agents.filter((a) => a.status === "completed").length;

  return { streamData: data, resetStream: reset, elapsedSeconds, completedCount };
}
