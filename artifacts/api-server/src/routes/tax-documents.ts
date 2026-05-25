import { Router, type IRouter, type Request } from "express";
import { spawn } from "child_process";
import { db } from "@workspace/db";
import { taxDocument2025Table } from "@workspace/db/schema";
import { asc } from "drizzle-orm";
import { requireAdmin } from "../lib/require-admin.js";

const router: IRouter = Router();

function logError(req: Request, err: unknown, msg: string): void {
  const log = (req as { log?: { error: (err: unknown, msg: string) => void } }).log;
  if (log) log.error(err, msg);
  else console.error(msg, err);
}

type TaxDocument = {
  name: string;
  webViewLink: string;
  mimeType: string;
};

type TaxDocumentFolder = {
  subfolder: string;
  files: TaxDocument[];
};

// ─── GET /tax-documents ───────────────────────────────────────────────────
//
// Returns the cached Drive enumeration grouped by company → subfolder.
// Shape matches the dashboard's TaxDocumentFolder model.
router.get("/tax-documents", async (req, res) => {
  try {
    const rows = await db
      .select()
      .from(taxDocument2025Table)
      .orderBy(
        asc(taxDocument2025Table.company_id),
        asc(taxDocument2025Table.subfolder_order),
        asc(taxDocument2025Table.name),
      );

    const grouped: Record<string, TaxDocumentFolder[]> = {};
    let lastSyncedAt: string | null = null;

    for (const r of rows) {
      const folders = (grouped[r.company_id] ??= []);
      let folder = folders.find((f) => f.subfolder === r.subfolder);
      if (!folder) {
        folder = { subfolder: r.subfolder, files: [] };
        folders.push(folder);
      }
      folder.files.push({
        name: r.name,
        webViewLink: r.web_view_link,
        mimeType: r.mime_type,
      });
      const iso = r.synced_at.toISOString();
      if (!lastSyncedAt || iso > lastSyncedAt) lastSyncedAt = iso;
    }

    res.json({ documents: grouped, last_synced_at: lastSyncedAt });
  } catch (err) {
    logError(req, err, "Failed to load tax documents");
    res.status(500).json({ error: "Failed to load tax documents" });
  }
});

// ─── POST /sync/tax-documents (admin) ─────────────────────────────────────
//
// Spawns the sync job, which re-enumerates the Drive folder and upserts
// the result into the tax_document_2025 table.
router.post("/sync/tax-documents", requireAdmin, (_req, res) => {
  const proc = spawn(
    "pnpm",
    ["--filter", "@workspace/jobs", "run", "sync-tax-documents"],
    { cwd: process.cwd(), env: process.env },
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
      res.json({
        success: true,
        message: stdout.trim() || "Sync completed successfully.",
      });
    } else {
      res.status(500).json({
        success: false,
        message:
          stderr.trim() || stdout.trim() || `Process exited with code ${code}`,
      });
    }
  });

  proc.on("error", (err) => {
    res.status(500).json({ success: false, message: err.message });
  });
});

export default router;
