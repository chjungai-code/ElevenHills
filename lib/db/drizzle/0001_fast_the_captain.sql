CREATE TABLE "financial_statement_line" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"statement_id" uuid NOT NULL,
	"sort_order" integer NOT NULL,
	"depth" integer DEFAULT 0 NOT NULL,
	"section_code" text,
	"account_code" text,
	"account_name_ko" text NOT NULL,
	"amount" numeric(20, 2),
	"prior_amount" numeric(20, 2),
	"is_subtotal" boolean DEFAULT false NOT NULL,
	"parent_line_id" uuid,
	CONSTRAINT "financial_statement_line_statement_sort_key" UNIQUE("statement_id","sort_order")
);
--> statement-breakpoint
CREATE TABLE "financial_statement" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"fiscal_year" integer NOT NULL,
	"statement_type" text NOT NULL,
	"period_start" date,
	"period_end" date,
	"currency" text DEFAULT 'KRW' NOT NULL,
	"unit" text DEFAULT 'won' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "financial_statement_company_year_type_key" UNIQUE("company_id","fiscal_year","statement_type")
);
--> statement-breakpoint
ALTER TABLE "financial_statement_line" ADD CONSTRAINT "financial_statement_line_statement_id_financial_statement_id_fk" FOREIGN KEY ("statement_id") REFERENCES "public"."financial_statement"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_statement_line" ADD CONSTRAINT "financial_statement_line_parent_line_id_financial_statement_line_id_fk" FOREIGN KEY ("parent_line_id") REFERENCES "public"."financial_statement_line"("id") ON DELETE set null ON UPDATE no action;