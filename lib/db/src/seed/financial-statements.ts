import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  parseStatementMarkdown,
  verifyStatement,
  toUpsertableLines,
  upsertStatement,
  type StatementKind,
  type ParsedLine,
} from "../financial-statements/index";

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

function parseFile(p: string): ParsedLine[] {
  return parseStatementMarkdown(fs.readFileSync(p, "utf8"));
}

function verifyOrThrow(year: string, kind: StatementKind, lines: ParsedLine[]) {
  // For 2024 we synthesize from prior_amount column → re-verify after pivoting.
  const issues = verifyStatement(kind, lines);
  if (issues.length) {
    throw new Error(
      `[${year} ${kind}] verification failed:\n` +
        issues.map((i) => `  • [${i.period}] ${i.message}`).join("\n"),
    );
  }
}

async function seed() {
  const incomeLines = parseFile(path.join(REPO_ROOT, ASSETS.income));
  const balanceLines = parseFile(path.join(REPO_ROOT, ASSETS.balance));

  // Verify the 2025 markdowns (both current + prior columns) before persisting.
  verifyOrThrow("2025", "income_statement", incomeLines);
  verifyOrThrow("2025", "balance_sheet", balanceLines);

  // Pivot helper: build a 2024 statement using the prior_amount column as current.
  const pivotPriorAsCurrent = (ls: ParsedLine[]): ParsedLine[] =>
    ls.map((l) => ({ ...l, amount: l.prior_amount, prior_amount: null }));

  const income2024 = pivotPriorAsCurrent(incomeLines);
  const balance2024 = pivotPriorAsCurrent(balanceLines);

  console.log(
    `Parsed ${incomeLines.length} income lines, ${balanceLines.length} balance lines.`,
  );

  await upsertStatement(db, {
    companyId: COMPANY_IDS.SGD_PARTNERS,
    fiscalYear: 2025,
    statementType: "income_statement",
    periodStart: "2025-01-01",
    periodEnd: "2025-12-31",
    lines: toUpsertableLines(incomeLines),
  });
  await upsertStatement(db, {
    companyId: COMPANY_IDS.SGD_PARTNERS,
    fiscalYear: 2024,
    statementType: "income_statement",
    periodStart: "2024-01-01",
    periodEnd: "2024-12-31",
    lines: toUpsertableLines(income2024),
  });
  await upsertStatement(db, {
    companyId: COMPANY_IDS.SGD_PARTNERS,
    fiscalYear: 2025,
    statementType: "balance_sheet",
    periodStart: "2025-01-01",
    periodEnd: "2025-12-31",
    lines: toUpsertableLines(balanceLines),
  });
  await upsertStatement(db, {
    companyId: COMPANY_IDS.SGD_PARTNERS,
    fiscalYear: 2024,
    statementType: "balance_sheet",
    periodStart: "2024-01-01",
    periodEnd: "2024-12-31",
    lines: toUpsertableLines(balance2024),
  });

  console.log("Seed complete.");
  await pool.end();
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
