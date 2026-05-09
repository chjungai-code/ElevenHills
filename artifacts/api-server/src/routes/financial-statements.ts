import { Router, type IRouter } from "express";
import express from "express";
import { db } from "@workspace/db";
import {
  financialStatementTable,
  financialStatementLineTable,
} from "@workspace/db/schema";
import {
  parseStatementMarkdown,
  verifyStatement,
  toUpsertableLines,
  upsertStatement,
  type ParsedLine,
} from "@workspace/db";
import { eq, and, asc } from "drizzle-orm";
import {
  isConfigured as llamaConfigured,
  parsePdfToMarkdown,
  LlamaParseError,
} from "../lib/llamaparse";
import { requireAdmin } from "../lib/require-admin.js";

const router: IRouter = Router();

const STATEMENT_TYPES = ["income_statement", "balance_sheet"] as const;
type StatementType = (typeof STATEMENT_TYPES)[number];

// ─── GET /financial-statements ────────────────────────────────────────────

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
    } = { income_statement: null, balance_sheet: null };

    for (const h of headers) {
      if (!typeFilter.includes(h.statement_type as StatementType)) continue;
      const lines = await db
        .select()
        .from(financialStatementLineTable)
        .where(eq(financialStatementLineTable.statement_id, h.id))
        .orderBy(asc(financialStatementLineTable.sort_order));

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

// ─── Helpers shared by upload endpoints ───────────────────────────────────

function previewPayload(
  lines: ParsedLine[],
  statement_type: StatementType,
): PreviewResponse {
  const issues = verifyStatement(statement_type, lines);
  return {
    statement_type,
    line_count: lines.length,
    lines,
    issues,
  };
}

function isStatementType(s: unknown): s is StatementType {
  return typeof s === "string" && STATEMENT_TYPES.includes(s as StatementType);
}

// ─── POST /financial-statements/parse-pdf ─────────────────────────────────
// Multipart-free: accepts the raw PDF as the request body.
// Headers: content-type: application/pdf, x-filename: <name>.pdf (optional)

router.post(
  "/financial-statements/parse-pdf",
  requireAdmin,
  express.raw({ type: "application/pdf", limit: "30mb" }),
  async (req, res) => {
    try {
      if (!llamaConfigured()) {
        res
          .status(503)
          .json({ error: "LLAMA_CLOUD_API_KEY is not configured on the server." });
        return;
      }
      const body = req.body;
      if (!Buffer.isBuffer(body) || body.length === 0) {
        res
          .status(400)
          .json({ error: "Send the PDF as the raw request body with content-type application/pdf." });
        return;
      }
      const filenameHeader = req.header("x-filename");
      let decodedFilename: string | undefined;
      if (typeof filenameHeader === "string" && filenameHeader.length > 0) {
        try {
          decodedFilename = decodeURIComponent(filenameHeader);
        } catch {
          decodedFilename = filenameHeader;
        }
      }
      const filename =
        decodedFilename && decodedFilename.length > 0 ? decodedFilename : "statement.pdf";

      const markdown = await parsePdfToMarkdown(body, filename);
      res.json({ markdown });
    } catch (err) {
      if (err instanceof LlamaParseError) {
        req.log.warn({ err }, "LlamaParse failure");
        res.status(err.status && err.status >= 400 && err.status < 600 ? err.status : 502).json({
          error: err.message,
        });
        return;
      }
      req.log.error(err, "Failed to parse PDF");
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

// ─── POST /financial-statements/preview ───────────────────────────────────

router.post("/financial-statements/preview", requireAdmin, async (req, res) => {
  try {
    const body = req.body as PreviewRequest | undefined;
    if (!body || typeof body.markdown !== "string" || !body.markdown.trim()) {
      res.status(400).json({ error: "markdown is required" });
      return;
    }
    if (!isStatementType(body.statement_type)) {
      res.status(400).json({
        error: `statement_type must be one of: ${STATEMENT_TYPES.join(", ")}`,
      });
      return;
    }
    const lines = parseStatementMarkdown(body.markdown);
    res.json(previewPayload(lines, body.statement_type));
  } catch (err) {
    req.log.error(err, "Failed to preview financial statement");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── POST /financial-statements ───────────────────────────────────────────
// Save (upsert) a parsed statement. Re-uploading the same
// (company, year, type) cleanly replaces existing rows.

router.post("/financial-statements", requireAdmin, async (req, res) => {
  try {
    const body = req.body as SaveRequest | undefined;
    if (!body) {
      res.status(400).json({ error: "Request body is required" });
      return;
    }
    if (typeof body.company_id !== "string" || !body.company_id) {
      res.status(400).json({ error: "company_id is required" });
      return;
    }
    const fiscalYear = Number(body.fiscal_year);
    if (!Number.isInteger(fiscalYear) || fiscalYear < 1900 || fiscalYear > 2100) {
      res.status(400).json({ error: "fiscal_year must be a year between 1900 and 2100" });
      return;
    }
    if (!isStatementType(body.statement_type)) {
      res.status(400).json({
        error: `statement_type must be one of: ${STATEMENT_TYPES.join(", ")}`,
      });
      return;
    }
    if (typeof body.markdown !== "string" || !body.markdown.trim()) {
      res.status(400).json({ error: "markdown is required" });
      return;
    }

    const lines = parseStatementMarkdown(body.markdown);
    if (lines.length === 0) {
      res.status(400).json({
        error: "No statement rows could be parsed from the provided markdown.",
      });
      return;
    }
    const issues = verifyStatement(body.statement_type, lines);
    if (issues.length && !body.skip_verification) {
      res.status(422).json({
        error: "Statement failed K-GAAP verification.",
        issues,
      });
      return;
    }

    const periodStart =
      typeof body.period_start === "string" && body.period_start
        ? body.period_start
        : `${fiscalYear}-01-01`;
    const periodEnd =
      typeof body.period_end === "string" && body.period_end
        ? body.period_end
        : `${fiscalYear}-12-31`;

    const result = await upsertStatement(db, {
      companyId: body.company_id,
      fiscalYear,
      statementType: body.statement_type,
      periodStart,
      periodEnd,
      lines: toUpsertableLines(lines),
    });

    res.json({
      statement_id: result.statementId,
      line_count: result.lineCount,
      issues,
    });
  } catch (err) {
    req.log.error(err, "Failed to save financial statement");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── Types ────────────────────────────────────────────────────────────────

type PreviewRequest = { markdown: string; statement_type: StatementType };
type SaveRequest = {
  company_id: string;
  fiscal_year: number;
  statement_type: StatementType;
  markdown: string;
  period_start?: string | null;
  period_end?: string | null;
  skip_verification?: boolean;
};
type PreviewResponse = {
  statement_type: StatementType;
  line_count: number;
  lines: ParsedLine[];
  issues: ReturnType<typeof verifyStatement>;
};

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
