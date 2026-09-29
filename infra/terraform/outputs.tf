output "app_public_ip" {
  value = aws_eip.app.public_ip
}

output "rds_endpoint" {
  value = aws_db_instance.vprocly.address
}

output "rds_admin_password" {
  value     = random_password.rds_master.result
  sensitive = true
}

output "vprocly_app_db_password" {
  value     = random_password.vprocly_app_db.result
  sensitive = true
}

output "keycloak_db_password" {
  value     = random_password.keycloak_db.result
  sensitive = true
}

output "ecr_repository_urls" {
  value = {
    api    = aws_ecr_repository.api.repository_url
    worker = aws_ecr_repository.worker.repository_url
    excel  = aws_ecr_repository.excel.repository_url
    web    = aws_ecr_repository.web.repository_url
  }
}

output "amplify_env_vars" {
  description = "Set these in the Amplify console for the vprocly-frontend app (see the plan's Amplify step)."
  value = {
    NEXTAUTH_URL   = "https://${var.domain}"
    OIDC_ISSUER    = "https://auth.${var.domain}/realms/vprocly"
    OIDC_CLIENT_ID = "vprocly-web"
    API_URL        = "https://api.${var.domain}"
  }
}

output "post_apply_bootstrap_sql" {
  description = "Run this once against rds_endpoint (as vprocly_admin) before the app can connect -- see infra/compose/postgres/init.sql for the dev equivalent."
  value       = <<-SQL
    CREATE ROLE vprocly_app LOGIN PASSWORD '${nonsensitive(random_password.vprocly_app_db.result)}';
    GRANT CONNECT ON DATABASE vprocly TO vprocly_app;
    CREATE EXTENSION IF NOT EXISTS vector;
    CREATE EXTENSION IF NOT EXISTS pgcrypto;
    CREATE DATABASE keycloak;
    \c keycloak
    CREATE ROLE keycloak LOGIN PASSWORD '${nonsensitive(random_password.keycloak_db.result)}';
    GRANT ALL PRIVILEGES ON DATABASE keycloak TO keycloak;
    GRANT ALL ON SCHEMA public TO keycloak;
  SQL
  sensitive   = true
}
