# Superset Research & Data Layer Proposal for 일레븐힐스 대시보드

> **Status:** Research / proposal only. No code changes.
> **Author task:** `.local/tasks/task-24.md`
> **Audience:** Engineers and PMs working on the 일레븐힐스 dashboard, especially anyone touching `lib/db`, `lib/api-spec`, `artifacts/api-server`, or the chart layer in `artifacts/dashboard`.

This document has two halves:

- **Part 1 — What Superset does.** A focused tour of Apache Superset's architecture, written in our own words with pointers to primary sources. We only cover the pieces that are relevant to a dashboard like ours.
- **Part 2 — What we should do.** A concrete proposal for evolving our own data layer and chart layer, mapped concept-by-concept onto Superset's patterns. Ends with a phased migration plan that slots into existing in-flight tasks.

The goal is **not** to adopt Superset. It is to steal the right ideas — a small semantic layer, clean query pipeline, sensible caching, viz-config-as-data — without paying for a full BI platform we don't need.

---

## Table of contents

- [Part 1 — What Superset does](#part-1--what-superset-does)
  - [1.1 Two databases: metadata vs. analytics](#11-two-databases-metadata-vs-analytics)
  - [1.2 The metadata model](#12-the-metadata-model)
  - [1.3 The semantic layer (Datasets, Metrics, Calculated Columns)](#13-the-semantic-layer-datasets-metrics-calculated-columns)
  - [1.4 The query pipeline (chart → SQL)](#14-the-query-pipeline-chart--sql)
  - [1.5 Caching](#15-caching)
  - [1.6 The visualization layer (viz plugins)](#16-the-visualization-layer-viz-plugins)
  - [1.7 Security & row-level security](#17-security--row-level-security)
  - [1.8 What we are deliberately ignoring](#18-what-we-are-deliberately-ignoring)
- [Part 2 — What we should do](#part-2--what-we-should-do)
  - [2.1 Where we are today](#21-where-we-are-today)
  - [2.2 Guiding principles](#22-guiding-principles)
  - [2.3 Should we have a metadata / semantic layer?](#23-should-we-have-a-metadata--semantic-layer)
  - [2.4 Proposed Postgres schema](#24-proposed-postgres-schema)
  - [2.5 A lightweight metric layer](#25-a-lightweight-metric-layer)
  - [2.6 Chart / visualization layer](#26-chart--visualization-layer)
  - [2.7 Caching & refresh strategy](#27-caching--refresh-strategy)
  - [2.8 Permissions](#28-permissions)
  - [2.9 Phased migration plan](#29-phased-migration-plan)
  - [2.10 Open questions](#210-open-questions)

---

# Part 1 — What Superset does

Apache Superset is an open-source BI platform: users connect databases, define datasets and metrics on top of them, build charts ("Slices"), and arrange those charts into Dashboards. It has been at scale at Airbnb, Lyft, and many others. The architecture is worth studying because it solves the same problems we are about to solve at much smaller scale.

Primary sources used throughout this section:

- Superset source code: <https://github.com/apache/superset>
- User docs: <https://superset.apache.org/docs/intro>
- Developer / contributor docs: <https://superset.apache.org/docs/contributing/>
- Key directories referenced below:
  - `superset/models/` — SQLAlchemy models for the metadata DB
  - `superset/connectors/sqla/models.py` — `SqlaTable` (Dataset), `SqlMetric`, `TableColumn`
  - `superset/common/query_context.py` and `superset/common/query_object.py` — query pipeline
  - `superset/charts/`, `superset/dashboards/` — REST endpoints
  - `superset-frontend/plugins/` — viz plugin packages
  - `superset/config.py` — caching, feature flags

## 1.1 Two databases: metadata vs. analytics

Superset's most important architectural decision is the **separation of two completely different databases**:

| | Metadata DB | Analytics DB(s) |
|---|---|---|
| Purpose | Stores Superset's own state: users, dashboards, charts, datasets, metric definitions | Stores the actual business data being analyzed |
| Owner | Superset itself | The customer / data team |
| Engine | SQLite / Postgres / MySQL (one) | Anything Superset can talk to via SQLAlchemy: Postgres, BigQuery, Snowflake, Redshift, Druid, Trino, ClickHouse, … (many) |
| Schema | Fixed, ships with Superset, evolved via Alembic migrations in `superset/migrations/` | Owned by the customer; Superset only reads it |
| Size | Small (megabytes for most installs) | Can be terabytes |

Why this matters: Superset never copies the analytics data. It just remembers *how to ask for it*. A "chart" is a small JSON blob in the metadata DB that describes a query and a renderer; running the chart issues SQL against the analytics DB and streams results back.

Two consequences worth noting:

1. **Multi-source by default.** A single dashboard can mix charts that hit Postgres, BigQuery, and Snowflake. The metadata layer abstracts the source.
2. **Stateless analytics.** Re-pointing a Database connection (e.g. dev → prod) does not move dashboards or charts; they continue to work as long as the schema matches.

## 1.2 The metadata model

The core SQLAlchemy models live in `superset/models/` and `superset/connectors/sqla/models.py`. Simplified, the entity graph looks like this:

```
                ┌──────────────┐
                │   Database   │  (connection: SQLAlchemy URI, options)
                └──────┬───────┘
                       │ 1..*
                ┌──────▼───────┐
                │   Dataset    │  (SqlaTable: physical table or virtual SQL)
                │              │
                │  ┌────────┐  │
                │  │Columns │  │  (TableColumn: name, type, is_dttm, expression…)
                │  └────────┘  │
                │  ┌────────┐  │
                │  │Metrics │  │  (SqlMetric: SUM(amount), name, format…)
                │  └────────┘  │
                └──────┬───────┘
                       │ 1..*
                ┌──────▼───────┐        ┌───────────────┐
                │    Slice     │◀──────▶│   Dashboard   │
                │   (chart)    │  M..M  │               │
                │  viz_type +  │        │  position +   │
                │  params JSON │        │  filters JSON │
                └──────────────┘        └───────────────┘
```

Key entities:

- **`Database`** (`superset/models/core.py::Database`)
  A connection. Holds a SQLAlchemy URI, optional extra JSON (engine params, schemas allowed, async timeout, cache TTL), and a `expose_in_sqllab` flag.
- **`SqlaTable`** = "Dataset" (`superset/connectors/sqla/models.py`)
  Either a **physical dataset** (points at `schema.table_name`) or a **virtual dataset** (a `SELECT` query stored in `sql` column, used as a subquery). Datasets are the unit of self-service: an analyst defines a dataset once, BI users build charts on top.
- **`TableColumn`** (`superset/connectors/sqla/models.py`)
  One row per column the dataset exposes. Tracks data type, whether it's a date/time column (`is_dttm`), whether it can be filtered/grouped, and an optional **expression** (calculated column — e.g. `EXTRACT(YEAR FROM created_at)`).
- **`SqlMetric`** (same file)
  Named, reusable aggregation expressions — e.g. `SUM(amount) AS total_revenue`. Has a `metric_name`, an `expression`, a `d3format` for display, and a `warning_text`. Charts pick metrics by name; you change the expression once and every chart updates.
- **`Slice`** (`superset/models/slice.py`)
  A chart. Has `slice_name`, `viz_type` (string id of a viz plugin like `echarts_timeseries_line`), `datasource_id`, and a `params` JSON blob with the viz-specific config: groupbys, time range, formatters, color scheme, etc.
- **`Dashboard`** (`superset/models/dashboard.py`)
  Collection of slices plus a `position_json` (grid layout) and `json_metadata` (default filters, color schemes, refresh intervals).
- **`NativeFilter`** (stored inside dashboard `json_metadata`)
  Dashboard-level controls (date range, dropdowns) that fan out into the query of every slice that opts in.

The important shape to internalize: **Database ⊃ Dataset ⊃ {Columns, Metrics}; Dataset ← Slice ← Dashboard.** Everything chart-side is config, not code.

## 1.3 The semantic layer (Datasets, Metrics, Calculated Columns)

The "semantic layer" is the layer between raw tables and chart configs. Superset's is intentionally lightweight (compared to LookML or dbt's metrics layer), but it gives you the two things that matter most:

1. **Define an aggregation once, use it everywhere.**
   `SqlMetric("total_revenue", "SUM(amount)", d3format=",.0f")` lives on the dataset. Twenty charts reference `total_revenue` by name. When the formula changes (e.g. exclude refunds), you edit one row.
2. **Define a derived column once, use it everywhere.**
   `TableColumn("year", "EXTRACT(YEAR FROM occurred_at)", is_dttm=False)`. Now every chart can group by `year` without re-typing the expression.

Virtual datasets push this further: an analyst writes a complex `SELECT … JOIN … WHERE …` once, exposes it as a dataset, and BI users build charts as if it were a table. The trade-off is performance (the virtual SQL is wrapped as a subquery on every query) — Superset's docs explicitly recommend materializing hot virtual datasets into real tables when they get popular.

What Superset deliberately does **not** do at this layer (and where dbt/Cube/Looker live instead):

- No first-class joins between datasets. Each chart hits exactly one dataset.
- No metric composition (`profit = revenue - cost` as a re-usable formula across datasets). You'd model this as a virtual dataset or a calculated column.
- No version control / git-backed metric definitions out of the box.

For our scale this is exactly the right amount of semantic layer.

## 1.4 The query pipeline (chart → SQL)

When a user opens a chart, the path from the JSON params to a rendered visualization looks like this (Superset-side):

```
Browser  ─POST /api/v1/chart/data─►  ChartDataCommand
                                          │
                                          ▼
                                   QueryContext (one per chart request)
                                          │
                                          ▼
                                   QueryObject (one per query; charts can issue many)
                                          │
                                          ▼
                                   Dataset.get_query_str_extended()
                                          │
                                          ▼
                                   Jinja templating (filters, params, macros)
                                          │
                                          ▼
                                   SQLAlchemy → DB engine → SQL
                                          │
                                          ▼
                                   pandas DataFrame
                                          │
                                          ▼
                                   Post-processing pipeline
                                          (rolling, pivot, resample, compare…)
                                          │
                                          ▼
                                   JSON payload back to viz plugin
```

Concretely:

- **`QueryContext`** (`superset/common/query_context.py`) wraps the entire request — dataset, list of `QueryObject`s, result format/type, and cache key inputs.
- **`QueryObject`** (`superset/common/query_object.py`) is a single logical query: filters, groupby columns, metrics, time range, row limit, post-processing operations, and an `extras` dict for `where`/`having` clauses.
- The dataset's `get_query_str_extended()` walks the query object, resolves metric and column references against `SqlMetric` / `TableColumn`, applies dialect-specific quoting, and produces SQL via SQLAlchemy.
- **Jinja templating** (`superset/jinja_context.py`) lets metric expressions and the dataset's virtual SQL embed `{{ current_user_id() }}`, `{{ from_dttm }}`, `{{ filter_values('country') }}`, etc. This is also how row-level security expressions are injected.
- After the SQL executes the result lands in pandas, runs through a small **post-processing pipeline** (`superset/utils/pandas_postprocessing/`): rolling averages, pivot, resample, percent-change, "compare to previous period," etc. This keeps a lot of common transforms out of SQL and identical across DB engines.
- The final JSON payload contains both `data` (rows for the renderer) and metadata used by the viz (column types, applied filters, query string for the "View query" panel).

The single biggest takeaway: **a chart request is not a SQL string from the client.** The client sends a structured query object; the server resolves it against the semantic layer and is the only thing that ever talks to the DB. We will want the same property.

## 1.5 Caching

Superset has multiple cache layers (`superset/config.py`, `CACHE_CONFIG`, `DATA_CACHE_CONFIG`, `THUMBNAIL_CACHE_CONFIG`, `FILTER_STATE_CACHE_CONFIG`):

- **Results cache (`DATA_CACHE_CONFIG`)** — the heavyweight one. Cache key is a hash of `(dataset version, query object, RLS rules, user-impersonation if any)`. TTL is per-dataset/per-database (`cache_timeout`). Backed by Redis/memcached in production, simple in-memory or filesystem in dev.
- **Default cache (`CACHE_CONFIG`)** — generic Flask-Caching cache for things like form data and the `/api/v1/explore/form_data` round-trip.
- **Thumbnail cache** — pre-rendered chart/dashboard thumbnails, computed asynchronously by Celery workers for the home screen.
- **Filter-state cache** — the JSON of dashboard filter selections, so a shareable URL stays small.

Two patterns worth stealing:

1. **Cache key as a function of inputs**, not a hand-managed key. If any input changes (filter, time window, metric definition version) the key changes and the cache automatically misses.
2. **Per-dataset TTL.** A "live operations" dataset can have a 60-second TTL while a "historical financials" dataset can be 24 hours. The cache layer doesn't need to be smart — the dataset just declares its freshness.

Async / warming:

- Celery jobs can pre-warm caches on a schedule (`CacheWarmupStrategy`). This is how Superset keeps the home dashboards instant for the morning standup.

## 1.6 The visualization layer (viz plugins)

The frontend lives in `superset-frontend/`. Each chart type is a **plugin** in `superset-frontend/plugins/plugin-chart-*` (e.g. `plugin-chart-echarts` covers most ECharts-based charts; `plugin-chart-table` is the data table; `preset-chart-xy` covers a family of XY charts).

A viz plugin exports four things:

1. **`controlPanel`** — declarative spec of the editor UI (which controls show up in the right-side panel: metrics, group-bys, time grain, color scheme, axis options…).
2. **`buildQuery`** — pure function that takes the form data (control values) and produces a `QueryContext`/`QueryObject` to send to the server.
3. **`transformProps`** — pure function from `(rawChartProps) → vizProps`. Reshapes the server response (rows, formatters, axes) into what the renderer needs.
4. **`Chart` component** — a React component that receives `vizProps` and renders. Most plugins delegate to a charting library (ECharts, deck.gl, AG Grid).

The persisted form of a chart is a small JSON: `viz_type` + the `params`/form data. That's what makes Superset charts portable, diffable, and copy-pasteable.

```
form_data ──buildQuery──▶ QueryObject ──server──▶ raw rows
                                                         │
                                                         ▼
                                          transformProps ─▶ <ChartRenderer />
```

Two takeaways for us:

1. **Treat chart configs as data, not as React props in JSX.** A revenue trend chart should be a `{ kind: "line", x: "month", y: "amount", series: "company" }` blob, not 80 lines of `<Line />` JSX. Switching libraries later is easier.
2. **Separate "what to query" from "how to render."** The function that builds the query should not know whether the renderer is Recharts, ECharts, or D3.

## 1.7 Security & row-level security

For completeness, since we'll skip most of it:

- **Roles & permissions** are FAB-based (Flask-AppBuilder). Permissions are tuples like `("can_read", "Database")`, `("can_write", "Dashboard")`. Five built-in roles: Admin, Alpha, Gamma, Granter, Public.
- **Database-level grants:** a Database connection can be marked "expose in SQL Lab" or not, and per-schema access can be limited.
- **Row-Level Security (RLS)** rules (`superset/row_level_security/`) are attached to a dataset and a list of roles. The rule's `clause` is a SQL fragment (with Jinja access to the user) that is `AND`-ed into every query against that dataset for users in those roles. Example: `org_id = '{{ current_user.org_id }}'`. This is enforced server-side in the query pipeline so the user can't bypass it.

We don't need this level of machinery, but the **idea of attaching filter clauses to a dataset based on the current user** is worth keeping in our pocket if multiple companies ever share the dashboard.

## 1.8 What we are deliberately ignoring

Out of scope for this research, per the task definition:

- SQL Lab (the in-browser SQL IDE).
- Alerts & Reports (Celery beat + email/slack).
- Multi-tenant RBAC, OAuth provider configuration, embedded SDK licensing.
- Asset import/export (`superset import-datasources`, YAML bundles).
- Druid/legacy connectors.
- The CSS theming system.

We acknowledge these exist and might be revisited later, but they don't inform our near-term architecture.

---

# Part 2 — What we should do

## 2.1 Where we are today

A grounded inventory of the data layer in this repo as of this task:

| Concern | Location | Notes |
|---|---|---|
| Static company / shareholder / family seed | `artifacts/dashboard/src/lib/data/companies.ts` | Hand-maintained TypeScript constants. Stable UUIDs in `COMPANY_IDS`. Drives `/`, `/governance`, `/governance/:id`. |
| Postgres schema (Drizzle) | `lib/db/src/schema/revenue.ts` (only file in `lib/db/src/schema/`) | Single `revenue` table: `id, company_id, year, month, amount, category, memo, created_at` with a unique key on `(company_id, year, month, category)`. Migration: `lib/db/drizzle/0000_messy_stone_men.sql`. |
| OpenAPI spec | `lib/api-spec/openapi.yaml` | Three endpoints: `GET /healthz`, `GET /revenue?company_id&year&month`, `POST /sync/revenue`. Generated via `orval` into `lib/api-client-react/src/generated/api.ts`. |
| API server | `artifacts/api-server/src/app.ts` + `routes/revenue.ts`, `routes/sync.ts` | Express. Drizzle queries. `routes/sync.ts` shells out to the jobs script. |
| Sync job | `lib/jobs/src/sync-revenue-from-sheets.ts` | Reads a Google Sheet via `@replit/connectors-sdk`, parses City of Dreams tabs, upserts into `revenue`. |
| Workflow schedule | "Nightly Revenue Sync" workflow, daily 23:00 KST | Per `.local/tasks/revenue-db-and-dashboard.md`. |
| Dashboard read path | `artifacts/dashboard/src/pages/revenue.tsx` uses `useGetRevenue` (Orval-generated TanStack Query hook) | Aggregations done client-side with `useMemo`. Charts via Recharts. |
| Auth | `artifacts/dashboard/src/lib/supabase/client.ts` | Optional Supabase. Dev bypass when env unset. |

Cross-references to in-flight tasks:

- **Task #11 (`revenue-db-and-dashboard.md`)** — established the `revenue` table, sync job, and `/revenue` page. The schema we propose below is a strict superset of what this task created.
- **Task #14 (`add-data-studio-embed-to-revenue-page.md`)** — embeds a Looker Studio iframe under the revenue charts. This is a useful pressure release valve while we build the native viz layer; the proposal below explains how to retire it gracefully (or keep it as a comparison view).
- **Task #17 (`performance-kpi-page.md`)** — replaces 보고서 with a 성과지표 page that needs many KPI tiles (월간/분기/연간/LTM). This task is the clearest motivator for a small **metric layer**, since the same metrics will appear here, on the home page, and on per-company drill-downs.
- **Task #20 (`full-mobile-responsive.md`)** — orthogonal; influences chart-renderer choice (must work on 320px wide screens).
- **Task #23 (`financial-statements.md`)** — adds `financial_statement` (header) and `financial_statement_line` (items) tables. Our proposal subsumes this schema and pushes the line-item structure to be reusable for any company.

## 2.2 Guiding principles

Before any specific recommendation, the principles we want to optimize for:

1. **Don't build Superset.** Our scale is ~10 entities, ~12 months × few categories × few stores. A full BI platform is dramatically over-engineered. We pick the cheapest mechanism that gives us the property we want.
2. **The semantic layer lives on the server.** The browser should never compose SQL or know table names. It asks for `metric: "total_revenue", group_by: ["company", "month"], filters: {year: 2025}`. The server resolves.
3. **Chart configs are JSON, not JSX.** A page declares a list of chart specs; a small renderer component does the rest. Easy to A/B, easy to swap chart libs.
4. **Caching is automatic and key-by-input.** No `cache.invalidate('foo')` calls. Cache keys are derived from the query object + a per-dataset version stamp.
5. **Migrations only forward.** Drizzle migrations stay append-only. The `revenue` table stays exactly as it is; we extend, we don't rewrite. (In particular, Task #11's schema does not change — we add new tables alongside it.)
6. **Failures are explicit.** No silent fallback to seed data when the DB is down. The page shows an error state; the user knows whether they're looking at live numbers.

## 2.3 Should we have a metadata / semantic layer?

**Recommendation:** Yes — a *minimal* one. Specifically:

- **No metadata DB.** We have one analytics DB (Replit Postgres) and we own its schema. There is no need for a separate "Superset-state" DB.
- **Yes to a server-side metric registry.** Define metrics (`total_revenue`, `mom_revenue_change`, `ytd_revenue`, `wale`, `occupancy_rate`, `operating_income`, `net_income`, `total_assets`, …) **once, on the server**, in TypeScript. Charts and KPI tiles reference them by name.
- **Yes to a typed query object.** The HTTP API exposes a single `POST /api/query` endpoint that accepts `{ dataset, metrics, group_by, filters, time_range }` and returns rows. The existing `/api/revenue` stays as a convenience endpoint backed by the same code path.
- **No virtual datasets, no Jinja, no SQL Lab, no dataset CRUD UI.** Datasets are code, not user-editable. Engineers add datasets via PRs.

In Superset terms we keep `Database`, `Dataset`, `Metric`, and `Column` — but they're TypeScript values, not metadata-DB rows. We drop `Slice`, `Dashboard`, `NativeFilter`, and the SQL Lab/RLS plumbing.

This gets us the two big wins (define metrics once, ship typed queries) at a fraction of the operational complexity.

## 2.4 Proposed Postgres schema

A unified schema covering: companies & corporate structure, ownership, family relationships, KPIs, revenue (monthly + store-level), and financial statements. **Keeps the existing `revenue` table verbatim.**

### 2.4.1 Domain entities

```
                          ┌──────────────────┐
                          │     person       │  family members + key shareholders
                          └────┬─────────────┘
                               │
                ┌──────────────▼───────────────┐
                │     family_relationship      │  (person_a, person_b, kind)
                └──────────────────────────────┘

   ┌────────────┐       ┌──────────────┐       ┌─────────────────┐
   │  company   │──┐    │   ownership  │   ┌──▶│ company_location│
   │            │  │    │ (M:N stake)  │   │   └─────────────────┘
   │ parent_id ─┼──┘    │              │   │
   └─────┬──────┘       │ owner_company│   │   ┌─────────────────┐
         │              │ owner_person │   │   │     store       │
         │              │ company_id   │◀──┘   │ (location ↔ co) │
         │              │ percentage   │       └────────┬────────┘
         │              └──────────────┘                │
         │                                              │
         ▼                                              ▼
   ┌──────────────┐  ┌──────────────────┐  ┌────────────────────┐
   │    revenue   │  │  kpi_observation │  │ revenue_by_store   │
   │ (existing)   │  │                  │  │ (or use revenue    │
   │              │  │                  │  │  with store_id)    │
   └──────────────┘  └──────────────────┘  └────────────────────┘

   ┌──────────────────────┐    ┌────────────────────────────┐
   │ financial_statement  │───▶│ financial_statement_line   │
   │ (header: co + year)  │    │ (hierarchical line items)  │
   └──────────────────────┘    └────────────────────────────┘
```

### 2.4.2 Table sketches

These are sketches, not final DDL — column types follow Drizzle conventions and the existing `revenue.ts` style.

**`company`** — replaces the static `COMPANIES_SEED` over time.

| column | type | notes |
|---|---|---|
| `id` | `uuid` PK | Reuse the `COMPANY_IDS` UUIDs verbatim so existing `revenue.company_id` rows just work. |
| `name` | `text` not null | Korean display name, e.g. `씨오디 리테일`. |
| `short_name` | `text` | e.g. `COD Retail`. |
| `category` | `text` not null | Enum-as-text: `holding | subsidiary | sub_entity | standalone`. |
| `parent_id` | `uuid` nullable FK → `company.id` | Self-reference for the holding tree. |
| `created_at` | `timestamptz` default now | |
| `updated_at` | `timestamptz` default now | Bumped via app code or trigger. |

**`company_location`** — replaces the inline `locations: string[]` array.

| column | type | notes |
|---|---|---|
| `id` | `uuid` PK | |
| `company_id` | `uuid` FK | |
| `name` | `text` | e.g. `명동 밀리오레`. |
| `address` | `text` nullable | For later. |
| `is_active` | `boolean` default true | Soft-close instead of delete. |

**`person`** — family members + named shareholders.

| column | type | notes |
|---|---|---|
| `id` | `uuid` PK | |
| `name` | `text` | e.g. `정주현`. |
| `is_family` | `boolean` default false | Drives the family avatar group. |
| `family_role` | `text` nullable | `대표`, `배우자`, `자녀`. |
| `display_color` | `text` nullable | For the family group avatar. |

**`family_relationship`** — explicit graph instead of the implicit one in seed data.

| column | type | notes |
|---|---|---|
| `person_a_id` | `uuid` FK | |
| `person_b_id` | `uuid` FK | |
| `kind` | `text` | `spouse`, `parent_of`, `sibling`. |
| PK | `(person_a_id, person_b_id, kind)` | |

**`ownership`** — supersedes the inline `shareholders` array. Either an entity (company) or a person owns a stake.

| column | type | notes |
|---|---|---|
| `id` | `uuid` PK | |
| `company_id` | `uuid` FK | The owned company. |
| `owner_company_id` | `uuid` FK nullable | If the owner is an entity. |
| `owner_person_id` | `uuid` FK nullable | If the owner is an individual. |
| `percentage` | `numeric(6,3)` | 0–100, three decimals. |
| `as_of` | `date` | Effective date of the cap-table snapshot. |
| `note` | `text` nullable | |
| Check | exactly one of `owner_company_id` / `owner_person_id` is non-null | DB-level check constraint. |

**`store`** — distinct retail locations producing revenue. One company can have many stores; one revenue row can be per-store.

| column | type | notes |
|---|---|---|
| `id` | `uuid` PK | |
| `company_id` | `uuid` FK | |
| `name` | `text` | e.g. `제주 칠성점 - 1F`. |
| `opened_on` | `date` nullable | |
| `closed_on` | `date` nullable | |

**`revenue`** — **keep exactly as it is.** To support per-store rows without breaking the unique key, we add an optional `store_id` and extend the unique key in a new migration:

```sql
ALTER TABLE revenue ADD COLUMN store_id uuid REFERENCES store(id);
DROP   INDEX revenue_company_year_month_category_key;
CREATE UNIQUE INDEX revenue_company_store_year_month_category_key
  ON revenue (company_id, COALESCE(store_id, '00000000-0000-0000-0000-000000000000'::uuid), year, month, category);
```

(Sketch only — the actual migration would use a deferred functional index or a generated column to handle `NULL` correctly.) The current behavior, where `category = '매출'` is the rolled-up combined row and `category = '매출 - X'` are per-store rows, continues to work; new per-store rows can additionally fill `store_id`.

**`kpi_definition`** — registry of KPIs we track, so the 성과지표 page is data-driven.

| column | type | notes |
|---|---|---|
| `code` | `text` PK | e.g. `wale`, `occupancy_rate`, `noi_yield`. |
| `display_name_ko` | `text` | e.g. `WALE`, `공실률`. |
| `unit` | `text` | `%`, `년`, `KRW`. |
| `format` | `text` | d3-format string, e.g. `,.1f`. |
| `target_kind` | `text` | `higher_is_better | lower_is_better | range`. |

**`kpi_observation`** — actual values over time, optionally per company.

| column | type | notes |
|---|---|---|
| `id` | `uuid` PK | |
| `kpi_code` | `text` FK → `kpi_definition.code` | |
| `company_id` | `uuid` FK nullable | `NULL` means group-level. |
| `period_kind` | `text` | `monthly | quarterly | annual | ltm`. |
| `period_start` | `date` | First day of the period. |
| `value` | `numeric(20,4)` | |
| `target` | `numeric(20,4)` nullable | |
| `source` | `text` nullable | `manual`, `sync:sheets`, `derived:revenue`. |
| Unique | `(kpi_code, company_id, period_kind, period_start)` | |

This decouples *what KPI we care about* (a small registry) from *when and how it was measured* (fact rows). Exactly the Superset Metric vs. query result split, applied to KPI cards.

**`financial_statement`** + **`financial_statement_line`** — exactly the shape Task #23 already proposes, stated here so the model is complete.

`financial_statement` (header):

| column | type | notes |
|---|---|---|
| `id` | `uuid` PK | |
| `company_id` | `uuid` FK | |
| `kind` | `text` | `income_statement | balance_sheet | cash_flow`. |
| `fiscal_year` | `integer` | e.g. 2025. |
| `period_label` | `text` | e.g. `제6기`. |
| `currency` | `text` default `KRW` | |
| `audited` | `boolean` default false | |
| `source` | `text` nullable | e.g. `external/sgd-2025-final.md`. |
| Unique | `(company_id, kind, fiscal_year)` | |

`financial_statement_line` (line items, hierarchical):

| column | type | notes |
|---|---|---|
| `id` | `uuid` PK | |
| `statement_id` | `uuid` FK | |
| `parent_id` | `uuid` FK nullable | Self-reference for sub-totals. |
| `code` | `text` nullable | Stable code like `revenue`, `cogs`, `gross_profit`. |
| `label_ko` | `text` | e.g. `매출액`, `매출원가`. |
| `current_value` | `numeric(20,2)` | This-year amount (KRW). |
| `prior_value` | `numeric(20,2)` nullable | Prior-year amount. |
| `is_subtotal` | `boolean` default false | |
| `display_order` | `integer` | Stable ordering within a statement. |

The `code` column is the bridge to the metric layer — `total_revenue` for SGD reads from `financial_statement_line.code = 'revenue'` for the latest annual statement, while `total_revenue` for City of Dreams reads from `revenue` summed by year.

### 2.4.3 What we move out of seed data

In phases (see §2.9), we move from `companies.ts` → DB:

1. `company` + `company_location` (low-risk, mostly read-only).
2. `person` + `family_relationship` + the family role/color used by the home page.
3. `ownership` (replaces inline `shareholders`).

`COMPANY_IDS` stays as a constant for the foreseeable future — it gives us stable references in code (and matches the IDs already in `revenue.company_id`).

## 2.5 A lightweight metric layer

All in TypeScript, all in `lib/db` (or a new `lib/metrics`). Not user-editable.

### 2.5.1 Shape of a metric

```ts
type MetricSource =
  | { kind: "sql"; sql: (ctx: QueryCtx) => SQL }            // Drizzle SQL fragment
  | { kind: "derived"; deps: string[]; compute: (...vals: number[]) => number };

type Metric = {
  code: string;                  // 'total_revenue', 'mom_revenue_change', …
  label_ko: string;
  unit: "KRW" | "PCT" | "YEARS" | "COUNT";
  format: string;                // d3-format
  source: MetricSource;
  defaultTimeGrain?: "month" | "quarter" | "year" | "ltm";
};
```

- **`sql` metrics** are the analogue of Superset's `SqlMetric`: a Drizzle fragment that produces an aggregated value, e.g. `sum(revenue.amount)` over a join. We resolve them with the dataset and group-bys at query time.
- **`derived` metrics** are computed from other metrics in TypeScript after the rows come back. Examples: MoM change, YoY growth, percent of total. This matches the Superset post-processing pipeline; it's nicer in TS than in SQL for our scale and avoids dialect issues.

Examples we need on day one (driven by Tasks #11, #17, #23):

- `total_revenue` — `SUM(revenue.amount) WHERE category='매출'` grouped by whatever the chart asks.
- `total_revenue_by_store` — same, for `category LIKE '매출 - %'` and `store_id IS NOT NULL`.
- `mom_revenue_change` — derived: `(this_month - prev_month) / prev_month`.
- `yoy_revenue_change` — derived.
- `ltm_revenue` — sql window over the last 12 months from a given anchor.
- `wale`, `occupancy_rate` — direct reads from `kpi_observation`.
- `operating_income`, `net_income`, `total_assets`, `total_liabilities`, `total_equity` — direct reads from `financial_statement_line` by `code` and `fiscal_year`.

### 2.5.2 The query object

A single typed shape, used both server-side and over the wire:

```ts
type QueryRequest = {
  dataset: "revenue" | "kpi" | "financial_statement";
  metrics: string[];                    // metric codes
  group_by?: Array<"company" | "store" | "month" | "quarter" | "year" | "kpi_code">;
  filters?: Array<
    | { col: "company_id"; op: "in"; values: string[] }
    | { col: "year"; op: "between"; min: number; max: number }
    | { col: "category"; op: "eq"; value: string }
    // …
  >;
  time_range?: { kind: "ltm" } | { kind: "year"; year: number } | { kind: "ytd" };
  limit?: number;
};

type QueryResponse = {
  columns: Array<{ key: string; label_ko: string; format?: string }>;
  rows: Array<Record<string, string | number | null>>;
  meta: { generated_at: string; cache_hit: boolean; metric_versions: Record<string, string> };
};
```

This is exactly Superset's `QueryObject` cut down to what we actually need. The server (in `artifacts/api-server`) gains a single new endpoint `POST /api/query` that runs this. The existing `GET /api/revenue` becomes a thin wrapper that constructs a `QueryRequest` for backward compatibility — `useGetRevenue` keeps working unchanged.

### 2.5.3 OpenAPI changes

Add to `lib/api-spec/openapi.yaml`:

- `POST /query` accepting `QueryRequest`, returning `QueryResponse`.
- `GET /metrics` returning the metric registry (so the frontend can show labels/units without re-defining them).
- `GET /datasets` (later, low priority) returning the dataset catalog.

Orval regenerates `useQuery`, `useMetrics`, etc. — the dashboard immediately gets typed hooks.

## 2.6 Chart / visualization layer

### 2.6.1 Library choice

Recommendation, with rationale:

- **Keep Recharts** for the next 3–6 months. It's already in use (`artifacts/dashboard/src/pages/revenue.tsx`), works well in React, integrates with shadcn `chart.tsx`, and is good enough for line/bar/area/composed charts. Switching now is cost without benefit.
- **Pre-decision for the next library swap (when we need it):** **ECharts** (via `echarts-for-react` or its own React binding). Reasons: (a) it's what Superset uses for almost every modern chart, so we'd be standing on the most-tested stack in BI; (b) it handles dense time series, large categorical axes, and complex tooltips far better than Recharts; (c) it has first-class support for Korean locales, currency formatting, and right-to-left labels. Final pick deferred to a follow-up task per the task spec.
- **Specialty visualizations** (the org chart in `components/governance/OrgChart.tsx`) stay custom — they don't belong in the generic chart layer.

### 2.6.2 Chart-config-as-data

Adopt a small `ChartSpec` type and a single `<ChartRenderer />`:

```ts
type ChartSpec = {
  id: string;
  title_ko: string;
  query: QueryRequest;
  viz:
    | { kind: "line"; x: string; y: string[]; series?: string }
    | { kind: "bar";  x: string; y: string[]; stacked?: boolean }
    | { kind: "area"; x: string; y: string[]; stacked?: boolean }
    | { kind: "kpi"; metric: string; compare?: "mom" | "yoy" }
    | { kind: "table"; columns: string[] };
  format?: { y?: string; tooltip?: string };
};
```

Pages declare specs. Example (sketch):

```ts
const CHARTS: ChartSpec[] = [
  {
    id: "rev-trend-by-co",
    title_ko: "회사별 월별 매출 추이",
    query: {
      dataset: "revenue",
      metrics: ["total_revenue"],
      group_by: ["company", "month"],
      filters: [{ col: "year", op: "eq", value: 2025 }],
    },
    viz: { kind: "line", x: "month", y: ["total_revenue"], series: "company" },
  },
  // …
];
```

`<ChartRenderer spec={spec} />` picks the right renderer and passes the resolved data through. This is the single most important refactor on the frontend — it is what makes the difference between "we have charts" and "we have a charting layer."

### 2.6.3 Status of the Looker Studio embed (Task #14)

Keep the embed for now: it gives non-engineers a sandbox to slice data quickly while we build the native layer. Once the native KPI page (Task #17) and the metric layer ship, demote the embed to a small "외부 리포트" tab rather than a permanent fixture. We do **not** want to invest further in Looker Studio as a primary surface — every chart there is a config we can't version-control.

## 2.7 Caching & refresh strategy

A two-layer model that mirrors Superset at a tenth of the complexity:

1. **Server-side query result cache.** Keyed on `hash(QueryRequest) + dataset_version`, where `dataset_version` is the latest `updated_at` on the underlying tables. Cache backend: in-memory LRU on the Express server (single-process is fine at our scale). Per-dataset TTL: `revenue` 10 min, `financial_statement` 24 h, `kpi_observation` 5 min.
2. **Client-side via TanStack Query.** Already in place via Orval. `staleTime` per dataset (longer for financials, short for KPIs). On the existing "데이터 싱크" button we already invalidate `['/api/revenue']`; extend to invalidate `['/api/query']` keys after a sync.

Refresh:

- **Nightly Revenue Sync** (already running 23:00 KST) bumps `revenue.updated_at` implicitly. After a successful run, the sync handler should `POST /api/cache/invalidate` (or simply restart, given the in-memory cache) for the `revenue` dataset.
- **Manual sync button** stays. It triggers the same job, then invalidates client + server caches for `revenue`.
- **Financial statements** are infrequent — uploaded/imported once or twice a year. No special refresh story.

We do **not** need Redis, Celery, or pre-warming at our scale. If any of those become true, this plan still works — they slot in behind the same cache key shape.

## 2.8 Permissions

Keep what we have: optional Supabase login, dev bypass when env unset. Everyone who can log in sees everything. **Do not** invest in row-level security, roles, or per-company access until there's a concrete request.

If/when needed, the lightest path is:

- A `user` table with `company_scope: uuid[] | "all"`.
- A single helper `applyScope(query, user)` in the server that AND-s `company_id IN (...)` into any `QueryRequest`.

That's the entire RLS story. Don't build more.

## 2.9 Phased migration plan

Each phase below is a candidate future task. **We do not create those tasks here** (per the task spec). The phases are sized so each is independently shippable in a few days and reversible.

### Phase A — Schema foundation (no UI change)

- Add migrations for `company`, `company_location`, `person`, `family_relationship`, `ownership`, `store`, `kpi_definition`, `kpi_observation`, `financial_statement`, `financial_statement_line`. Existing `revenue` untouched.
- Backfill `company` and `company_location` from `companies.ts`. Keep `companies.ts` as the source of truth for now — backfill is one-way until Phase B.
- Backfill `person`, `ownership` from `companies.ts` `shareholders` arrays.
- Add `store_id` column + new unique index to `revenue` (nullable, no data change).
- **No frontend change.** Pages still read `companies.ts`.

Risk: low. Pure additive migration. Tests: a script that diffs `companies.ts` vs. DB row-for-row.

### Phase B — Server query endpoint + metric registry

- New file `lib/db/src/metrics/index.ts` defining the `Metric` type and the first ~10 metrics.
- New endpoint `POST /api/query` in `artifacts/api-server`, with the `QueryRequest`/`QueryResponse` shape.
- New endpoint `GET /api/metrics`.
- Add to `openapi.yaml`; regenerate Orval client.
- Existing `GET /api/revenue` re-implemented internally on top of `POST /api/query` (back-compat preserved).

Risk: low — purely additive. Old hook `useGetRevenue` keeps its exact response shape.

### Phase C — Chart spec layer on the dashboard

- Add `ChartSpec` types and `<ChartRenderer />` (Recharts under the hood) to `artifacts/dashboard/src/components/charts/`.
- Refactor `pages/revenue.tsx` to declare its three visualizations (summary bar, trend line, per-company table) as specs. Behavior stays identical; the JSX inside the page shrinks dramatically.
- Add Storybook-style examples to `artifacts/mockup-sandbox` for the renderer.

Risk: medium — this is the biggest frontend churn. Mitigation: do it page by page; revenue first, then 성과지표, then home.

### Phase D — Build 성과지표 on the new layer (slots into Task #17)

- Implement the 성과지표 page entirely against `POST /api/query` + the metric registry.
- KPI tiles are `viz.kind === "kpi"` specs. Drill-downs are `kind: "line" | "bar"` specs.
- This is the proof that the layer pays for itself.

### Phase E — Financial statements (slots into Task #23)

- Populate `financial_statement` + `financial_statement_line` for SGD 2024/2025.
- Add `total_revenue`, `operating_income`, `net_income`, `total_assets`, `total_liabilities`, `total_equity` metrics for the `financial_statement` dataset.
- 성과지표 page reads them via the same `POST /api/query` path.

### Phase F — Move company/ownership reads to DB

- Frontend stops importing `COMPANIES_SEED` for governance pages; reads via new `GET /api/companies` endpoint.
- `companies.ts` becomes a one-time backfill script in `lib/jobs/`, no longer imported at runtime.

### Phase G — Server-side cache + sync invalidation

- Add the in-memory result cache to the Express server.
- Sync job calls invalidate after a successful run.

### Phase H — Looker Studio embed demotion (slots after Task #14)

- Move the embed to a secondary tab on the revenue page or to a top-level "외부 리포트" page.
- Keep one canonical chart in the native layer that mirrors the embed's headline number, so we can sanity-check ourselves.

### Sequencing dependencies

```
A ──▶ B ──▶ C ──▶ D
       └────▶ E
A ──▶ F (independent of B/C, but better after B for consistency)
B ──▶ G
C/D ──▶ H
```

Phases A and B are the unblockers; C is the high-leverage refactor; D and E are where the user-visible payoff arrives.

## 2.10 Open questions

These are intentionally not decided in this document and should be revisited when the corresponding phase starts:

1. **Final chart library.** Recommendation is ECharts; final pick should be a follow-up task that builds the same KPI page in both Recharts and ECharts and compares them on mobile (320px), perf, and Korean formatting.
2. **Time-series resampling.** Should "월간/분기/연간/LTM" tabs (Task #17) be a server-side roll-up parameter (`time_grain`) or a client-side resample on monthly rows? Lean: server-side, to keep the frontend dumb.
3. **Multi-currency.** All entities are KRW today. The `financial_statement.currency` column is there for symmetry but we should not build any FX logic until/unless a JPY or USD entity appears.
4. **Soft delete vs. effective-dated.** `ownership` already has `as_of`; should `company`, `store`, etc. also be effective-dated, or is "latest snapshot + audit log" enough? Lean: latest snapshot only, until we get a request for historical cap-table charts.
5. **Where does `lib/db/src/seed/revenue.ts` go after Phase E?** The synthetic seed is useful for empty-DB demos but conflicts with real data. Lean: keep, but gate it behind a `SEED_DEMO_DATA=1` env var.

---

## Appendix A — Mapping table (Superset → ours)

| Superset concept | Our equivalent | Where it lives |
|---|---|---|
| Metadata DB | (none — we don't need one) | — |
| Analytics DB | Replit Postgres | `lib/db` |
| `Database` model | Implicit single connection | `lib/db/src/index.ts` |
| `Dataset` (`SqlaTable`) | Logical dataset name in `QueryRequest.dataset` | `lib/db/src/datasets/` (new) |
| `TableColumn` (incl. calculated) | Drizzle column refs + small derived-column helpers | `lib/db/src/schema/*.ts` |
| `SqlMetric` | `Metric` registry | `lib/db/src/metrics/index.ts` (new) |
| `Slice` (chart) | `ChartSpec` JSON | `artifacts/dashboard/src/components/charts/` (new) |
| `Dashboard` | A React page that lists `ChartSpec`s | existing `pages/*.tsx` |
| `NativeFilter` | Page-level state (year selector, company selector) | existing `useState` in pages |
| `QueryContext` / `QueryObject` | `QueryRequest` | `lib/api-spec/openapi.yaml` |
| Jinja templating | TypeScript closures on metric `sql` | `lib/db/src/metrics/index.ts` |
| Post-processing pipeline | `derived` metric `compute` functions | `lib/db/src/metrics/index.ts` |
| Results cache | In-memory LRU keyed on `QueryRequest + dataset_version` | `artifacts/api-server/src/cache.ts` (new) |
| Thumbnail cache | (none) | — |
| Viz plugin (`buildQuery`/`transformProps`/`Chart`) | `ChartSpec` + `<ChartRenderer />` | `artifacts/dashboard/src/components/charts/` (new) |
| Roles / RLS | Single role; optional `applyScope(query, user)` later | not yet |
| SQL Lab | (out of scope) | — |
| Alerts & Reports | (out of scope) | — |

## Appendix B — Files referenced

In this repo:

- `replit.md`
- `artifacts/dashboard/src/lib/data/companies.ts`
- `artifacts/dashboard/src/pages/revenue.tsx`
- `artifacts/dashboard/src/lib/supabase/client.ts`
- `lib/db/src/schema/revenue.ts`
- `lib/db/drizzle/0000_messy_stone_men.sql`
- `lib/api-spec/openapi.yaml`
- `lib/api-client-react/src/generated/api.ts`
- `lib/api-client-react/src/custom-fetch.ts`
- `artifacts/api-server/src/app.ts`
- `artifacts/api-server/src/routes/revenue.ts`
- `artifacts/api-server/src/routes/sync.ts`
- `lib/jobs/src/sync-revenue-from-sheets.ts`
- `.local/tasks/revenue-db-and-dashboard.md` (Task #11)
- `.local/tasks/add-data-studio-embed-to-revenue-page.md` (Task #14)
- `.local/tasks/performance-kpi-page.md` (Task #17)
- `.local/tasks/full-mobile-responsive.md` (Task #20)
- `.local/tasks/financial-statements.md` (Task #23)

In the Superset codebase (for cross-reference):

- `superset/models/core.py` — `Database`
- `superset/connectors/sqla/models.py` — `SqlaTable`, `TableColumn`, `SqlMetric`
- `superset/models/slice.py` — `Slice`
- `superset/models/dashboard.py` — `Dashboard`
- `superset/common/query_context.py` — `QueryContext`
- `superset/common/query_object.py` — `QueryObject`
- `superset/jinja_context.py` — Jinja macros for metric SQL
- `superset/utils/pandas_postprocessing/` — post-processing pipeline
- `superset/config.py` — `CACHE_CONFIG`, `DATA_CACHE_CONFIG`
- `superset-frontend/plugins/plugin-chart-echarts/` — primary modern viz plugin
- `superset/row_level_security/` — RLS rules
