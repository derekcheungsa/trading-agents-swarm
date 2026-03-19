import express, { type Express } from "express";
import cors from "cors";
import path from "node:path";
import fs from "node:fs";
import router from "./routes";

const app: Express = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);

// In production, Express also owns the root path (artifact routing configured for /api and /).
// Serve the compiled React dashboard from the build output directory.
if (process.env["NODE_ENV"] === "production") {
  const staticDir = path.join(
    process.cwd(),
    "artifacts/trading-dashboard/dist/public"
  );
  if (fs.existsSync(staticDir)) {
    app.use(express.static(staticDir));
    // SPA fallback — send index.html for any unmatched route (Express 5 syntax)
    app.get("/*splat", (_req, res) => {
      res.sendFile(path.join(staticDir, "index.html"));
    });
  }
}

export default app;
