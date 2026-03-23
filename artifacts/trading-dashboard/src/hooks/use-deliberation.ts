import { useState, useEffect } from "react";

export interface DeliberationState {
  status: "idle" | "loading" | "done" | "error";
  deliberation: string;
  error?: string;
}

export function useDeliberation(
  ids: [number | null, number | null, number | null, number | null],
  ticker: string,
  date: string,
  models: [string, string, string, string]
): { state: DeliberationState; generate: () => void } {
  const [state, setState] = useState<DeliberationState>({ status: "idle", deliberation: "" });

  const key = ids.join(",");

  // Reset when IDs change (new consensus run)
  useEffect(() => {
    setState({ status: "idle", deliberation: "" });
  }, [key]);

  const generate = () => {
    if (ids.some((id) => id === null)) return;

    setState({ status: "loading", deliberation: "" });

    fetch("/api/analyses/deliberation", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids, ticker, date, models }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.error) {
          setState({ status: "error", deliberation: "", error: data.error });
        } else {
          setState({ status: "done", deliberation: data.deliberation || "(No deliberation returned)" });
        }
      })
      .catch((err) => {
        setState({ status: "error", deliberation: "", error: String(err) });
      });
  };

  return { state, generate };
}
