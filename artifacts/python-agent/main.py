import asyncio
import json
import os
import sys
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

AGENT_SEARCH_TERMS: list[tuple[str, str]] = [
    ("market analyst", "market_analyst"),
    ("technical analyst", "market_analyst"),
    ("sentiment analyst", "social_analyst"),
    ("social analyst", "social_analyst"),
    ("news analyst", "news_analyst"),
    ("fundamentals analyst", "fundamentals_analyst"),
    ("fundamental analyst", "fundamentals_analyst"),
    ("bull researcher", "bull_researcher"),
    ("bullish researcher", "bull_researcher"),
    ("bear researcher", "bear_researcher"),
    ("bearish researcher", "bear_researcher"),
    ("research manager", "research_manager"),
    ("trader", "trader"),
    ("risk manager", "risk_manager"),
    ("portfolio manager", "portfolio_manager"),
]


class AgentOutputCapture:
    """Captures stdout and detects agent transitions from LangGraph debug output."""

    def __init__(self, queue: Queue) -> None:
        self.queue = queue
        self._original = sys.stdout
        self.current_agent: Optional[str] = None
        self.agent_lines: list[str] = []
        self.line_buffer = ""

    def write(self, text: str) -> None:
        self._original.write(text)
        self.line_buffer += text

        while "\n" in self.line_buffer:
            line, self.line_buffer = self.line_buffer.split("\n", 1)
            self._process_line(line)

    def _process_line(self, line: str) -> None:
        lower = line.lower()
        matched_agent: Optional[str] = None
        for term, key in AGENT_SEARCH_TERMS:
            if term in lower:
                matched_agent = key
                break

        if matched_agent and matched_agent != self.current_agent:
            if self.current_agent:
                self.queue.put(
                    {
                        "type": "agent_update",
                        "agent": self.current_agent,
                        "displayName": AGENT_DISPLAY_NAMES.get(
                            self.current_agent, self.current_agent
                        ),
                        "status": "completed",
                        "output": "\n".join(
                            l for l in self.agent_lines[-30:] if l.strip()
                        ),
                    }
                )
            self.current_agent = matched_agent
            self.agent_lines = []
            self.queue.put(
                {
                    "type": "agent_update",
                    "agent": matched_agent,
                    "displayName": AGENT_DISPLAY_NAMES.get(matched_agent, matched_agent),
                    "status": "running",
                    "output": "",
                }
            )
        elif self.current_agent:
            self.agent_lines.append(line)

    def flush(self) -> None:
        self._original.flush()

    def finalize(self) -> None:
        if self.current_agent:
            self.queue.put(
                {
                    "type": "agent_update",
                    "agent": self.current_agent,
                    "displayName": AGENT_DISPLAY_NAMES.get(
                        self.current_agent, self.current_agent
                    ),
                    "status": "completed",
                    "output": "\n".join(
                        l for l in self.agent_lines[-30:] if l.strip()
                    ),
                }
            )

    def __enter__(self) -> "AgentOutputCapture":
        sys.stdout = self
        return self

    def __exit__(self, *args: Any) -> None:
        sys.stdout = self._original


def _parse_decision(decision: Any) -> tuple[str, str]:
    """Parse TradingAgents decision into (action, reasoning)."""
    if isinstance(decision, dict):
        raw_action = (
            decision.get("action")
            or decision.get("decision")
            or decision.get("trade_action")
            or ""
        )
        reasoning = (
            decision.get("reasoning")
            or decision.get("explanation")
            or decision.get("rationale")
            or str(decision)
        )
    else:
        raw_action = str(decision)
        reasoning = str(decision)

    upper = raw_action.upper()
    if "BUY" in upper:
        action = "BUY"
    elif "SELL" in upper:
        action = "SELL"
    else:
        action = "HOLD"

    return action, reasoning


def _extract_state_reports(state: Any) -> dict[str, str]:
    """Extract agent reports from the final LangGraph state."""
    reports: dict[str, str] = {}
    if state is None:
        return reports

    state_dict: dict[str, Any] = {}
    if isinstance(state, dict):
        state_dict = state
    elif hasattr(state, "__dict__"):
        state_dict = state.__dict__
    elif hasattr(state, "_asdict"):
        state_dict = state._asdict()

    field_map = {
        "market_report": "market_analyst",
        "sentiment_report": "social_analyst",
        "news_report": "news_analyst",
        "fundamentals_report": "fundamentals_analyst",
        "bull_research_report": "bull_researcher",
        "bear_research_report": "bear_researcher",
        "investment_plan": "trader",
        "final_trade_decision": "portfolio_manager",
        "risk_debate_state": "risk_manager",
        "trader_investment_plan": "trader",
    }

    for field, agent_key in field_map.items():
        val = state_dict.get(field)
        if val:
            reports[agent_key] = str(val)[:3000]

    return reports


def run_analysis_thread(
    job_id: str,
    ticker: str,
    date: str,
    model: str,
    max_debate_rounds: int,
) -> None:
    q: Queue = jobs[job_id]["queue"]
    capture = AgentOutputCapture(q)

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

        q.put(
            {
                "type": "started",
                "message": f"Starting analysis for {ticker} on {date} using {model}",
                "agents": list(AGENT_DISPLAY_NAMES.keys()),
            }
        )

        with capture:
            ta = TradingAgentsGraph(debug=True, config=config)
            state, decision = ta.propagate(ticker, date)

        capture.finalize()

        action, reasoning = _parse_decision(decision)
        state_reports = _extract_state_reports(state)

        for agent_key, report_text in state_reports.items():
            q.put(
                {
                    "type": "agent_report",
                    "agent": agent_key,
                    "displayName": AGENT_DISPLAY_NAMES.get(agent_key, agent_key),
                    "output": report_text,
                }
            )

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
        capture._original.write(f"[ERROR] {err_msg}\n")
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
                event = await loop.run_in_executor(None, lambda: q.get(timeout=120))
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
