import { useState, useEffect } from "react";

export interface ConsensusSummaryState {
  status: "idle" | "loading" | "done" | "error";
  summary: string;
  error?: string;
}

export function useConsensusSummary(
  ids: [number | null, number | null, number | null, number | null],
  ticker: string,
  date: string,
  models: [string, string, string, string]
): { state: ConsensusSummaryState; generate: () => void } {
  const [state, setState] = useState<ConsensusSummaryState>({ status: "idle", summary: "" });

  const key = ids.join(",");

  // Reset when IDs change (new consensus run)
  useEffect(() => {
    setState({ status: "idle", summary: "" });
  }, [key]);

  const generate = () => {
    if (ids.some((id) => id === null)) return;

    setState({ status: "loading", summary: "" });

    fetch("/api/analyses/consensus-summary", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids, ticker, date, models }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.error) {
          setState({ status: "error", summary: "", error: data.error });
        } else {
          setState({ status: "done", summary: data.summary || "(No summary returned)" });
        }
      })
      .catch((err) => {
        setState({ status: "error", summary: "", error: String(err) });
      });
  };

  return { state, generate };
}
