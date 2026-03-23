import { useState, useEffect } from "react";

export interface OptionsStrategyState {
  status: "idle" | "loading" | "done" | "error";
  strategy: string;
  error?: string;
}

export function useOptionsStrategy(
  ids: [number | null, number | null, number | null, number | null],
  ticker: string,
  date: string,
  models: [string, string, string, string]
): { state: OptionsStrategyState; generate: () => void } {
  const [state, setState] = useState<OptionsStrategyState>({ status: "idle", strategy: "" });

  const key = ids.join(",");

  // Reset when IDs change (new consensus run)
  useEffect(() => {
    setState({ status: "idle", strategy: "" });
  }, [key]);

  const generate = () => {
    if (ids.some((id) => id === null)) return;

    setState({ status: "loading", strategy: "" });

    fetch("/api/analyses/options-strategy", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids, ticker, date, models }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.error) {
          setState({ status: "error", strategy: "", error: data.error });
        } else {
          setState({ status: "done", strategy: data.strategy || "(No options strategy returned)" });
        }
      })
      .catch((err) => {
        setState({ status: "error", strategy: "", error: String(err) });
      });
  };

  return { state, generate };
}
