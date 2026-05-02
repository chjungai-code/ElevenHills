import { pgTable, uuid, integer, numeric, text, timestamp, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const revenueTable = pgTable(
  "revenue",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    company_id: uuid("company_id").notNull(),
    year: integer("year").notNull(),
    month: integer("month").notNull(),
    amount: numeric("amount", { precision: 18, scale: 2 }).notNull(),
    category: text("category").notNull().default("매출"),
    memo: text("memo"),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    unique("revenue_company_year_month_category_key").on(
      t.company_id,
      t.year,
      t.month,
      t.category,
    ),
  ],
);

export const insertRevenueSchema = createInsertSchema(revenueTable).omit({
  id: true,
  created_at: true,
});

export type InsertRevenue = z.infer<typeof insertRevenueSchema>;
export type RevenueRow = typeof revenueTable.$inferSelect;
