import { Router, type IRouter } from "express";
import { desc, eq } from "drizzle-orm";
import http from "node:http";
import { db, analysesTable, analysisLogsTable } from "@workspace/db";
import {
  CreateAnalysisBody,
  GetAnalysisParams,
  GetAnalysisResponse,
  ListAnalysesResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

const PYTHON_AGENT_HOST = "localhost";
const PYTHON_AGENT_PORT = parseInt(
  process.env.PYTHON_AGENT_PORT ?? "8000",
  10
);

// ---------------------------------------------------------------------------
// Fan-out event cache
// Each running job gets an entry here. Events are buffered so that both the
// background DB-update consumer and any number of frontend SSE clients can
// receive every event — even if the frontend connects after the job starts.
// ---------------------------------------------------------------------------
interface JobCache {
  lines: string[];        // raw "data: {...}\n\n" lines, in order
  done: boolean;          // true once the Python stream has ended
  listeners: Set<(line: string) => void>;
  sequence: number;       // monotonic counter for analysis_logs ordering
}

const jobCaches = new Map<string, JobCache>();

function getOrCreateCache(jobId: string): JobCache {
  if (!jobCaches.has(jobId)) {
    jobCaches.set(jobId, { lines: [], done: false, listeners: new Set(), sequence: 0 });
  }
  return jobCaches.get(jobId)!;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function normalizeDecision(raw: unknown): string {
  const str = typeof raw === "string" ? raw : JSON.stringify(raw);

  // Priority 1 — labeled patterns: "Recommendation: SELL", "Final Decision: BUY", etc.
  // Take the LAST match so the conclusion wins over any prior bull/bear discussion.
  const labeled = /\b(?:final\s+)?(?:recommendation|decision|action|proposal)\s*[:\-]\s*\*{0,2}(BUY|SELL|HOLD)\*{0,2}/gi;
  let labeledMatch: RegExpExecArray | null;
  let lastLabeled: string | null = null;
  while ((labeledMatch = labeled.exec(str)) !== null) lastLabeled = labeledMatch[1].toUpperCase();
  if (lastLabeled) return lastLabeled;

  // Priority 2 — bold markdown: **SELL** / **BUY** — last occurrence wins
  const bold = /\*{1,2}(BUY|SELL|HOLD)\*{1,2}/gi;
  let boldMatch: RegExpExecArray | null;
  let lastBold: string | null = null;
  while ((boldMatch = bold.exec(str)) !== null) lastBold = boldMatch[1].toUpperCase();
  if (lastBold) return lastBold;

  // Priority 3 — last bare keyword occurrence
  const upper = str.toUpperCase();
  const positions = (["BUY", "SELL", "HOLD"] as const).map((k) => ({ k, pos: upper.lastIndexOf(k) }));
  const best = positions.reduce((a, b) => (b.pos > a.pos ? b : a));
  return best.pos >= 0 ? best.k : "HOLD";
}

function saveEventToLog(
  analysisId: number,
  cache: JobCache,
  event: Record<string, unknown>
): void {
  const seq = cache.sequence++;
  db.insert(analysisLogsTable).values({
    analysisId,
    sequence: seq,
    eventType: String(event.type ?? ""),
    agent: typeof event.agent === "string" ? event.agent : null,
    displayName: typeof event.displayName === "string" ? event.displayName : null,
    status: typeof event.status === "string" ? event.status : null,
    output: typeof event.output === "string" ? event.output : null,
    message: typeof event.message === "string" ? event.message : null,
  }).catch(console.error);
}

function updateDbFromEvent(
  analysisId: number,
  event: { type: string; decision?: unknown; reasoning?: string; message?: string }
): void {
  if (event.type === "completed") {
    const decision = normalizeDecision(event.decision ?? "");
    db.update(analysesTable)
      .set({ status: "completed", decision, reasoning: event.reasoning ?? String(event.decision ?? "") })
      .where(eq(analysesTable.id, analysisId))
      .then(() => {})
      .catch(console.error);
  } else if (event.type === "error") {
    db.update(analysesTable)
      .set({ status: "error", errorMessage: event.message ?? "Unknown error" })
      .where(eq(analysesTable.id, analysisId))
      .then(() => {})
      .catch(console.error);
  }
}

// ---------------------------------------------------------------------------
// Start the single Python SSE consumer for a job.
// All events are:
//  1. Buffered in jobCaches so late-connecting frontend clients get the full history
//  2. Broadcast to any currently-connected frontend SSE listeners
//  3. Used to update the DB for completed/error events
// ---------------------------------------------------------------------------
function startJobConsumer(analysisId: number, jobId: string): void {
  const cache = getOrCreateCache(jobId);

  const req = http.request(
    {
      hostname: PYTHON_AGENT_HOST,
      port: PYTHON_AGENT_PORT,
      path: `/agent/stream/${jobId}`,
      method: "GET",
    },
    (pythonRes) => {
      let buffer = "";

      pythonRes.on("data", (chunk: Buffer) => {
        buffer += chunk.toString();
        const parts = buffer.split("\n\n");
        buffer = parts.pop() ?? "";

        for (const part of parts) {
          if (!part.trim()) continue;
          const sseBlock = part + "\n\n";

          // Buffer for future clients
          cache.lines.push(sseBlock);

          // Broadcast to currently-connected frontend clients
          for (const listener of cache.listeners) {
            listener(sseBlock);
          }

          // Persist log + update DB if needed
          for (const rawLine of part.split("\n")) {
            if (rawLine.startsWith("data: ")) {
              try {
                const event = JSON.parse(rawLine.slice(6));
                saveEventToLog(analysisId, cache, event);
                updateDbFromEvent(analysisId, event);
              } catch {}
            }
          }
        }
      });

      pythonRes.on("end", () => {
        if (buffer.trim()) {
          const sseBlock = buffer + "\n\n";
          cache.lines.push(sseBlock);
          for (const listener of cache.listeners) {
            listener(sseBlock);
          }
        }
        cache.done = true;
        for (const listener of cache.listeners) {
          listener(""); // sentinel: empty string means "done"
        }
        // Clean up after a delay so any late-connecting clients can still read the full history
        setTimeout(() => jobCaches.delete(jobId), 5 * 60_000);
      });

      pythonRes.on("error", (err) => {
        const errLine = `data: ${JSON.stringify({ type: "error", message: err.message })}\n\n`;
        cache.lines.push(errLine);
        for (const listener of cache.listeners) {
          listener(errLine);
        }
        cache.done = true;
        for (const listener of cache.listeners) {
          listener("");
        }
        updateDbFromEvent(analysisId, { type: "error", message: err.message });
      });
    }
  );

  req.on("error", (err) => {
    const errLine = `data: ${JSON.stringify({ type: "error", message: `Could not connect to Python agent: ${err.message}` })}\n\n`;
    const cache2 = getOrCreateCache(jobId);
    cache2.lines.push(errLine);
    for (const listener of cache2.listeners) {
      listener(errLine);
    }
    cache2.done = true;
    for (const listener of cache2.listeners) {
      listener("");
    }
    updateDbFromEvent(analysisId, { type: "error", message: err.message });
  });

  req.end();
}

async function callPythonAgent(
  path: string,
  method: "GET" | "POST",
  body?: object
): Promise<{ ok: boolean; data?: unknown; error?: string }> {
  return new Promise((resolve) => {
    const bodyStr = body ? JSON.stringify(body) : undefined;

    const req = http.request(
      {
        hostname: PYTHON_AGENT_HOST,
        port: PYTHON_AGENT_PORT,
        path,
        method,
        headers: {
          "Content-Type": "application/json",
          ...(bodyStr ? { "Content-Length": Buffer.byteLength(bodyStr) } : {}),
        },
        timeout: 10000,
      },
      (res) => {
        let rawData = "";
        res.on("data", (chunk) => {
          rawData += chunk;
        });
        res.on("end", () => {
          try {
            resolve({ ok: true, data: JSON.parse(rawData) });
          } catch {
            resolve({ ok: false, error: "Invalid JSON from Python agent" });
          }
        });
      }
    );

    req.on("error", (err) => {
      resolve({ ok: false, error: err.message });
    });
    req.on("timeout", () => {
      req.destroy();
      resolve({ ok: false, error: "Python agent request timed out" });
    });

    if (bodyStr) {
      req.write(bodyStr);
    }
    req.end();
  });
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

router.post("/analyze", async (req, res): Promise<void> => {
  const parsed = CreateAnalysisBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { ticker, date, model, maxDebateRounds } = parsed.data;

  const result = await callPythonAgent("/agent/analyze", "POST", {
    ticker: ticker.toUpperCase(),
    date,
    model: model ?? "minimax/minimax-m2.5:nitro",
    max_debate_rounds: maxDebateRounds ?? 1,
  });

  if (!result.ok || !result.data) {
    res.status(503).json({
      error: `Python agent unavailable: ${result.error ?? "unknown error"}. Please ensure the Python service is running.`,
    });
    return;
  }

  const { job_id } = result.data as { job_id: string };

  let analysis: typeof analysesTable.$inferSelect;
  try {
    const [row] = await db
      .insert(analysesTable)
      .values({
        ticker: ticker.toUpperCase(),
        date,
        model: model ?? "minimax/minimax-m2.5:nitro",
        status: "running",
        jobId: job_id,
      })
      .returning();
    analysis = row;
  } catch (dbErr) {
    console.error("DB insert failed:", dbErr);
    res.status(503).json({ error: "Database unavailable. Ensure DATABASE_URL is set and the Postgres service is running." });
    return;
  }

  // Start the single fan-out consumer. It buffers every event so frontend
  // clients can connect at any time and still receive the full stream.
  startJobConsumer(analysis.id, job_id);

  res.status(201).json(GetAnalysisResponse.parse(analysis));
});

router.get("/analyses", async (_req, res): Promise<void> => {
  const rows = await db
    .select()
    .from(analysesTable)
    .orderBy(desc(analysesTable.createdAt));

  res.json(ListAnalysesResponse.parse(rows));
});

router.get("/analyses/:id", async (req, res): Promise<void> => {
  const params = GetAnalysisParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [analysis] = await db
    .select()
    .from(analysesTable)
    .where(eq(analysesTable.id, params.data.id));

  if (!analysis) {
    res.status(404).json({ error: "Analysis not found" });
    return;
  }

  res.json(GetAnalysisResponse.parse(analysis));
});

router.get("/analyses/:id/logs", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const logs = await db
    .select()
    .from(analysisLogsTable)
    .where(eq(analysisLogsTable.analysisId, id))
    .orderBy(analysisLogsTable.sequence);
  res.json(logs);
});

router.get("/analyses/:id/stream", async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(rawId, 10);

  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }

  const [analysis] = await db
    .select()
    .from(analysesTable)
    .where(eq(analysesTable.id, id));

  if (!analysis) {
    res.status(404).json({ error: "Analysis not found" });
    return;
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  const cache = jobCaches.get(analysis.jobId ?? "");

  // Case 1: Already finished
  if (analysis.status === "completed" || analysis.status === "error") {
    if (cache && cache.lines.length > 0) {
      // Serve full event history from in-memory cache (available for 60s after completion)
      for (const line of cache.lines) {
        res.write(line);
      }
      res.end();
    } else {
      // Cache expired — synthesize just the final event from DB
      const eventPayload =
        analysis.status === "completed"
          ? { type: "completed", decision: analysis.decision, reasoning: analysis.reasoning }
          : { type: "error", message: analysis.errorMessage ?? "Unknown error" };
      res.write(`data: ${JSON.stringify(eventPayload)}\n\n`);
      res.write(`data: ${JSON.stringify({ type: "done" })}\n\n`);
      res.end();
    }
    return;
  }

  // Case 2: Still running — serve from fan-out cache
  if (!cache) {
    // No cache = job was started before this server instance (e.g. after restart)
    res.write(`data: ${JSON.stringify({ type: "error", message: "Stream no longer available. The server may have restarted." })}\n\n`);
    res.end();
    return;
  }

  // Replay all buffered events first
  for (const line of cache.lines) {
    res.write(line);
  }

  // If already done, close
  if (cache.done) {
    res.end();
    return;
  }

  // Subscribe to future events
  const listener = (sseBlock: string) => {
    if (sseBlock === "") {
      // sentinel: stream ended
      clearInterval(heartbeat);
      res.end();
    } else {
      res.write(sseBlock);
    }
  };

  cache.listeners.add(listener);

  // Keep the browser → proxy → Express connection alive.
  // Production reverse proxies cut idle SSE connections after ~60s.
  // Send an SSE comment (invisible to the client) every 25 seconds.
  const heartbeat = setInterval(() => {
    res.write(": ping\n\n");
  }, 25_000);

  req.on("close", () => {
    clearInterval(heartbeat);
    cache.listeners.delete(listener);
  });
});

export default router;
