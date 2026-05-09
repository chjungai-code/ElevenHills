export type ParsedLine = {
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
  const digits = cleaned.replace(/[△,\-\s]/g, "");
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
  const collapsed = name.replace(/\s+/g, "");
  if (["자산", "부채", "자본"].includes(collapsed)) {
    return { section_code: null, depth: 0, is_subtotal: true };
  }
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
  if (/^\(\d+\)/.test(name)) {
    return { section_code: null, depth: 1, is_subtotal: true };
  }
  return { section_code: null, depth: 2, is_subtotal: false };
}

/**
 * Parse the K-GAAP Korean income statement / balance sheet markdown
 * (HTML <table> form, the same format produced by the existing seed
 * markdowns and by LlamaParse from the source PDF).
 */
export function parseStatementMarkdown(md: string): ParsedLine[] {
  const out: ParsedLine[] = [];
  for (const rowHtml of iterateBodyRows(md)) {
    const cells = extractCells(rowHtml).map((c) => c);
    if (cells.length === 0) continue;
    const name = normalizeName(cells[0]);
    if (!name) continue;
    if (/^\(.+\)$/.test(name) && /당기순이익/.test(name)) continue;
    if (/^(당기|전기)\s*:/.test(name)) continue;

    let amount: string | null = null;
    let prior: string | null = null;

    if (cells.length >= 5) {
      const sCurr = parseAmount(cells[1] ?? "");
      const tCurr = parseAmount(cells[2] ?? "");
      const sPrior = parseAmount(cells[3] ?? "");
      const tPrior = parseAmount(cells[4] ?? "");
      amount = tCurr ?? sCurr;
      prior = tPrior ?? sPrior;
    } else if (cells.length >= 3) {
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

export type VerifyIssue = { period: "current" | "prior"; message: string };

/**
 * Validate the basic K-GAAP identities for an income statement.
 * Returns issues for both the current and (if present) prior period.
 * If the prior column is entirely empty, prior-period checks are skipped.
 */
export function verifyIncomeStatement(lines: ParsedLine[]): VerifyIssue[] {
  const issues: VerifyIssue[] = [];
  const check = (key: AmountKey, period: "current" | "prior") => {
    const rev = toNum(findValue(lines, key, "매출액"));
    const cogs = toNum(findValue(lines, key, "매출원가"));
    const gross = toNum(findValue(lines, key, "매출총이익"));
    if (rev === 0 && cogs === 0 && gross === 0) return;
    if (Math.abs(rev - cogs - gross) > 1) {
      issues.push({
        period,
        message: `매출액(${rev.toLocaleString()}) - 매출원가(${cogs.toLocaleString()}) ≠ 매출총이익(${gross.toLocaleString()})`,
      });
    }
  };
  check("amount", "current");
  check("prior_amount", "prior");
  return issues;
}

/**
 * Validate the balance sheet identity: 자산총계 == 부채및자본총계.
 */
export function verifyBalanceSheet(lines: ParsedLine[]): VerifyIssue[] {
  const issues: VerifyIssue[] = [];
  const check = (key: AmountKey, period: "current" | "prior") => {
    const assets = toNum(findValue(lines, key, "자산총계"));
    const liabPlusEq = toNum(findValue(lines, key, "부채및자본총계"));
    if (assets === 0 && liabPlusEq === 0) return;
    if (Math.abs(assets - liabPlusEq) > 1) {
      issues.push({
        period,
        message: `자산총계(${assets.toLocaleString()}) ≠ 부채및자본총계(${liabPlusEq.toLocaleString()})`,
      });
    }
  };
  check("amount", "current");
  check("prior_amount", "prior");
  return issues;
}

export type StatementKind = "income_statement" | "balance_sheet";

export function verifyStatement(
  kind: StatementKind,
  lines: ParsedLine[],
): VerifyIssue[] {
  return kind === "income_statement"
    ? verifyIncomeStatement(lines)
    : verifyBalanceSheet(lines);
}
