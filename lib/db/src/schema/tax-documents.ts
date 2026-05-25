import { pgTable, text, timestamp, integer } from "drizzle-orm/pg-core";

/**
 * Cache of files enumerated from the user's 정주현_법인세_서류_2025
 * Google Drive folder, keyed by Drive file id. Populated by the
 * `sync-tax-documents` job and served to the dashboard via
 * `GET /api/tax-documents`.
 */
export const taxDocument2025Table = pgTable("tax_document_2025", {
  file_id: text("file_id").primaryKey(),
  company_id: text("company_id").notNull(),
  subfolder: text("subfolder").notNull(),
  subfolder_order: integer("subfolder_order").default(0).notNull(),
  name: text("name").notNull(),
  web_view_link: text("web_view_link").notNull(),
  mime_type: text("mime_type").notNull(),
  synced_at: timestamp("synced_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});
