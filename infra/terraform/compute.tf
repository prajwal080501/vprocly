data "aws_ssm_parameter" "al2023_arm64" {
  name = "/aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-arm64"
}

locals {
  ecr_registry = "${data.aws_caller_identity.current.account_id}.dkr.ecr.${var.aws_region}.amazonaws.com"
}

resource "aws_instance" "app" {
  ami                    = data.aws_ssm_parameter.al2023_arm64.value
  instance_type          = var.app_instance_type
  subnet_id              = data.aws_subnet.app.id
  vpc_security_group_ids = [aws_security_group.app.id]
  iam_instance_profile   = aws_iam_instance_profile.app.name

  root_block_device {
    volume_size = 30
    volume_type = "gp3"
  }

  # Every value the boot script needs is either baked in here (the compose/Caddy/realm files, which change
  # only when this repo's infra changes) or fetched live from SSM at boot (secrets) -- nothing sensitive is
  # embedded in user_data itself, so it's safe to leave readable in the instance's metadata.
  user_data = templatefile("${path.module}/templates/user_data.sh.tpl", {
    docker_compose_yml = file("${path.module}/../compose/docker-compose.prod.yml")
    caddyfile          = file("${path.module}/../compose/Caddyfile")
    realm_json         = file("${path.module}/../compose/keycloak/vprocly-realm.prod.json")
    aws_region         = var.aws_region
    ecr_registry       = local.ecr_registry
    api_image          = "${aws_ecr_repository.api.repository_url}:latest"
    worker_image       = "${aws_ecr_repository.worker.repository_url}:latest"
    excel_image        = "${aws_ecr_repository.excel.repository_url}:latest"
    web_image          = "${aws_ecr_repository.web.repository_url}:latest"
  })
  user_data_replace_on_change = true

  tags = { Name = "vprocly-pilot-app" }

  depends_on = [aws_db_instance.vprocly, aws_ssm_parameter.env]
}

resource "aws_eip" "app" {
  instance = aws_instance.app.id
  domain   = "vpc"
  tags     = { Name = "vprocly-pilot-app" }
}
