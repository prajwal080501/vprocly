#!/bin/bash
set -euo pipefail
exec > /var/log/vprocly-bootstrap.log 2>&1

dnf install -y docker
systemctl enable --now docker
curl -SL https://github.com/docker/compose/releases/download/v2.29.7/docker-compose-linux-aarch64 -o /usr/libexec/docker/cli-plugins/docker-compose
chmod +x /usr/libexec/docker/cli-plugins/docker-compose

mkdir -p /opt/vprocly/keycloak
cd /opt/vprocly

cat > docker-compose.prod.yml <<'COMPOSE_EOF'
${docker_compose_yml}
COMPOSE_EOF

cat > Caddyfile <<'CADDY_EOF'
${caddyfile}
CADDY_EOF

cat > keycloak/vprocly-realm.prod.json <<'REALM_EOF'
${realm_json}
REALM_EOF

# Pull every /vprocly/prod/env/* SSM parameter into one .env file for the api/worker containers.
aws ssm get-parameters-by-path \
  --path /vprocly/prod/env --recursive --with-decryption \
  --region ${aws_region} --output json \
  | python3 -c "
import json, sys
params = json.load(sys.stdin)['Parameters']
with open('.env', 'w') as f:
    for p in params:
        key = p['Name'].rsplit('/', 1)[-1]
        f.write(f'{key}={p[\"Value\"]}\n')
"

aws ecr get-login-password --region ${aws_region} | docker login --username AWS --password-stdin ${ecr_registry}

cat >> .env <<ENV_EOF
API_IMAGE=${api_image}
WORKER_IMAGE=${worker_image}
EXCEL_IMAGE=${excel_image}
WEB_IMAGE=${web_image}
ENV_EOF

docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d

echo "vprocly pilot bootstrap complete" >> /var/log/vprocly-bootstrap.log
