CREATE TABLE "games" (
	"igdb_id" integer PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"cover_id" text,
	"release_date" date,
	"genres" text[] DEFAULT '{}' NOT NULL,
	"platform_ids" integer[] DEFAULT '{}' NOT NULL,
	"fetched_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "platforms" (
	"igdb_id" integer PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"abbreviation" text
);
