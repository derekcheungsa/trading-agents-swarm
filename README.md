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

## How It Works

Enter a stock ticker and date. Nine AI agents run in parallel and stream their analysis in real-time. A final BUY / HOLD / SELL decision is returned with full reasoning.

```
Browser → Express API (Node.js) → FastAPI Agent Service (Python)
                ↓                           ↓
          PostgreSQL DB          TradingAgents LangGraph
```

1. **React Dashboard** — submits analysis requests, streams live agent progress via SSE
2. **Express API** (`artifacts/api-server`) — REST endpoints, SSE proxy, stores results in Postgres
3. **Python Agent** (`artifacts/python-agent`) — runs the TradingAgents LangGraph framework on port 8000 (internal)

## Deploy to Railway

[![Deploy on Railway](https://railway.com/button.svg)](https://railway.com/new/template)

### Manual Deploy

1. Fork this repo
2. Create a new Railway project and connect your fork
3. Add a **PostgreSQL** database plugin
4. Set environment variables:

| Variable | Description |
|---|---|
| `OPENROUTER_API_KEY` | OpenRouter API key (used as the LLM provider) |
| `FINANCIAL_MODELING_PREP_API_KEY` | FMP API key for financial data |
| `DATABASE_URL` | Set to `${{Postgres.DATABASE_URL}}` to reference the Postgres plugin |
| `NODE_ENV` | `production` |

5. Railway detects the `Dockerfile` and `railway.json` automatically — just deploy.

After first deploy, create the database schema:

```bash
# Get the public Postgres URL from Railway dashboard, then:
node -e "
const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'YOUR_DATABASE_PUBLIC_URL' });
pool.query(\`CREATE TABLE IF NOT EXISTS analyses (
  id SERIAL PRIMARY KEY, ticker TEXT NOT NULL, date TEXT NOT NULL,
  model TEXT NOT NULL DEFAULT 'minimax/minimax-m2.5:nitro',
  status TEXT NOT NULL DEFAULT 'pending', decision TEXT, reasoning TEXT,
  job_id TEXT NOT NULL, error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
)\`).then(() => { console.log('Done'); pool.end(); });
"
```

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

# Set environment variables
export DATABASE_URL=postgresql://localhost/trading_agents
export OPENROUTER_API_KEY=sk-or-...
export FINANCIAL_MODELING_PREP_API_KEY=...

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

## Models

The default LLM model is `minimax/minimax-m2.5:nitro` via OpenRouter. Any OpenRouter-compatible model can be specified per-analysis through the UI.

## Roadmap

This is the foundation for building additional capabilities on top of TradingAgents. Planned directions:

- [ ] Portfolio-level analysis (multiple tickers)
- [ ] Scheduled/recurring analyses
- [ ] Alert system (email/webhook on BUY/SELL signals)
- [ ] Custom agent configuration
- [ ] Historical analysis tracking and charting

## Credits

- [TauricResearch/TradingAgents](https://github.com/TauricResearch/TradingAgents) — the underlying multi-agent LLM trading framework
