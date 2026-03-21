import { useState, useEffect, useRef } from "react";

export interface ConsensusSummaryState {
  status: "idle" | "loading" | "done" | "error";
  summary: string;
  error?: string;
}

export function useConsensusSummary(
  ids: [number | null, number | null, number | null, number | null],
  isCompleted: boolean,
  ticker: string,
  date: string,
  models: [string, string, string, string]
): { state: ConsensusSummaryState; regenerate: () => void } {
  const [state, setState] = useState<ConsensusSummaryState>({ status: "idle", summary: "" });
  const fetchedForRef = useRef<string>("");

  const key = ids.join(",");

  // Reset when IDs change (new consensus run)
  useEffect(() => {
    if (fetchedForRef.current !== key) {
      setState({ status: "idle", summary: "" });
      fetchedForRef.current = "";
    }
  }, [key]);

  const run = () => {
    if (!isCompleted) return;
    if (ids.some((id) => id === null)) return;

    setState({ status: "loading", summary: "" });
    fetchedForRef.current = key;

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
          setState({ status: "done", summary: data.summary });
        }
      })
      .catch((err) => {
        setState({ status: "error", summary: "", error: String(err) });
      });
  };

  // Auto-trigger when first completed
  useEffect(() => {
    if (isCompleted && fetchedForRef.current !== key && !ids.some((id) => id === null)) {
      run();
    }
  }, [isCompleted, key]);

  return { state, regenerate: run };
}
