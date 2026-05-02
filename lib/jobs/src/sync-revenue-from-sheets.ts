/**
 * Nightly sync job: reads revenue data from Google Sheets and upserts into the
 * revenue table. Covers 씨티오브드림스 (City of Dreams) only.
 *
 * Scheduled to run at 23:00 KST (14:00 UTC) daily via the
 * "Nightly Revenue Sync" Replit workflow.
 *
 * The "2026년" tab is a dashboard for the current month with this layout:
 *   row 0: title row
 *   row 1: header row — store names + "전체" (total) column
 *   row 2: "{N}월 1일 매출"            (current month, day 1 daily revenue)
 *   row 3: "{N}월 일평균"              (daily average)
 *   row 4: "이번달 현재까지"           (month-to-date total)
 *   row 5: "예상 월매출 (성장율)"      (projected monthly revenue)
 *   row 7: "전년 {N}월 매출"           (previous year, same month total)
 *
 * From this we extract two upsert rows per sync (using the value from the
 * "전체" column):
 *   1. (year=tabYear,   month=N, category="매출")     — 이번달 현재까지
 *   2. (year=tabYear-1, month=N, category="매출")     — 전년 동월
 *
 * Run manually: pnpm --filter @workspace/jobs run sync-revenue
 */

import { ReplitConnectors } from "@replit/connectors-sdk";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { revenueTable } from "@workspace/db/schema";
import { sql } from "drizzle-orm";

const { Pool } = pg;

const CITY_OF_DREAMS_ID = "c0000001-0000-0000-0000-000000000007";

// ---------------------------------------------------------------------------
// Google Sheets via Replit connectors SDK
// ---------------------------------------------------------------------------

async function readSheet(spreadsheetId: string, range: string): Promise<string[][]> {
  const connectors = new ReplitConnectors();
  const res = await connectors.proxy(
    "google-sheet",
    `/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}`,
    { method: "GET" },
  );

  if (!res.ok) {
    throw new Error(`Sheets API error: ${res.status} ${await res.text()}`);
  }

  const data = (await res.json()) as { values?: string[][] };
  return data.values ?? [];
}

// ---------------------------------------------------------------------------
// Sheet parsing
// ---------------------------------------------------------------------------

type UpsertRow = {
  company_id: string;
  year: number;
  month: number;
  amount: string;
  category: string;
  memo: string | null;
};

function parseAmount(raw: string | undefined): number | null {
  if (!raw) return null;
  const cleaned = raw.replace(/[,\s원]/g, "");
  const v = parseFloat(cleaned);
  return isNaN(v) ? null : v;
}

function extractRowsFromSheet(rows: string[][], tabName: string): UpsertRow[] {
  // Year is parsed from the tab name (e.g. "2026년" -> 2026)
  const yearMatch = tabName.match(/(\d{4})/);
  if (!yearMatch) {
    throw new Error(`Could not parse year from tab name "${tabName}". Expected something like "2026년".`);
  }
  const sheetYear = parseInt(yearMatch[1], 10);

  // Find the header row containing "전체"
  let headerRowIdx = -1;
  for (let i = 0; i < Math.min(rows.length, 5); i++) {
    if (rows[i].some((c) => c.trim() === "전체")) {
      headerRowIdx = i;
      break;
    }
  }
  if (headerRowIdx === -1) {
    throw new Error("Could not find header row containing '전체' column.");
  }
  const totalIdx = rows[headerRowIdx].findIndex((c) => c.trim() === "전체");
  console.log(`[sync-revenue] Header at row ${headerRowIdx}, '전체' at column ${totalIdx}.`);

  const dataRows = rows.slice(headerRowIdx + 1);

  // Determine the current month from a "{N}월 1일 매출" row
  let currentMonth: number | null = null;
  for (const row of dataRows) {
    const desc = (row[1] ?? "").trim();
    const m = desc.match(/^(\d{1,2})월\s*\d{1,2}일\s*매출/);
    if (m) {
      currentMonth = parseInt(m[1], 10);
      break;
    }
  }
  if (!currentMonth) {
    throw new Error("Could not determine current month from any '{N}월 {D}일 매출' row.");
  }
  console.log(`[sync-revenue] Detected current month: ${currentMonth}.`);

  const upsertRows: UpsertRow[] = [];

  for (const row of dataRows) {
    const desc = (row[1] ?? "").trim();
    const amount = parseAmount(row[totalIdx]);
    if (amount === null) continue;

    // Month-to-date for the current month/year
    if (desc === "이번달 현재까지") {
      upsertRows.push({
        company_id: CITY_OF_DREAMS_ID,
        year: sheetYear,
        month: currentMonth,
        amount: amount.toString(),
        category: "매출",
        memo: "이번달 현재까지 (Google Sheets 동기화)",
      });
    }

    // Previous year, same month total — pattern: "전년 {N}월 매출"
    const prevMatch = desc.match(/^전년\s*(\d{1,2})월\s*매출/);
    if (prevMatch) {
      const month = parseInt(prevMatch[1], 10);
      upsertRows.push({
        company_id: CITY_OF_DREAMS_ID,
        year: sheetYear - 1,
        month,
        amount: amount.toString(),
        category: "매출",
        memo: "전년 동월 (Google Sheets 동기화)",
      });
    }
  }

  return upsertRows;
}

// ---------------------------------------------------------------------------
// Main sync logic
// ---------------------------------------------------------------------------

async function main() {
  const spreadsheetId = process.env.REVENUE_SHEET_ID;
  if (!spreadsheetId) throw new Error("REVENUE_SHEET_ID env var not set");

  const sheetRange = process.env.REVENUE_SHEET_RANGE ?? "2026년!A:Z";
  const tabName = sheetRange.split("!")[0];

  console.log(`[sync-revenue] Reading sheet ${spreadsheetId} range ${sheetRange}…`);
  const rows = await readSheet(spreadsheetId, sheetRange);

  if (rows.length < 2) {
    console.log("[sync-revenue] Sheet is empty — nothing to sync.");
    return;
  }

  const upsertRows = extractRowsFromSheet(rows, tabName);

  if (upsertRows.length === 0) {
    console.log("[sync-revenue] No matching data rows found — nothing to upsert.");
    return;
  }

  console.log(`[sync-revenue] Prepared ${upsertRows.length} row(s) to upsert:`);
  for (const r of upsertRows) {
    console.log(`  - ${r.year}-${String(r.month).padStart(2, "0")} ${r.category} ${r.amount} (${r.memo})`);
  }

  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL not set");
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const db = drizzle(pool);

  let inserted = 0;
  let updated = 0;

  // xmax = 0 for freshly inserted rows; xmax != 0 for rows updated via ON CONFLICT DO UPDATE
  const result = await db
    .insert(revenueTable)
    .values(upsertRows)
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
    if (row.xmax === "0") inserted++;
    else updated++;
  }

  console.log(
    `[sync-revenue] Done — ${inserted} inserted, ${updated} updated` +
    ` (${inserted + updated} total).`,
  );
  await pool.end();
}

main().catch((err) => {
  console.error("[sync-revenue] Fatal error:", err);
  process.exit(1);
});
