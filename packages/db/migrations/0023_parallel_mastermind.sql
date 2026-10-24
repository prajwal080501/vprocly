CREATE TABLE "wallet_refill_orders" (
	"id" uuid PRIMARY KEY NOT NULL,
	"platform_supplier_id" uuid NOT NULL,
	"pack_id" text NOT NULL,
	"points" integer NOT NULL,
	"amount_paise" integer NOT NULL,
	"currency" text DEFAULT 'INR' NOT NULL,
	"razorpay_order_id" text NOT NULL,
	"razorpay_payment_id" text,
	"status" text DEFAULT 'created' NOT NULL,
	"credited_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "wallet_refill_orders_razorpay_order_id_unique" UNIQUE("razorpay_order_id"),
	CONSTRAINT "wallet_refill_orders_razorpay_payment_id_unique" UNIQUE("razorpay_payment_id")
);
--> statement-breakpoint
ALTER TABLE "wallet_refill_orders" ADD CONSTRAINT "wallet_refill_orders_platform_supplier_id_platform_suppliers_id_fk" FOREIGN KEY ("platform_supplier_id") REFERENCES "public"."platform_suppliers"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON wallet_refill_orders TO vprocly_app;
