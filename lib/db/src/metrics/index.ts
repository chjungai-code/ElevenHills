import { sql, and, eq, gte, lte, inArray, type SQL, type SQLWrapper } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";
import { db } from "../index";
import { revenueTable } from "../schema/revenue";
import { kpiObservationTable } from "../schema/kpi";

// ---------------------------------------------------------------------------
// Public types — these are mirrored in lib/api-spec/openapi.yaml as schemas.
// Keep them in sync when adding/removing fields.
// ---------------------------------------------------------------------------

export type DatasetCode = "revenue" | "kpi";
export type GroupByCol =
  | "company"
  | "store"
  | "month"
  | "quarter"
  | "year"
  | "kpi_code";

export type FilterOp = "eq" | "in" | "between" | "gte" | "lte";

export type QueryFilter = {
  col: string;
  op: FilterOp;
  value?: string | number | null;
  values?: string[] | null;
  min?: number | null;
  max?: number | null;
};

export type TimeRange =
  | { kind: "ltm" }
  | { kind: "year"; year: number }
  | { kind: "ytd" };

export type QueryRequest = {
  dataset: DatasetCode;
  metrics: string[];
  group_by?: GroupByCol[];
  filters?: QueryFilter[];
  time_range?: TimeRange;
  limit?: number;
};

export type ColumnMeta = {
  key: string;
  label_ko: string;
  format?: string;
  unit?: string;
};

export type QueryResponse = {
  columns: ColumnMeta[];
  rows: Array<Record<string, string | number | null>>;
  meta: { generated_at: string; cache_hit: boolean };
};

export type MetricUnit = "KRW" | "PCT" | "YEARS" | "COUNT";

export type MetricDefinition = {
  code: string;
  label_ko: string;
  unit: MetricUnit;
  format: string;
  dataset: DatasetCode;
  description?: string;
};

// ---------------------------------------------------------------------------
// Metric registry — the single place where every metric is defined.
// Pages should import labels/units/formats from this list instead of
// hard-coding them. Frontend reads it via GET /api/metrics.
// ---------------------------------------------------------------------------

export const METRICS: MetricDefinition[] = [
  {
    code: "total_revenue",
    label_ko: "총 매출",
    unit: "KRW",
    format: ",.0f",
    dataset: "revenue",
    description: "category='매출' 인 결합 매출 행의 합계 (스토어별 행은 제외)",
  },
  {
    code: "mom_revenue_change",
    label_ko: "전월 대비 매출 증감률",
    unit: "PCT",
    format: "+.1%",
    dataset: "revenue",
    description: "월별로 그룹화된 total_revenue의 (당월 - 전월) / 전월",
  },
  {
    code: "yoy_revenue_change",
    label_ko: "전년 동월 대비 매출 증감률",
    unit: "PCT",
    format: "+.1%",
    dataset: "revenue",
    description: "year + month 그룹화 필요. (당해 - 전년) / 전년",
  },
  {
    code: "ltm_revenue",
    label_ko: "LTM 매출 (최근 12개월)",
    unit: "KRW",
    format: ",.0f",
    dataset: "revenue",
    description: "데이터 상의 최근 12개월 합계 (필터 적용)",
  },
  {
    code: "kpi_value",
    label_ko: "KPI 값",
    unit: "COUNT",
    format: ",.2f",
    dataset: "kpi",
    description: "kpi_observation.value 패스스루 (테이블 추가 후 활성)",
  },
  {
    code: "kpi_target",
    label_ko: "KPI 목표",
    unit: "COUNT",
    format: ",.2f",
    dataset: "kpi",
    description: "kpi_observation.target 패스스루 (테이블 추가 후 활성)",
  },
];

// ---------------------------------------------------------------------------
// Query executor
// ---------------------------------------------------------------------------

export class QueryError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const REVENUE_GROUP_COLS: Record<string, PgColumn | undefined> = {
  company: revenueTable.company_id,
  month: revenueTable.month,
  year: revenueTable.year,
};

const REVENUE_FILTER_COLS: Record<string, PgColumn | undefined> = {
  company_id: revenueTable.company_id,
  year: revenueTable.year,
  month: revenueTable.month,
  category: revenueTable.category,
};

const GROUP_LABELS: Record<string, string> = {
  company: "회사",
  store: "매장",
  month: "월",
  quarter: "분기",
  year: "연도",
  kpi_code: "KPI",
};

function coerceNum(v: unknown): number {
  if (typeof v === "number") return v;
  const n = parseFloat(String(v));
  if (Number.isNaN(n)) throw new QueryError(400, `Expected numeric value, got ${v}`);
  return n;
}

function coerceFilterVal(col: string, v: unknown): string | number {
  if (col === "year" || col === "month") return Math.trunc(coerceNum(v));
  return v == null ? "" : String(v);
}

/**
 * Build the WHERE conditions for the `revenue` dataset from a list of typed
 * QueryFilters and an optional TimeRange. Shared between executeQuery() and
 * the legacy row-level selectRevenueRows() so both code paths apply the same
 * filter semantics.
 *
 * When `onlyCombined` is true (the default for the metric layer), an extra
 * `category = '매출'` clause is appended so per-store rows are not double-
 * counted in aggregations. Set it to `false` when you want raw row reads.
 */
export function buildRevenueConditions(opts: {
  filters?: QueryFilter[];
  time_range?: TimeRange;
  onlyCombined?: boolean;
}): SQL[] {
  const conds: SQL[] = [];
  if (opts.onlyCombined) {
    conds.push(eq(revenueTable.category, "매출"));
  }
  for (const f of opts.filters ?? []) {
    const col = REVENUE_FILTER_COLS[f.col];
    if (!col) {
      throw new QueryError(400, `Unknown filter column: ${f.col}`);
    }
    switch (f.op) {
      case "eq":
        conds.push(eq(col, coerceFilterVal(f.col, f.value) as never));
        break;
      case "in": {
        const values = (f.values ?? []).map(
          (v) => coerceFilterVal(f.col, v) as never,
        );
        if (values.length > 0) conds.push(inArray(col, values));
        break;
      }
      case "gte":
        conds.push(gte(col, coerceFilterVal(f.col, f.value) as never));
        break;
      case "lte":
        conds.push(lte(col, coerceFilterVal(f.col, f.value) as never));
        break;
      case "between":
        if (f.min != null)
          conds.push(gte(col, coerceFilterVal(f.col, f.min) as never));
        if (f.max != null)
          conds.push(lte(col, coerceFilterVal(f.col, f.max) as never));
        break;
      default:
        throw new QueryError(
          400,
          `Unknown filter op: ${String((f as QueryFilter).op)}`,
        );
    }
  }
  if (opts.time_range) {
    if (opts.time_range.kind === "year") {
      conds.push(eq(revenueTable.year, opts.time_range.year));
    } else if (opts.time_range.kind === "ytd") {
      const now = new Date();
      conds.push(eq(revenueTable.year, now.getFullYear()));
      conds.push(lte(revenueTable.month, now.getMonth() + 1));
    }
    // 'ltm' is handled per-metric inside executeQuery.
  }
  return conds;
}

/**
 * Row-level read of the revenue table. Backs the legacy GET /api/revenue
 * endpoint so the existing useGetRevenue hook keeps working while sharing
 * the same typed filter pipeline as POST /api/query.
 */
export async function selectRevenueRows(opts: {
  filters?: QueryFilter[];
  time_range?: TimeRange;
}) {
  const conds = buildRevenueConditions({ ...opts, onlyCombined: false });
  const q = db.select().from(revenueTable);
  return conds.length > 0 ? await q.where(and(...conds)) : await q;
}

export async function executeQuery(req: QueryRequest): Promise<QueryResponse> {
  if (!req || typeof req !== "object") {
    throw new QueryError(400, "QueryRequest body must be an object");
  }
  if (req.dataset === "kpi") {
    return await executeKpiQuery(req);
  }
  if (req.dataset !== "revenue") {
    throw new QueryError(400, `Unknown dataset: ${String(req.dataset)}`);
  }

  const wantedMetrics = Array.isArray(req.metrics) ? req.metrics : [];
  if (wantedMetrics.length === 0) {
    throw new QueryError(400, "At least one metric is required");
  }

  for (const m of wantedMetrics) {
    const def = METRICS.find((x) => x.code === m);
    if (!def) throw new QueryError(400, `Unknown metric: ${m}`);
    if (def.dataset !== req.dataset) {
      throw new QueryError(
        400,
        `Metric ${m} belongs to dataset ${def.dataset}, not ${req.dataset}`,
      );
    }
  }

  const groupBy = req.group_by ?? [];
  for (const g of groupBy) {
    if (!REVENUE_GROUP_COLS[g]) {
      throw new QueryError(
        400,
        `Unsupported group_by '${g}' for dataset 'revenue' (supported: company, year, month)`,
      );
    }
  }

  const conds = buildRevenueConditions({
    filters: req.filters,
    time_range: req.time_range,
    onlyCombined: true,
  });

  // Determine which SQL aggregations we actually need.
  const needsTotalRevenue =
    wantedMetrics.includes("total_revenue") ||
    wantedMetrics.includes("mom_revenue_change") ||
    wantedMetrics.includes("yoy_revenue_change");

  // Build select object.
  const selectObj: Record<string, SQLWrapper | PgColumn> = {};
  for (const g of groupBy) {
    selectObj[g] = REVENUE_GROUP_COLS[g] as PgColumn;
  }
  if (needsTotalRevenue) {
    selectObj.total_revenue = sql<string>`coalesce(sum(${revenueTable.amount}), 0)`.as(
      "total_revenue",
    );
  }

  let rows: Array<Record<string, unknown>> = [];
  if (needsTotalRevenue || groupBy.length > 0) {
    let q = db
      .select(selectObj as never)
      .from(revenueTable)
      .where(and(...conds))
      .$dynamic();
    if (groupBy.length > 0) {
      const cols = groupBy.map((g) => REVENUE_GROUP_COLS[g] as PgColumn);
      q = q.groupBy(...cols).orderBy(...cols);
    }
    if (req.limit && req.limit > 0) q = q.limit(req.limit);
    rows = (await q) as Array<Record<string, unknown>>;
  }

  // Coerce numeric strings → numbers for all known numeric output columns.
  for (const r of rows) {
    if ("total_revenue" in r && r.total_revenue != null) {
      r.total_revenue = parseFloat(String(r.total_revenue));
    }
  }

  // -------------------------------------------------------------------------
  // Derived metrics — computed in TypeScript after SQL aggregation.
  // -------------------------------------------------------------------------
  if (wantedMetrics.includes("mom_revenue_change")) {
    if (!groupBy.includes("month")) {
      throw new QueryError(
        400,
        "mom_revenue_change requires group_by to include 'month'",
      );
    }
    const seriesCols = groupBy.filter((g) => g !== "month");
    const groups = new Map<string, Array<Record<string, unknown>>>();
    for (const r of rows) {
      const k = seriesCols.map((c) => String(r[c])).join("|");
      const list = groups.get(k) ?? [];
      list.push(r);
      groups.set(k, list);
    }
    for (const list of groups.values()) {
      list.sort((a, b) => {
        const ay = (a.year as number) ?? 0;
        const by = (b.year as number) ?? 0;
        if (ay !== by) return ay - by;
        return (a.month as number) - (b.month as number);
      });
      for (let i = 0; i < list.length; i++) {
        const prev = i > 0 ? list[i - 1] : null;
        const cur = list[i].total_revenue as number;
        const prevVal = prev ? (prev.total_revenue as number) : 0;
        list[i].mom_revenue_change =
          prev && prevVal !== 0 ? (cur - prevVal) / prevVal : null;
      }
    }
  }

  if (wantedMetrics.includes("yoy_revenue_change")) {
    if (!groupBy.includes("month") || !groupBy.includes("year")) {
      throw new QueryError(
        400,
        "yoy_revenue_change requires group_by to include both 'year' and 'month'",
      );
    }
    const seriesCols = groupBy.filter((g) => g !== "year" && g !== "month");
    const byKey = new Map<string, number>();
    for (const r of rows) {
      const k = [
        ...seriesCols.map((c) => String(r[c])),
        r.year,
        r.month,
      ].join("|");
      byKey.set(k, r.total_revenue as number);
    }
    for (const r of rows) {
      const prevKey = [
        ...seriesCols.map((c) => String(r[c])),
        (r.year as number) - 1,
        r.month,
      ].join("|");
      const prev = byKey.get(prevKey);
      r.yoy_revenue_change =
        prev != null && prev !== 0
          ? ((r.total_revenue as number) - prev) / prev
          : null;
    }
  }

  // ltm_revenue — single scalar attached to every row (or one synthetic row).
  if (wantedMetrics.includes("ltm_revenue")) {
    const months = await db
      .select({
        year: revenueTable.year,
        month: revenueTable.month,
        total: sql<string>`sum(${revenueTable.amount})`.as("total"),
      })
      .from(revenueTable)
      .where(and(...conds))
      .groupBy(revenueTable.year, revenueTable.month)
      .orderBy(sql`year desc`, sql`month desc`)
      .limit(12);
    const ltm = months.reduce((s, r) => s + parseFloat(String(r.total)), 0);
    if (rows.length === 0) rows.push({});
    for (const r of rows) r.ltm_revenue = ltm;
  }

  // No group_by + total_revenue requested but no data → return one zero row.
  if (groupBy.length === 0 && rows.length === 0) {
    const empty: Record<string, unknown> = {};
    for (const m of wantedMetrics) empty[m] = m === "total_revenue" ? 0 : null;
    rows.push(empty);
  }

  const columns: ColumnMeta[] = [
    ...groupBy.map((g) => ({ key: g, label_ko: GROUP_LABELS[g] ?? g })),
    ...wantedMetrics.map((m) => {
      const def = METRICS.find((x) => x.code === m)!;
      return {
        key: def.code,
        label_ko: def.label_ko,
        format: def.format,
        unit: def.unit,
      };
    }),
  ];

  return {
    columns,
    rows: rows as Array<Record<string, string | number | null>>,
    meta: { generated_at: new Date().toISOString(), cache_hit: false },
  };
}

// ---------------------------------------------------------------------------
// KPI dataset executor
// ---------------------------------------------------------------------------

const KPI_GROUP_COLS: Record<string, PgColumn | SQLWrapper | undefined> = {
  kpi_code: kpiObservationTable.kpi_code,
  company: kpiObservationTable.company_id,
  year: sql<number>`extract(year from ${kpiObservationTable.period_start})::int`,
  month: sql<number>`extract(month from ${kpiObservationTable.period_start})::int`,
};

const KPI_FILTER_COLS: Record<string, PgColumn | SQLWrapper | undefined> = {
  kpi_code: kpiObservationTable.kpi_code,
  company_id: kpiObservationTable.company_id,
  period_kind: kpiObservationTable.period_kind,
  year: sql<number>`extract(year from ${kpiObservationTable.period_start})::int`,
  month: sql<number>`extract(month from ${kpiObservationTable.period_start})::int`,
};

function buildKpiConditions(opts: {
  filters?: QueryFilter[];
  time_range?: TimeRange;
}): SQL[] {
  const conds: SQL[] = [];
  for (const f of opts.filters ?? []) {
    const col = KPI_FILTER_COLS[f.col];
    if (!col) {
      throw new QueryError(400, `Unknown filter column for kpi: ${f.col}`);
    }
    switch (f.op) {
      case "eq":
        conds.push(eq(col as never, coerceFilterVal(f.col, f.value) as never));
        break;
      case "in": {
        const values = (f.values ?? []).map(
          (v) => coerceFilterVal(f.col, v) as never,
        );
        if (values.length > 0) conds.push(inArray(col as never, values));
        break;
      }
      case "gte":
        conds.push(gte(col as never, coerceFilterVal(f.col, f.value) as never));
        break;
      case "lte":
        conds.push(lte(col as never, coerceFilterVal(f.col, f.value) as never));
        break;
      case "between":
        if (f.min != null)
          conds.push(gte(col as never, coerceFilterVal(f.col, f.min) as never));
        if (f.max != null)
          conds.push(lte(col as never, coerceFilterVal(f.col, f.max) as never));
        break;
      default:
        throw new QueryError(
          400,
          `Unknown filter op: ${String((f as QueryFilter).op)}`,
        );
    }
  }
  if (opts.time_range) {
    if (opts.time_range.kind === "year") {
      conds.push(
        eq(
          sql`extract(year from ${kpiObservationTable.period_start})::int`,
          opts.time_range.year,
        ),
      );
    } else if (opts.time_range.kind === "ytd") {
      const now = new Date();
      conds.push(
        eq(
          sql`extract(year from ${kpiObservationTable.period_start})::int`,
          now.getFullYear(),
        ),
      );
      conds.push(
        lte(
          sql`extract(month from ${kpiObservationTable.period_start})::int`,
          now.getMonth() + 1,
        ),
      );
    } else if (opts.time_range.kind === "ltm") {
      const now = new Date();
      const cutoff = new Date(
        now.getFullYear(),
        now.getMonth() - 11,
        1,
      );
      const cutoffStr = `${cutoff.getFullYear()}-${String(
        cutoff.getMonth() + 1,
      ).padStart(2, "0")}-01`;
      conds.push(gte(kpiObservationTable.period_start, cutoffStr));
    }
  }
  return conds;
}

async function executeKpiQuery(req: QueryRequest): Promise<QueryResponse> {
  const wantedMetrics = Array.isArray(req.metrics) ? req.metrics : [];
  if (wantedMetrics.length === 0) {
    throw new QueryError(400, "At least one metric is required");
  }
  for (const m of wantedMetrics) {
    const def = METRICS.find((x) => x.code === m);
    if (!def) throw new QueryError(400, `Unknown metric: ${m}`);
    if (def.dataset !== "kpi") {
      throw new QueryError(
        400,
        `Metric ${m} belongs to dataset ${def.dataset}, not kpi`,
      );
    }
  }

  const groupBy = req.group_by ?? [];
  for (const g of groupBy) {
    if (!KPI_GROUP_COLS[g]) {
      throw new QueryError(
        400,
        `Unsupported group_by '${g}' for dataset 'kpi' (supported: kpi_code, company, year, month)`,
      );
    }
  }

  const conds = buildKpiConditions({
    filters: req.filters,
    time_range: req.time_range,
  });

  const selectObj: Record<string, SQLWrapper | PgColumn> = {};
  for (const g of groupBy) {
    selectObj[g] = KPI_GROUP_COLS[g] as SQLWrapper;
  }
  if (wantedMetrics.includes("kpi_value")) {
    selectObj.kpi_value =
      sql<string>`coalesce(sum(${kpiObservationTable.value}), 0)`.as(
        "kpi_value",
      );
  }
  if (wantedMetrics.includes("kpi_target")) {
    selectObj.kpi_target = sql<string | null>`sum(${kpiObservationTable.target})`.as(
      "kpi_target",
    );
  }

  let q = db
    .select(selectObj as never)
    .from(kpiObservationTable)
    .$dynamic();
  if (conds.length > 0) q = q.where(and(...conds));
  if (groupBy.length > 0) {
    const cols = groupBy.map((g) => KPI_GROUP_COLS[g] as SQLWrapper);
    q = q.groupBy(...(cols as never[])).orderBy(...(cols as never[]));
  }
  if (req.limit && req.limit > 0) q = q.limit(req.limit);

  const rows = (await q) as Array<Record<string, unknown>>;

  for (const r of rows) {
    if ("kpi_value" in r && r.kpi_value != null) {
      r.kpi_value = parseFloat(String(r.kpi_value));
    }
    if ("kpi_target" in r && r.kpi_target != null) {
      r.kpi_target = parseFloat(String(r.kpi_target));
    }
  }

  if (groupBy.length === 0 && rows.length === 0) {
    const empty: Record<string, unknown> = {};
    for (const m of wantedMetrics) empty[m] = m === "kpi_value" ? 0 : null;
    rows.push(empty);
  }

  const columns: ColumnMeta[] = [
    ...groupBy.map((g) => ({ key: g, label_ko: GROUP_LABELS[g] ?? g })),
    ...wantedMetrics.map((m) => {
      const def = METRICS.find((x) => x.code === m)!;
      return {
        key: def.code,
        label_ko: def.label_ko,
        format: def.format,
        unit: def.unit,
      };
    }),
  ];

  return {
    columns,
    rows: rows as Array<Record<string, string | number | null>>,
    meta: { generated_at: new Date().toISOString(), cache_hit: false },
  };
}
