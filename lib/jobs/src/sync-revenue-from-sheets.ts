/**
 * Nightly sync job: reads revenue data from Google Sheets and upserts into the
 * revenue table. Covers 씨티오브드림스 (City of Dreams) only.
 *
 * Scheduled to run at 23:00 KST (14:00 UTC) daily via Replit workflow.
 *
 * Column layout expected in the sheet:
 *   year | month | 전체 (total amount) | category | memo
 *
 * Run manually: pnpm --filter @workspace/jobs tsx src/sync-revenue-from-sheets.ts
 */

import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { revenueTable } from "@workspace/db/schema";
import { sql } from "drizzle-orm";

const { Pool } = pg;

const CITY_OF_DREAMS_ID = "c0000001-0000-0000-0000-000000000007";

// ---------------------------------------------------------------------------
// Google Sheets client via Replit connector
// ---------------------------------------------------------------------------

async function getUncachableGoogleSheetsClient() {
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  if (!hostname) throw new Error("REPLIT_CONNECTORS_HOSTNAME not set — is the Google Sheets connector configured?");

  const connectionId = process.env.GOOGLE_SHEETS_CONNECTION_ID;
  if (!connectionId) throw new Error("GOOGLE_SHEETS_CONNECTION_ID env var not set");

  const identityToken = process.env.REPL_IDENTITY;
  const renewalToken = process.env.WEB_REPL_RENEWAL;

  const tokenRes = await fetch(
    `https://${hostname}/api/v2/connection/${connectionId}/token`,
    {
      headers: {
        "x-replit-identity": identityToken ?? "",
        "x-replit-renewal": renewalToken ?? "",
      },
    },
  );

  if (!tokenRes.ok) {
    throw new Error(`Failed to get connector token: ${tokenRes.status} ${await tokenRes.text()}`);
  }

  const { access_token } = (await tokenRes.json()) as { access_token: string };
  return access_token;
}

async function readSheet(spreadsheetId: string, range: string): Promise<string[][]> {
  const token = await getUncachableGoogleSheetsClient();

  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    throw new Error(`Sheets API error: ${res.status} ${await res.text()}`);
  }

  const data = (await res.json()) as { values?: string[][] };
  return data.values ?? [];
}

// ---------------------------------------------------------------------------
// Main sync logic
// ---------------------------------------------------------------------------

async function main() {
  const spreadsheetId = process.env.REVENUE_SHEET_ID;
  if (!spreadsheetId) throw new Error("REVENUE_SHEET_ID env var not set");

  const sheetRange = process.env.REVENUE_SHEET_RANGE ?? "Sheet1!A:F";

  console.log(`[sync-revenue] Reading sheet ${spreadsheetId} range ${sheetRange}…`);
  const rows = await readSheet(spreadsheetId, sheetRange);

  if (rows.length < 2) {
    console.log("[sync-revenue] Sheet is empty or has only headers — nothing to sync.");
    return;
  }

  const [headerRow, ...dataRows] = rows;
  const headers = headerRow.map((h) => h.trim().toLowerCase());

  const yearIdx = headers.indexOf("year");
  const monthIdx = headers.indexOf("month");
  const amountIdx = headers.findIndex((h) => h === "전체");
  const categoryIdx = headers.indexOf("category");
  const memoIdx = headers.indexOf("memo");

  if (yearIdx === -1 || monthIdx === -1 || amountIdx === -1) {
    throw new Error(`Required columns (year, month, 전체) not found. Headers found: ${headers.join(", ")}`);
  }

  type UpsertRow = {
    company_id: string;
    year: number;
    month: number;
    amount: string;
    category: string | null;
    memo: string | null;
  };

  const upsertRows: UpsertRow[] = [];

  for (const row of dataRows) {
    const yearVal = parseInt(row[yearIdx] ?? "", 10);
    const monthVal = parseInt(row[monthIdx] ?? "", 10);
    const rawAmount = (row[amountIdx] ?? "").replace(/[,\s]/g, "");
    const amountVal = parseFloat(rawAmount);

    if (isNaN(yearVal) || isNaN(monthVal) || isNaN(amountVal)) {
      console.warn(`[sync-revenue] Skipping invalid row: ${JSON.stringify(row)}`);
      continue;
    }

    upsertRows.push({
      company_id: CITY_OF_DREAMS_ID,
      year: yearVal,
      month: monthVal,
      amount: amountVal.toString(),
      category: categoryIdx !== -1 ? ((row[categoryIdx] ?? "").trim() || "매출") : "매출",
      memo: memoIdx !== -1 ? (row[memoIdx] ?? null) || null : null,
    });
  }

  if (upsertRows.length === 0) {
    console.log("[sync-revenue] No valid rows to upsert.");
    return;
  }

  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL not set");
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const db = drizzle(pool);

  let inserted = 0;
  let updated = 0;
  const BATCH = 50;

  for (let i = 0; i < upsertRows.length; i += BATCH) {
    const batch = upsertRows.slice(i, i + BATCH);
    // xmax = 0 for freshly inserted rows; xmax != 0 for rows updated via ON CONFLICT DO UPDATE
    const result = await db
      .insert(revenueTable)
      .values(batch)
      .onConflictDoUpdate({
        target: [
          revenueTable.company_id,
          revenueTable.year,
          revenueTable.month,
          revenueTable.category,
        ],
        set: {
          amount: sql`excluded.amount`,
          memo: sql`excluded.memo`,
        },
      })
      .returning({
        id: revenueTable.id,
        xmax: sql<string>`xmax::text`,
      });
    for (const row of result) {
      if (row.xmax === "0") {
        inserted++;
      } else {
        updated++;
      }
    }
  }

  console.log(
    `[sync-revenue] Done — ${inserted} inserted, ${updated} updated` +
    ` (${inserted + updated} total from ${upsertRows.length} sheet rows).`,
  );
  await pool.end();
}

main().catch((err) => {
  console.error("[sync-revenue] Fatal error:", err);
  process.exit(1);
});
