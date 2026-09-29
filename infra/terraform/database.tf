resource "random_password" "rds_master" {
  length  = 32
  special = false # avoid characters Postgres connection strings need escaping for
}

resource "random_password" "vprocly_app_db" {
  length  = 32
  special = false
}

resource "random_password" "keycloak_db" {
  length  = 32
  special = false
}

# Single db.t4g.micro, single-AZ -- the app (`vprocly`) and Keycloak (`keycloak`) get their own logical
# databases on it (see the `vprocly_app`/`keycloak` role provisioning note in outputs.tf's bootstrap
# instructions). Temporal deliberately does NOT get a database here -- it runs in `start-dev` mode with
# local SQLite persistence on the app host, an accepted pilot-tier simplification (see the plan).
resource "aws_db_instance" "vprocly" {
  identifier     = "vprocly-pilot"
  engine         = "postgres"
  engine_version = "16"
  instance_class = var.db_instance_class

  allocated_storage = 20
  storage_type      = "gp3"

  db_name  = "vprocly"
  username = "vprocly_admin"
  password = random_password.rds_master.result

  db_subnet_group_name   = aws_db_subnet_group.vprocly.name
  vpc_security_group_ids = [aws_security_group.db.id]
  publicly_accessible    = false
  multi_az               = false

  backup_retention_period = 3
  skip_final_snapshot     = true # pilot: no destroy-time snapshot needed
  deletion_protection     = false

  tags = { Name = "vprocly-pilot" }
}
