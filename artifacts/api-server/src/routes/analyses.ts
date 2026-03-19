import { Router, type IRouter } from "express";
import { desc, eq } from "drizzle-orm";
import http from "node:http";
import { db, analysesTable } from "@workspace/db";
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
    model: model ?? "minimax/minimax-m2.5:online",
    max_debate_rounds: maxDebateRounds ?? 1,
  });

  if (!result.ok || !result.data) {
    res.status(503).json({
      error: `Python agent unavailable: ${result.error ?? "unknown error"}. Please ensure the Python service is running.`,
    });
    return;
  }

  const { job_id } = result.data as { job_id: string };

  const [analysis] = await db
    .insert(analysesTable)
    .values({
      ticker: ticker.toUpperCase(),
      date,
      model: model ?? "minimax/minimax-m2.5:online",
      status: "running",
      jobId: job_id,
    })
    .returning();

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

router.get("/analyses/:id/stream", async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.id)
    ? req.params.id[0]
    : req.params.id;
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

  if (analysis.status === "completed" || analysis.status === "error") {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();

    const eventPayload =
      analysis.status === "completed"
        ? {
            type: "completed",
            decision: analysis.decision,
            reasoning: analysis.reasoning,
          }
        : { type: "error", message: analysis.errorMessage ?? "Unknown error" };

    res.write(`data: ${JSON.stringify(eventPayload)}\n\n`);
    res.write(`data: ${JSON.stringify({ type: "done" })}\n\n`);
    res.end();
    return;
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  const pythonReq = http.request(
    {
      hostname: PYTHON_AGENT_HOST,
      port: PYTHON_AGENT_PORT,
      path: `/agent/stream/${analysis.jobId}`,
      method: "GET",
    },
    (pythonRes) => {
      let buffer = "";

      pythonRes.on("data", (chunk: Buffer) => {
        const text = chunk.toString();
        buffer += text;

        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          res.write(line + "\n");

          if (line.startsWith("data: ")) {
            try {
              const event = JSON.parse(line.slice(6));

              if (event.type === "completed") {
                const rawDecision: string =
                  typeof event.decision === "string"
                    ? event.decision
                    : JSON.stringify(event.decision);

                const upper = rawDecision.toUpperCase();
                const decision = upper.includes("BUY")
                  ? "BUY"
                  : upper.includes("SELL")
                    ? "SELL"
                    : "HOLD";

                db.update(analysesTable)
                  .set({
                    status: "completed",
                    decision,
                    reasoning: event.reasoning ?? rawDecision,
                  })
                  .where(eq(analysesTable.id, id))
                  .then(() => {})
                  .catch(console.error);
              } else if (event.type === "error") {
                db.update(analysesTable)
                  .set({
                    status: "error",
                    errorMessage: event.message ?? "Unknown error",
                  })
                  .where(eq(analysesTable.id, id))
                  .then(() => {})
                  .catch(console.error);
              }
            } catch {}
          }
        }
      });

      pythonRes.on("end", () => {
        if (buffer) res.write(buffer + "\n");
        res.end();
      });

      pythonRes.on("error", (err) => {
        res.write(
          `data: ${JSON.stringify({ type: "error", message: err.message })}\n\n`
        );
        res.end();
      });
    }
  );

  pythonReq.on("error", (err) => {
    res.write(
      `data: ${JSON.stringify({ type: "error", message: `Could not connect to Python agent: ${err.message}` })}\n\n`
    );
    res.end();
  });

  req.on("close", () => {
    pythonReq.destroy();
  });

  pythonReq.end();
});

export default router;
