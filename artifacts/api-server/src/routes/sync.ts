import { Router } from "express";
import { spawn } from "child_process";
import { requireAuth } from "../lib/require-auth.js";

const router = Router();

router.post("/sync/revenue", requireAuth, (_req, res) => {
  const proc = spawn(
    "pnpm",
    ["--filter", "@workspace/jobs", "run", "sync-revenue"],
    { cwd: process.cwd(), env: process.env }
  );

  let stdout = "";
  let stderr = "";

  proc.stdout.on("data", (chunk: Buffer) => {
    stdout += chunk.toString();
  });

  proc.stderr.on("data", (chunk: Buffer) => {
    stderr += chunk.toString();
  });

  proc.on("close", (code) => {
    if (code === 0) {
      res.json({ success: true, message: stdout.trim() || "Sync completed successfully." });
    } else {
      res.status(500).json({
        success: false,
        message: stderr.trim() || stdout.trim() || `Process exited with code ${code}`,
      });
    }
  });

  proc.on("error", (err) => {
    res.status(500).json({ success: false, message: err.message });
  });
});

export default router;
