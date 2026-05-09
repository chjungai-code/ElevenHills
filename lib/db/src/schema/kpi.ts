import {
  pgTable,
  uuid,
  text,
  numeric,
  date,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { companyTable } from "./company";

export const kpiDefinitionTable = pgTable("kpi_definition", {
  code: text("code").primaryKey(),
  display_name_ko: text("display_name_ko").notNull(),
  unit: text("unit").notNull(),
  format: text("format").notNull(),
  target_kind: text("target_kind").notNull().default("higher_is_better"),
  description: text("description"),
  created_at: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const kpiObservationTable = pgTable(
  "kpi_observation",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    kpi_code: text("kpi_code")
      .notNull()
      .references(() => kpiDefinitionTable.code, { onDelete: "cascade" }),
    company_id: uuid("company_id").references(() => companyTable.id, {
      onDelete: "cascade",
    }),
    period_kind: text("period_kind").notNull(),
    period_start: date("period_start").notNull(),
    value: numeric("value", { precision: 20, scale: 4 }).notNull(),
    target: numeric("target", { precision: 20, scale: 4 }),
    source: text("source"),
    created_at: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    unique("kpi_observation_unique_period")
      .on(t.kpi_code, t.company_id, t.period_kind, t.period_start)
      .nullsNotDistinct(),
  ],
);

export const insertKpiDefinitionSchema = createInsertSchema(
  kpiDefinitionTable,
).omit({ created_at: true });

export const insertKpiObservationSchema = createInsertSchema(
  kpiObservationTable,
).omit({ id: true, created_at: true });

export type InsertKpiDefinition = z.infer<typeof insertKpiDefinitionSchema>;
export type InsertKpiObservation = z.infer<typeof insertKpiObservationSchema>;
export type KpiDefinitionRow = typeof kpiDefinitionTable.$inferSelect;
export type KpiObservationRow = typeof kpiObservationTable.$inferSelect;
