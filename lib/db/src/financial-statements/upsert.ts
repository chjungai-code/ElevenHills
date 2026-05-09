import { eq, and, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import {
  financialStatementTable,
  financialStatementLineTable,
} from "../schema/financial-statements";
import type { ParsedLine, StatementKind } from "./parser";

export type UpsertableLine = {
  sort_order: number;
  depth: number;
  section_code: string | null;
  account_name_ko: string;
  amount: string | null;
  prior_amount: string | null;
  is_subtotal: boolean;
};

export function toUpsertableLines(parsed: ParsedLine[]): UpsertableLine[] {
  return parsed.map((l, i) => ({
    sort_order: i + 1,
    depth: l.depth,
    section_code: l.section_code,
    account_name_ko: l.account_name_ko,
    amount: l.amount,
    prior_amount: l.prior_amount,
    is_subtotal: l.is_subtotal,
  }));
}

/**
 * Replace-in-place upsert of a single financial statement (header + lines).
 * Re-uploading the same (company_id, fiscal_year, statement_type) cleanly
 * replaces every line, preserving parent/child structure based on `depth`.
 */
export async function upsertStatement(
  db: NodePgDatabase<Record<string, unknown>>,
  args: {
    companyId: string;
    fiscalYear: number;
    statementType: StatementKind;
    periodStart: string | null;
    periodEnd: string | null;
    currency?: string;
    unit?: string;
    lines: UpsertableLine[];
  },
): Promise<{ statementId: string; lineCount: number }> {
  const {
    companyId,
    fiscalYear,
    statementType,
    periodStart,
    periodEnd,
    currency = "KRW",
    unit = "won",
    lines,
  } = args;

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
      .set({ period_start: periodStart, period_end: periodEnd, currency, unit })
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
        currency,
        unit,
      })
      .returning({ id: financialStatementTable.id });
    statementId = inserted[0].id;
  }

  // Pass 1: upsert every line by (statement_id, sort_order), parent_line_id = null.
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

  // Drop orphans beyond our seeded count BEFORE resolving parents.
  const maxSort = lines.reduce((m, l) => Math.max(m, l.sort_order), 0);
  await db
    .delete(financialStatementLineTable)
    .where(
      and(
        eq(financialStatementLineTable.statement_id, statementId),
        sql`${financialStatementLineTable.sort_order} > ${maxSort}`,
      ),
    );

  // Pass 2: resolve parent_line_id by depth-stack walk.
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

  const stack: Array<{ depth: number; id: string }> = [];
  for (const line of lines) {
    while (stack.length > 0 && stack[stack.length - 1].depth >= line.depth) {
      stack.pop();
    }
    const parentId = stack.length > 0 ? stack[stack.length - 1].id : null;
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

  return { statementId, lineCount: lines.length };
}
