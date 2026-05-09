CREATE TABLE "kpi_definition" (
	"code" text PRIMARY KEY NOT NULL,
	"display_name_ko" text NOT NULL,
	"unit" text NOT NULL,
	"format" text NOT NULL,
	"target_kind" text DEFAULT 'higher_is_better' NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kpi_observation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kpi_code" text NOT NULL,
	"company_id" uuid,
	"period_kind" text NOT NULL,
	"period_start" date NOT NULL,
	"value" numeric(20, 4) NOT NULL,
	"target" numeric(20, 4),
	"source" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "kpi_observation_unique_period" UNIQUE NULLS NOT DISTINCT("kpi_code","company_id","period_kind","period_start")
);
--> statement-breakpoint
ALTER TABLE "kpi_observation" ADD CONSTRAINT "kpi_observation_kpi_code_kpi_definition_code_fk" FOREIGN KEY ("kpi_code") REFERENCES "public"."kpi_definition"("code") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kpi_observation" ADD CONSTRAINT "kpi_observation_company_id_company_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."company"("id") ON DELETE cascade ON UPDATE no action;