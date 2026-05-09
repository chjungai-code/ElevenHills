import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  financialStatementTable,
  financialStatementLineTable,
} from "@workspace/db/schema";
import { eq, and, asc } from "drizzle-orm";

const router: IRouter = Router();

const STATEMENT_TYPES = ["income_statement", "balance_sheet"] as const;
type StatementType = (typeof STATEMENT_TYPES)[number];

router.get("/financial-statements", async (req, res) => {
  try {
    const { company_id, year, type } = req.query;

    if (typeof company_id !== "string" || !company_id) {
      res.status(400).json({ error: "company_id is required" });
      return;
    }
    if (typeof year !== "string" || !year) {
      res.status(400).json({ error: "year is required" });
      return;
    }
    const yearNum = parseInt(year, 10);
    if (!Number.isInteger(yearNum) || yearNum < 1900 || yearNum > 2100) {
      res.status(400).json({ error: "Invalid year (1900-2100)" });
      return;
    }

    let typeFilter: StatementType[] = [...STATEMENT_TYPES];
    if (typeof type === "string" && type) {
      if (!STATEMENT_TYPES.includes(type as StatementType)) {
        res.status(400).json({
          error: `Invalid type. Expected one of: ${STATEMENT_TYPES.join(", ")}`,
        });
        return;
      }
      typeFilter = [type as StatementType];
    }

    const headers = await db
      .select()
      .from(financialStatementTable)
      .where(
        and(
          eq(financialStatementTable.company_id, company_id),
          eq(financialStatementTable.fiscal_year, yearNum),
        ),
      );

    const result: {
      income_statement: FinancialStatementResponse | null;
      balance_sheet: FinancialStatementResponse | null;
    } = {
      income_statement: null,
      balance_sheet: null,
    };

    for (const h of headers) {
      if (!typeFilter.includes(h.statement_type as StatementType)) continue;
      const lines = await db
        .select()
        .from(financialStatementLineTable)
        .where(eq(financialStatementLineTable.statement_id, h.id))
        .orderBy(asc(financialStatementLineTable.sort_order));

      // Build hierarchical tree from parent_line_id, preserving sort_order.
      const nodeById = new Map<string, FinancialStatementLineNode>();
      for (const l of lines) {
        nodeById.set(l.id, {
          id: l.id,
          sort_order: l.sort_order,
          depth: l.depth,
          section_code: l.section_code,
          account_code: l.account_code,
          account_name_ko: l.account_name_ko,
          amount: l.amount,
          prior_amount: l.prior_amount,
          is_subtotal: l.is_subtotal,
          parent_line_id: l.parent_line_id,
          children: [],
        });
      }
      const roots: FinancialStatementLineNode[] = [];
      for (const l of lines) {
        const node = nodeById.get(l.id)!;
        if (l.parent_line_id && nodeById.has(l.parent_line_id)) {
          nodeById.get(l.parent_line_id)!.children.push(node);
        } else {
          roots.push(node);
        }
      }

      const payload: FinancialStatementResponse = {
        company_id: h.company_id,
        fiscal_year: h.fiscal_year,
        statement_type: h.statement_type,
        period_start: h.period_start,
        period_end: h.period_end,
        currency: h.currency,
        unit: h.unit,
        lines: roots,
      };

      if (h.statement_type === "income_statement") {
        result.income_statement = payload;
      } else if (h.statement_type === "balance_sheet") {
        result.balance_sheet = payload;
      }
    }

    res.json(result);
  } catch (err) {
    req.log.error(err, "Failed to fetch financial statements");
    res.status(500).json({ error: "Internal server error" });
  }
});

type FinancialStatementLineNode = {
  id: string;
  sort_order: number;
  depth: number;
  section_code: string | null;
  account_code: string | null;
  account_name_ko: string;
  amount: string | null;
  prior_amount: string | null;
  is_subtotal: boolean;
  parent_line_id: string | null;
  children: FinancialStatementLineNode[];
};

type FinancialStatementResponse = {
  company_id: string;
  fiscal_year: number;
  statement_type: string;
  period_start: string | null;
  period_end: string | null;
  currency: string;
  unit: string;
  lines: FinancialStatementLineNode[];
};

export default router;
