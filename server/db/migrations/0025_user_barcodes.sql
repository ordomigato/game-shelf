CREATE TABLE "user_barcodes" (
	"owner_id" uuid NOT NULL,
	"code" text NOT NULL,
	"igdb_id" integer NOT NULL,
	"platform_id" integer,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_barcodes_owner_id_code_pk" PRIMARY KEY("owner_id","code")
);
--> statement-breakpoint
ALTER TABLE "user_barcodes" ADD CONSTRAINT "user_barcodes_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;