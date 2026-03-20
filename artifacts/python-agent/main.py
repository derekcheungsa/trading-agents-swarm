import asyncio
import json
import os
import threading
import uuid
from queue import Empty, Queue
from typing import Any, Optional

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

app = FastAPI(title="TradingAgents Python Service")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

jobs: dict[str, dict[str, Any]] = {}

AGENT_DISPLAY_NAMES: dict[str, str] = {
    "market_analyst": "Technical Analyst",
    "social_analyst": "Sentiment Analyst",
    "news_analyst": "News Analyst",
    "fundamentals_analyst": "Fundamentals Analyst",
    "bull_researcher": "Bull Researcher",
    "bear_researcher": "Bear Researcher",
    "research_manager": "Research Manager",
    "trader": "Trader",
    "risk_manager": "Risk Manager",
    "portfolio_manager": "Portfolio Manager",
}

# Maps LangGraph node names (as returned by graph.nodes) to our agent keys.
# These are the actual node names discovered via ta.graph.nodes.keys().
NODE_TO_AGENT: dict[str, str] = {
    "Market Analyst": "market_analyst",
    "Social Analyst": "social_analyst",
    "News Analyst": "news_analyst",
    "Fundamentals Analyst": "fundamentals_analyst",
    "Bull Researcher": "bull_researcher",
    "Bear Researcher": "bear_researcher",
    "Research Manager": "research_manager",
    "Trader": "trader",
    "Aggressive Analyst": "risk_manager",
    "Neutral Analyst": "risk_manager",
    "Conservative Analyst": "risk_manager",
    "Risk Judge": "portfolio_manager",
}


def _extract_node_output(updates: dict[str, Any]) -> str:
    """Extract a human-readable output string from a node's state updates."""
    messages = updates.get("messages", [])
    if messages:
        last = messages[-1]
        if hasattr(last, "content") and last.content:
            content = str(last.content)
            return content[:3000]
    for field in ("investment_plan", "final_trade_decision", "risk_debate_state"):
        val = updates.get(field)
        if val:
            return str(val)[:3000]
    return ""


def _parse_decision(raw_decision: str) -> tuple[str, str]:
    """Extract BUY/SELL/HOLD action from the raw final_trade_decision text."""
    upper = raw_decision.upper()
    if "BUY" in upper:
        action = "BUY"
    elif "SELL" in upper:
        action = "SELL"
    else:
        action = "HOLD"
    return action, raw_decision


def run_analysis_thread(
    job_id: str,
    ticker: str,
    date: str,
    model: str,
    max_debate_rounds: int,
) -> None:
    q: Queue = jobs[job_id]["queue"]

    try:
        from tradingagents.default_config import DEFAULT_CONFIG
        from tradingagents.graph.trading_graph import TradingAgentsGraph

        config = DEFAULT_CONFIG.copy()
        config["llm_provider"] = "openrouter"
        config["deep_think_llm"] = model
        config["quick_think_llm"] = model
        config["max_debate_rounds"] = max_debate_rounds
        config["online_tools"] = True

        openrouter_key = os.environ.get("OPENROUTER_API_KEY", "")
        if openrouter_key:
            os.environ["OPENAI_API_KEY"] = openrouter_key

        # Use debug=False — structured node events come from stream_mode="updates" instead.
        ta = TradingAgentsGraph(debug=False, config=config)

        q.put(
            {
                "type": "started",
                "message": f"Starting analysis for {ticker} on {date} using {model}",
                "agents": list(AGENT_DISPLAY_NAMES.keys()),
            }
        )

        init_state = ta.propagator.create_initial_state(ticker, date)
        args = ta.propagator.get_graph_args()
        # Override stream_mode so we get {node_name: state_update} chunks.
        # get_graph_args() already includes stream_mode, so we update rather than pass separately.
        args["stream_mode"] = "updates"

        # "Previous agent completes when next one starts" pattern.
        # This correctly handles debate rounds (agents cycling) and conditional nodes.
        current_agent: Optional[str] = None
        agent_outputs: dict[str, str] = {}
        accumulated_state: dict[str, Any] = {}

        def _emit_completed(key: str) -> None:
            q.put(
                {
                    "type": "agent_update",
                    "agent": key,
                    "displayName": AGENT_DISPLAY_NAMES.get(key, key),
                    "status": "completed",
                    "output": agent_outputs.get(key, ""),
                }
            )

        # stream_mode="updates" is set in args above → each chunk is {node_name: partial_state_update}
        for chunk in ta.graph.stream(init_state, **args):
            for node_name, updates in chunk.items():
                agent_key: Optional[str] = NODE_TO_AGENT.get(node_name)

                # Always accumulate full state for final decision extraction.
                if isinstance(updates, dict):
                    for k, v in updates.items():
                        if k == "messages" and isinstance(v, list):
                            accumulated_state.setdefault("messages", [])
                            accumulated_state["messages"] = accumulated_state["messages"] + v
                        else:
                            accumulated_state[k] = v

                if agent_key is None:
                    continue

                output = _extract_node_output(updates)
                if output:
                    agent_outputs[agent_key] = output

                # New agent coming in → complete the previous one, start this one
                if agent_key != current_agent:
                    if current_agent is not None:
                        _emit_completed(current_agent)
                    current_agent = agent_key
                    q.put(
                        {
                            "type": "agent_update",
                            "agent": agent_key,
                            "displayName": AGENT_DISPLAY_NAMES.get(agent_key, agent_key),
                            "status": "running",
                            "output": "",
                        }
                    )

        # Mark the last active agent as completed.
        if current_agent is not None:
            _emit_completed(current_agent)

        # Extract decision from accumulated state (raw text → BUY/SELL/HOLD + full reasoning).
        raw_decision = str(
            accumulated_state.get("final_trade_decision")
            or accumulated_state.get("investment_plan")
            or "HOLD"
        )
        action, reasoning = _parse_decision(raw_decision)

        jobs[job_id]["status"] = "completed"
        jobs[job_id]["decision"] = action
        jobs[job_id]["reasoning"] = reasoning

        q.put(
            {
                "type": "completed",
                "decision": action,
                "reasoning": reasoning,
            }
        )

    except Exception as exc:
        import traceback

        err_msg = f"{exc}\n{traceback.format_exc()}"
        print(f"[ERROR in run_analysis_thread] {err_msg}", flush=True)
        jobs[job_id]["status"] = "error"
        jobs[job_id]["error"] = str(exc)

        q.put({"type": "error", "message": str(exc)})

    finally:
        q.put(None)


class AnalyzeRequest(BaseModel):
    ticker: str
    date: str
    model: str = "minimax/minimax-m2.5:online"
    max_debate_rounds: int = 1


@app.post("/agent/analyze")
async def start_analysis(req: AnalyzeRequest) -> dict[str, str]:
    job_id = str(uuid.uuid4())
    jobs[job_id] = {
        "status": "running",
        "queue": Queue(),
        "decision": None,
        "reasoning": None,
        "error": None,
    }

    thread = threading.Thread(
        target=run_analysis_thread,
        args=(job_id, req.ticker, req.date, req.model, req.max_debate_rounds),
        daemon=True,
    )
    thread.start()

    return {"job_id": job_id}


@app.get("/agent/stream/{job_id}")
async def stream_job(job_id: str) -> StreamingResponse:
    if job_id not in jobs:
        raise HTTPException(status_code=404, detail="Job not found")

    async def generate():  # type: ignore[return]
        q = jobs[job_id]["queue"]
        loop = asyncio.get_event_loop()

        while True:
            try:
                event = await loop.run_in_executor(None, lambda: q.get(timeout=20))
                if event is None:
                    yield f"data: {json.dumps({'type': 'done'})}\n\n"
                    break
                yield f"data: {json.dumps(event)}\n\n"
            except Empty:
                yield ": keepalive\n\n"

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )


@app.get("/agent/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    port = int(os.environ.get("PORT", "8001"))
    uvicorn.run(app, host="0.0.0.0", port=port, log_level="info")
