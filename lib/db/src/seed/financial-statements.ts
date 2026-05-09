import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { eq, and, sql } from "drizzle-orm";
import {
  financialStatementTable,
  financialStatementLineTable,
} from "../schema/financial-statements.js";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL must be set");
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle(pool);

const COMPANY_IDS = {
  SGD_PARTNERS: "c0000001-0000-0000-0000-000000000005",
} as const;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "..", "..", "..", "..");

const ASSETS = {
  income:
    "attached_assets/2025_손익계산서(주.에스지디파트너스_본점)_감사수정_최종본_1778298836260.md",
  balance:
    "attached_assets/2025_재무상태표(주.에스지디파트너스_본점)_감사수정_최종본_1778298842499.md",
};

type ParsedLine = {
  account_name_ko: string;
  section_code: string | null;
  depth: number;
  is_subtotal: boolean;
  amount: string | null;
  prior_amount: string | null;
};

function normalizeName(raw: string): string {
  return raw.replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
}

function parseAmount(raw: string): string | null {
  const cleaned = raw.replace(/&nbsp;/g, "").trim();
  if (cleaned === "" || cleaned === "-") return null;
  const negative = cleaned.startsWith("△") || cleaned.startsWith("-");
  const digits = cleaned.replace(/[△,\-]/g, "");
  if (digits === "") return null;
  if (!/^\d+(\.\d+)?$/.test(digits)) return null;
  return (negative ? "-" : "") + digits;
}

function extractCells(rowHtml: string): string[] {
  const cells: string[] = [];
  const re = /<td[^>]*>([\s\S]*?)<\/td>/g;
  let m;
  while ((m = re.exec(rowHtml)) !== null) {
    const inner = m[1].replace(/<[^>]+>/g, "");
    cells.push(inner);
  }
  return cells;
}

function* iterateBodyRows(md: string): Iterable<string> {
  const tableRe = /<tbody>([\s\S]*?)<\/tbody>/g;
  let tm;
  while ((tm = tableRe.exec(md)) !== null) {
    const body = tm[1];
    const rowRe = /<tr>([\s\S]*?)<\/tr>/g;
    let rm;
    while ((rm = rowRe.exec(body)) !== null) {
      yield rm[1];
    }
  }
}

const SECTION_CODE_RE = /^([ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩ]+|VIII|IX|X)\.\s*/;

function classifyLine(name: string): {
  section_code: string | null;
  depth: number;
  is_subtotal: boolean;
} {
  const sectionMatch = name.match(SECTION_CODE_RE);
  if (sectionMatch) {
    return { section_code: sectionMatch[1], depth: 0, is_subtotal: true };
  }
  // Top-level section group titles like "자 산", "부 채", "자 본"
  const collapsed = name.replace(/\s+/g, "");
  if (["자산", "부채", "자본"].includes(collapsed)) {
    return { section_code: null, depth: 0, is_subtotal: true };
  }
  // Grand totals
  if (
    [
      "자산총계",
      "부채총계",
      "자본총계",
      "부채및자본총계",
    ].includes(collapsed)
  ) {
    return { section_code: null, depth: 0, is_subtotal: true };
  }
  // Subsection like "(1) 당 좌 자 산"
  if (/^\(\d+\)/.test(name)) {
    return { section_code: null, depth: 1, is_subtotal: true };
  }
  return { section_code: null, depth: 2, is_subtotal: false };
}

function parseStatement(mdPath: string): ParsedLine[] {
  const md = fs.readFileSync(mdPath, "utf8");
  const out: ParsedLine[] = [];
  for (const rowHtml of iterateBodyRows(md)) {
    const cells = extractCells(rowHtml).map((c) => c);
    if (cells.length === 0) continue;
    const name = normalizeName(cells[0]);
    if (!name) continue;
    // Skip "( 당 기 순 이 익 )" notes and the "당기 :" / "전기 :" annotation rows
    if (/^\(.+\)$/.test(name) && /당기순이익/.test(name)) continue;
    if (/^(당기|전기)\s*:/.test(name)) continue;

    let amount: string | null = null;
    let prior: string | null = null;

    if (cells.length >= 5) {
      // [name, sub_curr, total_curr, sub_prior, total_prior]
      const sCurr = parseAmount(cells[1] ?? "");
      const tCurr = parseAmount(cells[2] ?? "");
      const sPrior = parseAmount(cells[3] ?? "");
      const tPrior = parseAmount(cells[4] ?? "");
      amount = tCurr ?? sCurr;
      prior = tPrior ?? sPrior;
    } else if (cells.length >= 3) {
      // [name, curr, prior]
      amount = parseAmount(cells[1] ?? "");
      prior = parseAmount(cells[2] ?? "");
    } else if (cells.length === 2) {
      amount = parseAmount(cells[1] ?? "");
    }

    const cls = classifyLine(name);
    out.push({
      account_name_ko: name,
      ...cls,
      amount,
      prior_amount: prior,
    });
  }
  return out;
}

function toNum(s: string | null): number {
  return s == null ? 0 : Number(s);
}

type AmountKey = "amount" | "prior_amount";

function findValue(
  lines: ParsedLine[],
  key: AmountKey,
  target: string,
): string | null {
  const collapsed = (s: string) => s.replace(/\s+/g, "");
  const t = collapsed(target);
  for (const l of lines) {
    if (collapsed(l.account_name_ko).endsWith(t)) return l[key];
  }
  return null;
}

function verifyIncome(lines: ParsedLine[], year: string, key: AmountKey) {
  const rev = toNum(findValue(lines, key, "매출액"));
  const cogs = toNum(findValue(lines, key, "매출원가"));
  const gross = toNum(findValue(lines, key, "매출총이익"));
  if (Math.abs(rev - cogs - gross) > 1) {
    throw new Error(
      `[${year}] 매출액(${rev}) - 매출원가(${cogs}) != 매출총이익(${gross})`,
    );
  }
}

function verifyBalance(lines: ParsedLine[], year: string, key: AmountKey) {
  const assets = toNum(findValue(lines, key, "자산총계"));
  const liabPlusEq = toNum(findValue(lines, key, "부채및자본총계"));
  if (Math.abs(assets - liabPlusEq) > 1) {
    throw new Error(
      `[${year}] 자산총계(${assets}) != 부채및자본총계(${liabPlusEq})`,
    );
  }
}

async function upsertStatement(
  companyId: string,
  fiscalYear: number,
  statementType: "income_statement" | "balance_sheet",
  periodStart: string,
  periodEnd: string,
  lines: Array<{
    sort_order: number;
    depth: number;
    section_code: string | null;
    account_name_ko: string;
    amount: string | null;
    prior_amount: string | null;
    is_subtotal: boolean;
  }>,
) {
  const existing = await db
    .select()
    .from(financialStatementTable)
    .where(
      and(
        eq(financialStatementTable.company_id, companyId),
        eq(financialStatementTable.fiscal_year, fiscalYear),
        eq(financialStatementTable.statement_type, statementType),
      ),
    );

  let statementId: string;
  if (existing.length > 0) {
    statementId = existing[0].id;
    await db
      .update(financialStatementTable)
      .set({
        period_start: periodStart,
        period_end: periodEnd,
        currency: "KRW",
        unit: "won",
      })
      .where(eq(financialStatementTable.id, statementId));
  } else {
    const inserted = await db
      .insert(financialStatementTable)
      .values({
        company_id: companyId,
        fiscal_year: fiscalYear,
        statement_type: statementType,
        period_start: periodStart,
        period_end: periodEnd,
        currency: "KRW",
        unit: "won",
      })
      .returning({ id: financialStatementTable.id });
    statementId = inserted[0].id;
  }

  // Pass 1: upsert every line by (statement_id, sort_order) WITHOUT parent_line_id,
  // so we can resolve parent ids by sort_order in pass 2.
  for (const line of lines) {
    await db
      .insert(financialStatementLineTable)
      .values({
        statement_id: statementId,
        sort_order: line.sort_order,
        depth: line.depth,
        section_code: line.section_code,
        account_name_ko: line.account_name_ko,
        amount: line.amount,
        prior_amount: line.prior_amount,
        is_subtotal: line.is_subtotal,
        parent_line_id: null,
      })
      .onConflictDoUpdate({
        target: [
          financialStatementLineTable.statement_id,
          financialStatementLineTable.sort_order,
        ],
        set: {
          depth: sql`excluded.depth`,
          section_code: sql`excluded.section_code`,
          account_name_ko: sql`excluded.account_name_ko`,
          amount: sql`excluded.amount`,
          prior_amount: sql`excluded.prior_amount`,
          is_subtotal: sql`excluded.is_subtotal`,
          parent_line_id: sql`NULL`,
        },
      });
  }

  // Remove any orphaned rows beyond our seeded count BEFORE resolving parents,
  // so a stale parent row isn't referenced.
  const maxSort = lines.reduce((m, l) => Math.max(m, l.sort_order), 0);
  await db
    .delete(financialStatementLineTable)
    .where(
      and(
        eq(financialStatementLineTable.statement_id, statementId),
        sql`${financialStatementLineTable.sort_order} > ${maxSort}`,
      ),
    );

  // Pass 2: load ids by sort_order, walk a depth-stack to compute parent_line_id, and update.
  const stored = await db
    .select({
      id: financialStatementLineTable.id,
      sort_order: financialStatementLineTable.sort_order,
      depth: financialStatementLineTable.depth,
    })
    .from(financialStatementLineTable)
    .where(eq(financialStatementLineTable.statement_id, statementId));
  const idBySort = new Map<number, string>();
  for (const r of stored) idBySort.set(r.sort_order, r.id);

  // Stack of [depth, id] of the currently open ancestors, in order.
  const stack: Array<{ depth: number; id: string }> = [];
  for (const line of lines) {
    while (stack.length > 0 && stack[stack.length - 1].depth >= line.depth) {
      stack.pop();
    }
    const parentId =
      stack.length > 0 ? stack[stack.length - 1].id : null;
    const ownId = idBySort.get(line.sort_order);
    if (!ownId) continue;
    if (parentId !== null) {
      await db
        .update(financialStatementLineTable)
        .set({ parent_line_id: parentId })
        .where(eq(financialStatementLineTable.id, ownId));
    }
    stack.push({ depth: line.depth, id: ownId });
  }
}

async function seed() {
  const incomePath = path.join(REPO_ROOT, ASSETS.income);
  const balancePath = path.join(REPO_ROOT, ASSETS.balance);

  const incomeLines = parseStatement(incomePath);
  const balanceLines = parseStatement(balancePath);

  // Verify both the current (2025) and prior (2024) period columns satisfy
  // the basic K-GAAP identities before persisting either year.
  verifyIncome(incomeLines, "2025", "amount");
  verifyIncome(incomeLines, "2024", "prior_amount");
  verifyBalance(balanceLines, "2025", "amount");
  verifyBalance(balanceLines, "2024", "prior_amount");

  // 2025 statement: amount = current period (2025), prior_amount = prior (2024)
  const income2025 = incomeLines.map((l, i) => ({
    sort_order: i + 1,
    depth: l.depth,
    section_code: l.section_code,
    account_name_ko: l.account_name_ko,
    amount: l.amount,
    prior_amount: l.prior_amount,
    is_subtotal: l.is_subtotal,
  }));

  // 2024 statement derived: amount = (the prior period column from the 2025 markdown), prior_amount = null
  const income2024 = incomeLines.map((l, i) => ({
    sort_order: i + 1,
    depth: l.depth,
    section_code: l.section_code,
    account_name_ko: l.account_name_ko,
    amount: l.prior_amount,
    prior_amount: null,
    is_subtotal: l.is_subtotal,
  }));

  const balance2025 = balanceLines.map((l, i) => ({
    sort_order: i + 1,
    depth: l.depth,
    section_code: l.section_code,
    account_name_ko: l.account_name_ko,
    amount: l.amount,
    prior_amount: l.prior_amount,
    is_subtotal: l.is_subtotal,
  }));

  const balance2024 = balanceLines.map((l, i) => ({
    sort_order: i + 1,
    depth: l.depth,
    section_code: l.section_code,
    account_name_ko: l.account_name_ko,
    amount: l.prior_amount,
    prior_amount: null,
    is_subtotal: l.is_subtotal,
  }));

  console.log(
    `Parsed ${incomeLines.length} income lines, ${balanceLines.length} balance lines.`,
  );

  await upsertStatement(
    COMPANY_IDS.SGD_PARTNERS,
    2025,
    "income_statement",
    "2025-01-01",
    "2025-12-31",
    income2025,
  );
  await upsertStatement(
    COMPANY_IDS.SGD_PARTNERS,
    2024,
    "income_statement",
    "2024-01-01",
    "2024-12-31",
    income2024,
  );
  await upsertStatement(
    COMPANY_IDS.SGD_PARTNERS,
    2025,
    "balance_sheet",
    "2025-01-01",
    "2025-12-31",
    balance2025,
  );
  await upsertStatement(
    COMPANY_IDS.SGD_PARTNERS,
    2024,
    "balance_sheet",
    "2024-01-01",
    "2024-12-31",
    balance2024,
  );

  console.log("Seed complete.");
  await pool.end();
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
