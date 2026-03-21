# Trading Agents Swarm

A web-based trading analysis platform built on top of [TauricResearch/TradingAgents](https://github.com/TauricResearch/TradingAgents). This fork adds a React web UI, a REST/SSE API layer, PostgreSQL persistence, and one-click Railway deployment.

## What's Added vs the Original

| Feature | Original TradingAgents | This Fork |
|---|---|---|
| Interface | Python CLI | React web dashboard |
| API | None | Express REST + SSE streaming |
| Persistence | None | PostgreSQL (Drizzle ORM) |
| Deployment | Local only | Railway (Docker) |
| Real-time updates | None | Server-Sent Events |
| Consensus mode | None | 4-model parallel analysis with vote tally |

## How It Works

Enter a stock ticker and date. Nine AI agents run in parallel and stream their analysis in real-time. A final BUY / HOLD / SELL decision is returned with full reasoning. In **Consensus mode**, run 4 different LLMs simultaneously and see if they agree.

```
Browser → Express API (Node.js) → FastAPI Agent Service (Python)
                ↓                           ↓
          PostgreSQL DB          TradingAgents LangGraph
```

1. **React Dashboard** — submits analysis requests, streams live agent progress via SSE
2. **Express API** (`artifacts/api-server`) — REST endpoints, SSE proxy, stores results in Postgres
3. **Python Agent** (`artifacts/python-agent`) — runs the TradingAgents LangGraph framework on port 8000 (internal)

## Deploy to Railway

[![Deploy on Railway](https://railway.com/button.svg)](https://railway.com/new/template?template=https://github.com/derekcheungsa/trading-agents-swarm)

### Required Environment Variables

| Variable | Description |
|---|---|
| `OPENROUTER_API_KEY` | OpenRouter API key — used for all LLM calls. Get one at [openrouter.ai/keys](https://openrouter.ai/keys) |
| `DATABASE_URL` | PostgreSQL connection string. On Railway, add a Postgres plugin and set this to `${{Postgres.DATABASE_URL}}` |
| `FINANCIAL_MODELING_PREP_API_KEY` | FMP API key for financial data. Get one at [financialmodelingprep.com](https://financialmodelingprep.com/developer/docs) |

### Setup Steps

1. Click the **Deploy on Railway** button above
2. Add a **PostgreSQL** database plugin in the Railway dashboard
3. Set `OPENROUTER_API_KEY`, `DATABASE_URL` (`${{Postgres.DATABASE_URL}}`), and `FINANCIAL_MODELING_PREP_API_KEY`
4. Railway detects the `Dockerfile` automatically — the build starts on first deploy

> **Database schema** is pushed automatically on first startup via Drizzle.

## Local Development

### Prerequisites

- Node.js 24+
- pnpm (`npm install -g pnpm`)
- Python 3.12+
- PostgreSQL

### Setup

```bash
git clone https://github.com/derekcheungsa/trading-agents-swarm
cd trading-agents-swarm

# Install Node.js deps
pnpm install

# Install Python deps
pip install -r artifacts/python-agent/requirements.txt

# Copy and fill in env vars
cp .env.example .env

# Push DB schema
pnpm --filter @workspace/db run push

# Start everything
bash production-start.sh
```

Open [http://localhost:8080](http://localhost:8080).

## Project Structure

```
├── artifacts/
│   ├── api-server/          # Express 5 REST API + SSE proxy
│   ├── python-agent/        # FastAPI wrapper around TradingAgents
│   └── trading-dashboard/   # React + Vite frontend
├── lib/
│   ├── db/                  # Drizzle ORM schema + Postgres connection
│   ├── api-spec/            # OpenAPI 3.1 spec + Orval codegen
│   ├── api-zod/             # Generated Zod schemas
│   └── api-client-react/    # Generated React Query hooks
├── Dockerfile               # Single-stage Node 24 + Python 3.12 image
├── railway.json             # Railway deployment config
├── .env.example             # Required environment variables
└── production-start.sh      # Starts Python agent + Express in sequence
```

## API Endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/healthz` | Health check |
| `POST` | `/api/analyze` | Start a new analysis |
| `GET` | `/api/analyses` | List all analyses |
| `GET` | `/api/analyses/:id` | Get a single analysis |
| `GET` | `/api/analyses/:id/stream` | SSE stream of agent progress |
| `GET` | `/api/analyses/:id/logs` | Persisted agent log events |

## Models

Any [OpenRouter](https://openrouter.ai/models)-compatible model can be specified per-analysis through the UI. Default single-model: `minimax/minimax-m2.5:nitro`. Default consensus set (4 models): `openai/gpt-5.4:nitro`, `z-ai/glm-5:nitro`, `google/gemini-3.1-pro-preview`, `minimax/minimax-m2.7:nitro`.

## Roadmap

- [ ] Portfolio-level analysis (multiple tickers)
- [ ] Scheduled/recurring analyses
- [ ] Alert system (email/webhook on BUY/SELL signals)
- [ ] Custom agent configuration
- [ ] Historical analysis tracking and charting

## Credits

- [TauricResearch/TradingAgents](https://github.com/TauricResearch/TradingAgents) — the underlying multi-agent LLM trading framework
