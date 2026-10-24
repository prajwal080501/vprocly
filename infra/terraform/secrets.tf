# Every runtime secret/config value lands here as a flat SecureString namespace, and the app host's boot
# script (compute.tf's user_data) pulls the whole path into one .env file shared by the api+worker
# containers -- extra keys a given service doesn't declare in its zod config are just ignored, so one file
# is simpler than maintaining per-service subsets.

resource "random_password" "nextauth_secret" {
  length  = 48
  special = false
}

resource "random_password" "kc_bootstrap_admin" {
  length  = 24
  special = false
}

resource "random_password" "kc_vprocly_web_secret" {
  length  = 32
  special = false
}

resource "random_password" "kc_vprocly_admin_api_secret" {
  length  = 32
  special = false
}

resource "random_password" "sarvam_webhook_secret_fallback" {
  # Only used if reused_secrets.sarvam_webhook_secret is left blank -- min(24) per apps/api & apps/worker
  # config.ts, and api/worker must share the exact same value.
  length  = 32
  special = false
}

locals {
  sarvam_webhook_secret = var.reused_secrets.sarvam_webhook_secret != "" ? var.reused_secrets.sarvam_webhook_secret : random_password.sarvam_webhook_secret_fallback.result

  # sslmode=no-verify: RDS requires TLS but its cert chains to a CA not in Node's default trust store --
  # confirmed by hand against this exact instance (plain `sslmode=require` upgrades to verify-full per
  # node-postgres's own libpq-compat warning and then fails with SELF_SIGNED_CERT_IN_CHAIN). Still encrypted
  # in transit, just not verifying the RDS server cert -- an accepted pilot-tier trade-off, not "no TLS".
  database_url       = "postgres://vprocly_app:${random_password.vprocly_app_db.result}@${aws_db_instance.vprocly.address}:5432/vprocly?sslmode=no-verify"
  database_admin_url = "postgres://vprocly_admin:${random_password.rds_master.result}@${aws_db_instance.vprocly.address}:5432/vprocly?sslmode=no-verify"

  env_params = {
    # --- shared / api / worker (apps/api/src/config.ts, apps/worker/src/config.ts) ---
    DATABASE_URL                           = local.database_url
    DATABASE_ADMIN_URL                     = local.database_admin_url # one-off migration runs only, not read by the apps themselves
    OIDC_ISSUER                            = "https://auth.${var.domain}/realms/vprocly"
    OIDC_AUDIENCE                          = "vprocly-api"
    S3_ACCESS_KEY                          = aws_iam_access_key.app_s3.id
    S3_SECRET_KEY                          = aws_iam_access_key.app_s3.secret
    S3_BUCKET_DOCUMENTS                    = "vprocly-media"
    S3_BUCKET_QUARANTINE                   = aws_s3_bucket.quarantine.bucket
    S3_REGION                              = var.aws_region
    CORS_ORIGIN                            = "https://${var.domain}"
    PUBLIC_WEB_URL                         = "https://${var.domain}"
    PUBLIC_API_URL                         = "https://api.${var.domain}"
    KEYCLOAK_ADMIN_URL                     = "https://auth.${var.domain}"
    KEYCLOAK_ADMIN_CLIENT_ID               = "vprocly-admin-api"
    KEYCLOAK_ADMIN_CLIENT_SECRET           = random_password.kc_vprocly_admin_api_secret.result
    KEYCLOAK_TARGET_REALM                  = "vprocly"
    EMAIL_DELIVERY_MODE                    = "live"
    SMTP_HOST                              = var.reused_secrets.smtp_host
    SMTP_PORT                              = tostring(var.reused_secrets.smtp_port)
    SMTP_USER                              = var.reused_secrets.smtp_user
    SMTP_PASS                              = var.reused_secrets.smtp_pass
    SMTP_FROM                              = var.reused_secrets.smtp_from
    NOREPLY_SMTP_HOST                      = var.reused_secrets.noreply_smtp_host
    NOREPLY_SMTP_PORT                      = tostring(var.reused_secrets.noreply_smtp_port)
    NOREPLY_SMTP_USER                      = var.reused_secrets.noreply_smtp_user
    NOREPLY_SMTP_PASS                      = var.reused_secrets.noreply_smtp_pass
    NOREPLY_SMTP_FROM                      = var.reused_secrets.noreply_smtp_from
    RAZORPAY_KEY_ID                        = var.reused_secrets.razorpay_key_id
    RAZORPAY_KEY_SECRET                    = var.reused_secrets.razorpay_key_secret
    RAZORPAY_WEBHOOK_SECRET                = var.reused_secrets.razorpay_webhook_secret
    GEMINI_API_KEY                         = var.reused_secrets.gemini_api_key
    # INR micros based on Gemini 3.8 Flash / Google Maps India list prices on 2026-10-24. Token rates
    # are per 1M tokens; grounding and Place Details are per billable event. Free allowances excluded.
    GEMINI_INPUT_COST_MICROS_PER_MILLION   = "71301825"
    GEMINI_OUTPUT_COST_MICROS_PER_MILLION  = "356509125"
    GEMINI_SEARCH_COST_MICROS              = "1330967"
    GOOGLE_PLACE_DETAILS_COST_MICROS       = "570415"
    GOOGLE_PLACES_API_KEY                  = var.reused_secrets.google_places_api_key
    GOOGLE_MAPS_API_KEY                    = var.reused_secrets.google_places_api_key
    VOICE_DELIVERY_MODE                    = "live"
    SARVAM_API_KEY                         = var.reused_secrets.sarvam_api_key
    SARVAM_ORG_ID                          = var.reused_secrets.sarvam_org_id
    SARVAM_WORKSPACE_ID                    = var.reused_secrets.sarvam_workspace_id
    SARVAM_APP_ID                          = var.reused_secrets.sarvam_app_id
    SARVAM_APP_VERSION                     = tostring(var.sarvam_app_version)
    SARVAM_CONNECTION_ID                   = var.reused_secrets.sarvam_connection_id
    SARVAM_AGENT_PHONE_NUMBER              = var.reused_secrets.sarvam_agent_phone
    SARVAM_WEBHOOK_SECRET                  = local.sarvam_webhook_secret
    SARVAM_CAMPAIGN_NAME                   = var.sarvam_campaign_name
    SARVAM_CAMPAIGN_ATTEMPTS_PER_SECOND    = "1"
    SARVAM_CAMPAIGN_MAX_RETRIES            = "2"
    SARVAM_CAMPAIGN_RETRY_INTERVAL_MINUTES = "15"
    SARVAM_CAMPAIGN_TIMEZONE               = "Asia/Kolkata"
    SARVAM_CAMPAIGN_START_TIME             = "10:00"
    SARVAM_CAMPAIGN_END_TIME               = "18:00"
    SARVAM_CAMPAIGN_DAYS                   = "Monday,Tuesday,Wednesday,Thursday,Friday,Saturday"
    OPS_ALERT_WEBHOOK_URL                  = var.ops_alert_webhook_url
    EXCEL_SERVICE_URL                      = "http://excel:8001"
    # S3_ENDPOINT / S3_EXCEL_ENDPOINT deliberately absent: both are z.string().url().optional() in
    # config.ts, and a set-but-blank value would fail that .url() check instead of being treated as unset.
    # Omitting the key entirely (not writing an empty placeholder) is what makes the app fall through to
    # real AWS S3 instead of the dev SeaweedFS stand-in's endpoint override.
    NATS_URL         = "nats://nats:4222"
    CLAMAV_HOST      = "clamav"
    CLAMAV_PORT      = "3310"
    TEMPORAL_ADDRESS = "temporal:7233"

    # --- web (server-side Next.js / NextAuth runtime) ---
    NEXTAUTH_URL         = "https://${var.domain}"
    OPERATIONS_URL       = "https://operations.${var.domain}"
    AUTH_COOKIE_DOMAIN   = ".${var.domain}"
    OIDC_INTERNAL_ISSUER = "http://keycloak:8080/realms/vprocly"
    OIDC_CLIENT_ID       = "vprocly-web"
    API_URL              = "http://api:4000/api"

    # --- compose-level (docker-compose.prod.yml interpolation, keycloak service) ---
    RDS_ENDPOINT                = aws_db_instance.vprocly.address
    KC_BOOTSTRAP_ADMIN_PASSWORD = random_password.kc_bootstrap_admin.result
    KC_DB_PASSWORD              = random_password.keycloak_db.result
    KC_VPROCLY_WEB_SECRET       = random_password.kc_vprocly_web_secret.result
    KC_VPROCLY_ADMIN_API_SECRET = random_password.kc_vprocly_admin_api_secret.result

    # --- consumed by Amplify's env vars (set there manually, see the plan) but recorded here as the single
    # source of truth so they're not re-generated inconsistently ---
    NEXTAUTH_SECRET    = random_password.nextauth_secret.result
    OIDC_CLIENT_SECRET = random_password.kc_vprocly_web_secret.result
  }
}

resource "aws_ssm_parameter" "env" {
  for_each  = local.env_params
  name      = "/vprocly/prod/env/${each.key}"
  type      = "SecureString"
  value     = each.value
  overwrite = true
}
