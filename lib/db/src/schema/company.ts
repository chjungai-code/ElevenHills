import {
  pgTable,
  uuid,
  text,
  boolean,
  numeric,
  date,
  integer,
  timestamp,
  primaryKey,
  check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const companyTable = pgTable("company", {
  id: uuid("id").primaryKey(),
  name: text("name").notNull(),
  short_name: text("short_name"),
  category: text("category").notNull(),
  parent_id: uuid("parent_id"),
  display_order: integer("display_order").default(0).notNull(),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const companyLocationTable = pgTable("company_location", {
  id: uuid("id").primaryKey().defaultRandom(),
  company_id: uuid("company_id")
    .notNull()
    .references(() => companyTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  address: text("address"),
  is_active: boolean("is_active").default(true).notNull(),
  display_order: integer("display_order").default(0).notNull(),
});

export const personTable = pgTable("person", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull().unique(),
  is_family: boolean("is_family").default(false).notNull(),
  family_role: text("family_role"),
  display_color: text("display_color"),
  display_order: integer("display_order").default(0).notNull(),
});

export const familyRelationshipTable = pgTable(
  "family_relationship",
  {
    person_a_id: uuid("person_a_id")
      .notNull()
      .references(() => personTable.id, { onDelete: "cascade" }),
    person_b_id: uuid("person_b_id")
      .notNull()
      .references(() => personTable.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
  },
  (t) => [primaryKey({ columns: [t.person_a_id, t.person_b_id, t.kind] })],
);

export const ownershipTable = pgTable(
  "ownership",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    company_id: uuid("company_id")
      .notNull()
      .references(() => companyTable.id, { onDelete: "cascade" }),
    owner_company_id: uuid("owner_company_id").references(() => companyTable.id),
    owner_person_id: uuid("owner_person_id").references(() => personTable.id),
    owner_name: text("owner_name").notNull(),
    is_entity: boolean("is_entity").notNull(),
    percentage: numeric("percentage", { precision: 6, scale: 3 }).notNull(),
    as_of: date("as_of").notNull(),
    display_order: integer("display_order").default(0).notNull(),
    note: text("note"),
    updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    check(
      "ownership_owner_xor",
      sql`((${t.owner_company_id} IS NOT NULL)::int + (${t.owner_person_id} IS NOT NULL)::int) <= 1`,
    ),
  ],
);

export const storeTable = pgTable("store", {
  id: uuid("id").primaryKey().defaultRandom(),
  company_id: uuid("company_id")
    .notNull()
    .references(() => companyTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  opened_on: date("opened_on"),
  closed_on: date("closed_on"),
});

export type CompanyRow = typeof companyTable.$inferSelect;
export type CompanyLocationRow = typeof companyLocationTable.$inferSelect;
export type PersonRow = typeof personTable.$inferSelect;
export type FamilyRelationshipRow = typeof familyRelationshipTable.$inferSelect;
export type OwnershipRow = typeof ownershipTable.$inferSelect;
export type StoreRow = typeof storeTable.$inferSelect;
