ALTER TABLE "documents" ADD COLUMN "scanned_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "scan_signature" text;