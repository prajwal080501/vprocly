CREATE TABLE supplier_signup_otps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  email text NOT NULL,
  purpose text NOT NULL DEFAULT 'supplier_signup',
  code_hash text NOT NULL,
  attempts integer NOT NULL DEFAULT 0,
  expires_at timestamptz NOT NULL,
  verified_at timestamptz,
  verification_token_hash text UNIQUE,
  verification_expires_at timestamptz,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX supplier_signup_otps_email_created_idx ON supplier_signup_otps(email, created_at);
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON supplier_signup_otps TO vprocly_app;
