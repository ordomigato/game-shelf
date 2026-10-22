ALTER TABLE "barcode_lookups" DROP CONSTRAINT "barcode_lookups_pkey";--> statement-breakpoint
ALTER TABLE "barcode_lookups" ALTER COLUMN "fetched_at" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "barcode_lookups" ALTER COLUMN "fetched_at" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "barcode_lookups" ADD COLUMN "id" integer PRIMARY KEY NOT NULL GENERATED ALWAYS AS IDENTITY (sequence name "barcode_lookups_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1);--> statement-breakpoint
ALTER TABLE "barcode_lookups" ADD COLUMN "source" text DEFAULT 'scandex' NOT NULL;--> statement-breakpoint
ALTER TABLE "barcode_lookups" ALTER COLUMN "source" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "barcode_lookups" ADD COLUMN "submitted_by" uuid;--> statement-breakpoint
ALTER TABLE "barcode_lookups" ADD COLUMN "status" text;--> statement-breakpoint
ALTER TABLE "barcode_lookups" ADD COLUMN "reviewed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "barcode_lookups" ADD COLUMN "sent_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "barcode_lookups" ADD COLUMN "created_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "barcode_lookups" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "reviews_barcodes" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "barcode_lookups" ADD CONSTRAINT "barcode_lookups_submitted_by_users_id_fk" FOREIGN KEY ("submitted_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "barcode_lookups_scandex_idx" ON "barcode_lookups" USING btree ("code") WHERE "barcode_lookups"."source" = 'scandex';--> statement-breakpoint
CREATE UNIQUE INDEX "barcode_lookups_pick_idx" ON "barcode_lookups" USING btree ("code","submitted_by") WHERE "barcode_lookups"."source" = 'user' and "barcode_lookups"."submitted_by" is not null;--> statement-breakpoint
CREATE INDEX "barcode_lookups_review_idx" ON "barcode_lookups" USING btree ("status","code") WHERE "barcode_lookups"."source" = 'user';--> statement-breakpoint
CREATE INDEX "barcode_lookups_submitted_by_idx" ON "barcode_lookups" USING btree ("submitted_by");--> statement-breakpoint
ALTER TABLE "barcode_lookups" ADD CONSTRAINT "barcode_lookups_source" CHECK ("barcode_lookups"."source" in ('scandex', 'user'));--> statement-breakpoint
ALTER TABLE "barcode_lookups" ADD CONSTRAINT "barcode_lookups_status" CHECK ("barcode_lookups"."status" in ('pending', 'approved', 'rejected'));--> statement-breakpoint
ALTER TABLE "barcode_lookups" ADD CONSTRAINT "barcode_lookups_source_parts" CHECK (("barcode_lookups"."source" = 'scandex' and "barcode_lookups"."status" is null and "barcode_lookups"."fetched_at" is not null) or ("barcode_lookups"."source" = 'user' and "barcode_lookups"."status" is not null and "barcode_lookups"."igdb_id" is not null));