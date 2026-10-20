ALTER TABLE "collections" ADD COLUMN "hidden_columns" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "list_columns" jsonb DEFAULT '{}'::jsonb NOT NULL;