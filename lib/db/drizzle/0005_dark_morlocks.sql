CREATE TABLE "tax_document_2025" (
	"file_id" text PRIMARY KEY NOT NULL,
	"company_id" text NOT NULL,
	"subfolder" text NOT NULL,
	"subfolder_order" integer DEFAULT 0 NOT NULL,
	"name" text NOT NULL,
	"web_view_link" text NOT NULL,
	"mime_type" text NOT NULL,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL
);
