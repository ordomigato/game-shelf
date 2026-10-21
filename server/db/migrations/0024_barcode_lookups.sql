CREATE TABLE "barcode_lookups" (
	"code" text PRIMARY KEY NOT NULL,
	"igdb_id" integer,
	"platform_id" integer,
	"platform_name" text,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "barcode_lookups_match_parts" CHECK ("barcode_lookups"."igdb_id" is not null or ("barcode_lookups"."platform_id" is null and "barcode_lookups"."platform_name" is null))
);
