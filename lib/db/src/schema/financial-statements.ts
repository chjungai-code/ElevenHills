import {
  pgTable,
  uuid,
  integer,
  numeric,
  text,
  timestamp,
  boolean,
  date,
  unique,
  check,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const financialStatementTable = pgTable(
  "financial_statement",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    company_id: uuid("company_id").notNull(),
    fiscal_year: integer("fiscal_year").notNull(),
    statement_type: text("statement_type").notNull(), // 'income_statement' | 'balance_sheet'
    period_start: date("period_start"),
    period_end: date("period_end"),
    currency: text("currency").notNull().default("KRW"),
    unit: text("unit").notNull().default("won"),
    created_at: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    unique("financial_statement_company_year_type_key").on(
      t.company_id,
      t.fiscal_year,
      t.statement_type,
    ),
    check(
      "financial_statement_statement_type_check",
      sql`${t.statement_type} IN ('income_statement', 'balance_sheet')`,
    ),
  ],
);

export const financialStatementLineTable = pgTable(
  "financial_statement_line",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    statement_id: uuid("statement_id")
      .notNull()
      .references(() => financialStatementTable.id, { onDelete: "cascade" }),
    sort_order: integer("sort_order").notNull(),
    depth: integer("depth").notNull().default(0),
    section_code: text("section_code"),
    account_code: text("account_code"),
    account_name_ko: text("account_name_ko").notNull(),
    amount: numeric("amount", { precision: 20, scale: 2 }),
    prior_amount: numeric("prior_amount", { precision: 20, scale: 2 }),
    is_subtotal: boolean("is_subtotal").notNull().default(false),
    parent_line_id: uuid("parent_line_id").references(
      (): AnyPgColumn => financialStatementLineTable.id,
      { onDelete: "set null" },
    ),
  },
  (t) => [
    unique("financial_statement_line_statement_sort_key").on(
      t.statement_id,
      t.sort_order,
    ),
  ],
);

export const insertFinancialStatementSchema = createInsertSchema(
  financialStatementTable,
).omit({ id: true, created_at: true });

export const insertFinancialStatementLineSchema = createInsertSchema(
  financialStatementLineTable,
).omit({ id: true });

export type InsertFinancialStatement = z.infer<
  typeof insertFinancialStatementSchema
>;
export type FinancialStatementRow =
  typeof financialStatementTable.$inferSelect;
export type InsertFinancialStatementLine = z.infer<
  typeof insertFinancialStatementLineSchema
>;
export type FinancialStatementLineRow =
  typeof financialStatementLineTable.$inferSelect;

export const STATEMENT_TYPES = {
  INCOME_STATEMENT: "income_statement",
  BALANCE_SHEET: "balance_sheet",
} as const;
export type StatementType =
  (typeof STATEMENT_TYPES)[keyof typeof STATEMENT_TYPES];
