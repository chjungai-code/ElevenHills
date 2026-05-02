CREATE TABLE "revenue" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"year" integer NOT NULL,
	"month" integer NOT NULL,
	"amount" numeric(18, 2) NOT NULL,
	"category" text DEFAULT '매출' NOT NULL,
	"memo" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "revenue_company_year_month_category_key" UNIQUE("company_id","year","month","category")
);
