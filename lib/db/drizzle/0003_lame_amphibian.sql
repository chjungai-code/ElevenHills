CREATE TABLE "company_location" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"name" text NOT NULL,
	"address" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"display_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "company" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"short_name" text,
	"category" text NOT NULL,
	"parent_id" uuid,
	"display_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "family_relationship" (
	"person_a_id" uuid NOT NULL,
	"person_b_id" uuid NOT NULL,
	"kind" text NOT NULL,
	CONSTRAINT "family_relationship_person_a_id_person_b_id_kind_pk" PRIMARY KEY("person_a_id","person_b_id","kind")
);
--> statement-breakpoint
CREATE TABLE "ownership" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"owner_company_id" uuid,
	"owner_person_id" uuid,
	"owner_name" text NOT NULL,
	"is_entity" boolean NOT NULL,
	"percentage" numeric(6, 3) NOT NULL,
	"as_of" date NOT NULL,
	"display_order" integer DEFAULT 0 NOT NULL,
	"note" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ownership_owner_xor" CHECK ((("ownership"."owner_company_id" IS NOT NULL)::int + ("ownership"."owner_person_id" IS NOT NULL)::int) <= 1)
);
--> statement-breakpoint
CREATE TABLE "person" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"is_family" boolean DEFAULT false NOT NULL,
	"family_role" text,
	"display_color" text,
	"display_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "person_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "store" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"name" text NOT NULL,
	"opened_on" date,
	"closed_on" date
);
--> statement-breakpoint
ALTER TABLE "company_location" ADD CONSTRAINT "company_location_company_id_company_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."company"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "family_relationship" ADD CONSTRAINT "family_relationship_person_a_id_person_id_fk" FOREIGN KEY ("person_a_id") REFERENCES "public"."person"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "family_relationship" ADD CONSTRAINT "family_relationship_person_b_id_person_id_fk" FOREIGN KEY ("person_b_id") REFERENCES "public"."person"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ownership" ADD CONSTRAINT "ownership_company_id_company_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."company"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ownership" ADD CONSTRAINT "ownership_owner_company_id_company_id_fk" FOREIGN KEY ("owner_company_id") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ownership" ADD CONSTRAINT "ownership_owner_person_id_person_id_fk" FOREIGN KEY ("owner_person_id") REFERENCES "public"."person"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store" ADD CONSTRAINT "store_company_id_company_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."company"("id") ON DELETE cascade ON UPDATE no action;