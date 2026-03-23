import { useAgentStream } from "./use-agent-stream";

export type ConsensusDecision = "BUY" | "SELL" | "HOLD" | null;

export interface ConsensusResult {
  decision: ConsensusDecision;
  votes: { BUY: number; SELL: number; HOLD: number };
  agreement: "unanimous" | "majority" | "split";
  completedCount: number;
  confidence: number; // 0–100: max(votes) / total * 100
}

function computeConsensus(decisions: (string | null)[]): ConsensusResult {
  const votes = { BUY: 0, SELL: 0, HOLD: 0 };
  for (const d of decisions) {
    if (d === "BUY" || d === "SELL" || d === "HOLD") votes[d as keyof typeof votes]++;
  }
  const completedCount = decisions.filter(Boolean).length;
  const total = decisions.length;
  const max = Math.max(votes.BUY, votes.SELL, votes.HOLD);
  const winners = (["BUY", "SELL", "HOLD"] as const).filter((k) => votes[k] === max);
  const decision = winners.length === 1 ? winners[0] : null;
  const agreement =
    max === total ? "unanimous"
    : max > total / 2 ? "majority"
    : "split";
  const confidence = completedCount === 0 ? 0 : Math.round((max / total) * 100);
  return { decision, votes, agreement, completedCount, confidence };
}

export function useConsensusStream(
  ids: [number | null, number | null, number | null],
  isLive: boolean
) {
  const s0 = useAgentStream(ids[0], isLive);
  const s1 = useAgentStream(ids[1], isLive);
  const s2 = useAgentStream(ids[2], isLive);
  const streams = [s0, s1, s2] as const;
  const decisions = streams.map((s) => s.streamData.decision);
  const consensus = computeConsensus(decisions);
  const allDone = streams.every(
    (s) => s.streamData.status === "completed" || s.streamData.status === "error"
  );
  const resetAll = () => { s0.resetStream(); s1.resetStream(); s2.resetStream(); };
  return { streams, consensus, allDone, resetAll };
}
