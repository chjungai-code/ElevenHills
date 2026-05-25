/**
 * Sync job: re-enumerates the user's `정주현_법인세_서류_2025` Google Drive
 * folder and upserts every file inside its numbered subfolders into the
 * `tax_document_2025` table. Files that are no longer in Drive are deleted.
 *
 * Triggered manually by an admin via `POST /api/sync/tax-documents`, or
 * by running:  pnpm --filter @workspace/jobs run sync-tax-documents
 *
 * Folder layout (numbered subfolders keyed to a company by their `NN_` prefix):
 *   01_… → COD_SPORTS
 *   02_… → BNF_SPORTS
 *   03_… → NRD
 *   04_… → CITY_OF_DREAMS
 *   05_… → SGD_PARTNERS   (법인세신고서)
 *   06_… → COD_RETAIL
 *   07_… → SGD_PARTNERS   (재무제표최종본)
 */

import { ReplitConnectors } from "@replit/connectors-sdk";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { taxDocument2025Table } from "@workspace/db/schema";
import { sql, notInArray } from "drizzle-orm";

const { Pool } = pg;

const ROOT_FOLDER_ID = "1YHd0kUpXFwWyf23zfXwWKwpozk3r5Tpr";

const PREFIX_TO_COMPANY_ID: Record<string, string> = {
  "01": "c0000001-0000-0000-0000-000000000008", // COD_SPORTS
  "02": "c0000001-0000-0000-0000-000000000009", // BNF_SPORTS
  "03": "c0000001-0000-0000-0000-000000000006", // NRD
  "04": "c0000001-0000-0000-0000-000000000007", // CITY_OF_DREAMS
  "05": "c0000001-0000-0000-0000-000000000005", // SGD_PARTNERS
  "06": "c0000001-0000-0000-0000-000000000002", // COD_RETAIL
  "07": "c0000001-0000-0000-0000-000000000005", // SGD_PARTNERS
};

// ---------------------------------------------------------------------------
// Drive client (via Replit connectors proxy)
// ---------------------------------------------------------------------------

type DriveFile = {
  id: string;
  name: string;
  mimeType: string;
  webViewLink?: string;
};

async function driveList(
  connectors: ReplitConnectors,
  query: string,
): Promise<DriveFile[]> {
  const out: DriveFile[] = [];
  let pageToken: string | undefined;

  do {
    const params = new URLSearchParams({
      q: query,
      fields: "nextPageToken,files(id,name,mimeType,webViewLink)",
      pageSize: "1000",
      orderBy: "name",
      supportsAllDrives: "true",
      includeItemsFromAllDrives: "true",
    });
    if (pageToken) params.set("pageToken", pageToken);

    const res = await connectors.proxy(
      "google-drive",
      `/drive/v3/files?${params.toString()}`,
      { method: "GET" },
    );
    if (!res.ok) {
      throw new Error(`Drive API error: ${res.status} ${await res.text()}`);
    }
    const body = (await res.json()) as {
      files?: DriveFile[];
      nextPageToken?: string;
    };
    out.push(...(body.files ?? []));
    pageToken = body.nextPageToken;
  } while (pageToken);

  return out;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

type UpsertRow = {
  file_id: string;
  company_id: string;
  subfolder: string;
  subfolder_order: number;
  name: string;
  web_view_link: string;
  mime_type: string;
};

export async function syncTaxDocuments2025(): Promise<{
  inserted: number;
  updated: number;
  deleted: number;
  total: number;
}> {
  const connectors = new ReplitConnectors();

  const subfolders = await driveList(
    connectors,
    `'${ROOT_FOLDER_ID}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
  );
  console.log(
    `[sync-tax-documents] Found ${subfolders.length} subfolder(s) under root.`,
  );

  const rows: UpsertRow[] = [];

  for (const folder of subfolders) {
    const match = /^(\d{2})_/.exec(folder.name);
    if (!match) {
      console.warn(
        `[sync-tax-documents] Skipping subfolder without NN_ prefix: ${folder.name}`,
      );
      continue;
    }
    const prefix = match[1];
    const companyId = PREFIX_TO_COMPANY_ID[prefix];
    if (!companyId) {
      console.warn(
        `[sync-tax-documents] No company mapped for prefix "${prefix}" (folder: ${folder.name})`,
      );
      continue;
    }

    const files = await driveList(
      connectors,
      `'${folder.id}' in parents and mimeType != 'application/vnd.google-apps.folder' and trashed = false`,
    );

    for (const file of files) {
      if (!file.webViewLink) continue;
      rows.push({
        file_id: file.id,
        company_id: companyId,
        subfolder: folder.name,
        subfolder_order: parseInt(prefix, 10),
        name: file.name,
        web_view_link: file.webViewLink,
        mime_type: file.mimeType,
      });
    }
  }

  console.log(`[sync-tax-documents] Enumerated ${rows.length} file(s).`);

  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL not set");
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const db = drizzle(pool);

  let inserted = 0;
  let updated = 0;
  let deleted = 0;

  try {
    if (rows.length > 0) {
      const result = await db
        .insert(taxDocument2025Table)
        .values(rows)
        .onConflictDoUpdate({
          target: taxDocument2025Table.file_id,
          set: {
            company_id: sql`excluded.company_id`,
            subfolder: sql`excluded.subfolder`,
            subfolder_order: sql`excluded.subfolder_order`,
            name: sql`excluded.name`,
            web_view_link: sql`excluded.web_view_link`,
            mime_type: sql`excluded.mime_type`,
            synced_at: sql`now()`,
          },
        })
        .returning({
          file_id: taxDocument2025Table.file_id,
          xmax: sql<string>`xmax::text`,
        });

      for (const r of result) {
        if (r.xmax === "0") inserted++;
        else updated++;
      }
    }

    // Delete rows that were not seen in this run.
    const keepIds = rows.map((r) => r.file_id);
    if (keepIds.length === 0) {
      const res = await db.delete(taxDocument2025Table).returning({
        file_id: taxDocument2025Table.file_id,
      });
      deleted = res.length;
    } else {
      const res = await db
        .delete(taxDocument2025Table)
        .where(notInArray(taxDocument2025Table.file_id, keepIds))
        .returning({ file_id: taxDocument2025Table.file_id });
      deleted = res.length;
    }
  } finally {
    await pool.end();
  }

  const summary = {
    inserted,
    updated,
    deleted,
    total: inserted + updated,
  };
  console.log(
    `[sync-tax-documents] Done — ${inserted} inserted, ${updated} updated, ${deleted} deleted.`,
  );
  return summary;
}

// Allow `tsx src/sync-tax-documents.ts` invocation.
const invokedDirectly =
  import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1]?.endsWith("sync-tax-documents.ts");

if (invokedDirectly) {
  syncTaxDocuments2025().catch((err) => {
    console.error("[sync-tax-documents] Fatal error:", err);
    process.exit(1);
  });
}
