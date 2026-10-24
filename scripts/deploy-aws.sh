#!/usr/bin/env bash

set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
AWS_REGION="${AWS_REGION:-ap-south-1}"
DEPLOY_ENV="${DEPLOY_ENV:-prod}"
APP_DOMAIN="${APP_DOMAIN:-vprocly.com}"
PLATFORM="${PLATFORM:-linux/arm64}"
INSTANCE_TAG="${INSTANCE_TAG:-vprocly-pilot-app}"
RDS_INSTANCE_ID="${RDS_INSTANCE_ID:-vprocly-pilot}"
SKIP_CHECKS=false
RELEASE_TAG=""
VALID_SERVICES=(api worker excel web)
SELECTED_SERVICES=()

usage() {
  cat <<'EOF'
Deploy vProcly application images to the existing AWS pilot stack.

Usage:
  pnpm deploy:aws [options]

Options:
  --tag TAG                Use a specific ECR image tag (default: git SHA + timestamp)
  --service SERVICE        Deploy only a specific service; repeat for multiple services.
                           Valid values: api, worker, excel, web
  --services SERVICE[,..]  Deploy only the listed services (comma-separated)
  --skip-checks            Skip local lint and type checks
  -h, --help               Show this help

Environment:
  AWS_PROFILE              Optional AWS CLI profile
  AWS_REGION               AWS region (default: ap-south-1)
  DEPLOY_ENV               SSM environment namespace (default: prod)
  APP_DOMAIN               Public domain (default: vprocly.com)
  PLATFORM                 Docker target platform (default: linux/arm64)
  INSTANCE_TAG             EC2 Name tag (default: vprocly-pilot-app)
  RDS_INSTANCE_ID          RDS identifier snapshotted before API migrations (default: vprocly-pilot)

This script deploys application code only. It never runs terraform apply.
EOF
}

log() {
  printf '\n\033[1;34m==> %s\033[0m\n' "$*"
}

die() {
  printf '\nError: %s\n' "$*" >&2
  exit 1
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || die "Required command not found: $1"
}

normalize_selected_services() {
  local services=()
  local service=""

  if [[ ${#SELECTED_SERVICES[@]} -eq 0 ]]; then
    SELECTED_SERVICES=("${VALID_SERVICES[@]}")
  fi

  for service in "${SELECTED_SERVICES[@]}"; do
    case "$service" in
      api|worker|excel|web)
        if [[ " ${services[*]:-} " != *" $service "* ]]; then
          services+=("$service")
        fi
        ;;
      "")
        ;;
      *)
        die "Unsupported service: $service (valid services: ${VALID_SERVICES[*]})"
        ;;
    esac
  done

  if [[ ${#services[@]} -eq 0 ]]; then
    SELECTED_SERVICES=("${VALID_SERVICES[@]}")
  else
    SELECTED_SERVICES=("${services[@]}")
  fi
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --tag)
      [[ $# -ge 2 ]] || die "--tag requires a value"
      RELEASE_TAG="$2"
      shift 2
      ;;
    --service)
      [[ $# -ge 2 ]] || die "--service requires a value"
      SELECTED_SERVICES+=("$2")
      shift 2
      ;;
    --services)
      [[ $# -ge 2 ]] || die "--services requires a value"
      IFS=',' read -r -a SERVICE_INPUTS <<< "$2"
      for service in "${SERVICE_INPUTS[@]}"; do
        [[ -n "$service" ]] && SELECTED_SERVICES+=("$service")
      done
      shift 2
      ;;
    --skip-checks)
      SKIP_CHECKS=true
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      die "Unknown option: $1 (run with --help)"
      ;;
  esac
done

normalize_selected_services

for command in aws docker jq curl git pnpm python3; do
  require_command "$command"
done

cd "$ROOT_DIR"

if [[ -z "$RELEASE_TAG" ]]; then
  GIT_SHA="$(git rev-parse --short=12 HEAD 2>/dev/null || printf 'manual')"
  RELEASE_TAG="${GIT_SHA}-$(date -u +%Y%m%d%H%M%S)"
fi

[[ "$RELEASE_TAG" =~ ^[A-Za-z0-9_.-]+$ ]] || die "Invalid image tag: $RELEASE_TAG"

if [[ -n "$(git status --porcelain)" ]]; then
  printf 'Warning: the working tree has uncommitted changes; they will be included in this release.\n'
fi

log "Checking local code"
if [[ "$SKIP_CHECKS" == false ]]; then
  pnpm typecheck
  pnpm lint
else
  printf 'Skipped lint and type checks.\n'
fi

log "Checking AWS and the deployment host"
ACCOUNT_ID="$(aws sts get-caller-identity --query Account --output text --region "$AWS_REGION")"
[[ "$ACCOUNT_ID" =~ ^[0-9]{12}$ ]] || die "Could not determine the AWS account ID"

INSTANCE_ID="$(aws ec2 describe-instances \
  --region "$AWS_REGION" \
  --filters \
    "Name=tag:Name,Values=${INSTANCE_TAG}" \
    "Name=instance-state-name,Values=running" \
  --query 'Reservations[].Instances[].InstanceId' \
  --output text)"

[[ -n "$INSTANCE_ID" && "$INSTANCE_ID" != *$'\t'* ]] || die "Expected one running EC2 instance tagged Name=${INSTANCE_TAG}; found: ${INSTANCE_ID:-none}"

SSM_STATUS="$(aws ssm describe-instance-information \
  --region "$AWS_REGION" \
  --filters "Key=InstanceIds,Values=${INSTANCE_ID}" \
  --query 'InstanceInformationList[0].PingStatus' \
  --output text)"
[[ "$SSM_STATUS" == "Online" ]] || die "SSM is not online for ${INSTANCE_ID} (status: ${SSM_STATUS})"

REGISTRY="${ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com"
for repository in "${SELECTED_SERVICES[@]}"; do
  aws ecr describe-repositories \
    --region "$AWS_REGION" \
    --repository-names "vprocly/${repository}" \
    --query 'repositories[0].repositoryUri' \
    --output text >/dev/null
done

log "Logging Docker in to ECR"
aws ecr get-login-password --region "$AWS_REGION" \
  | docker login --username AWS --password-stdin "$REGISTRY"

build_and_push() {
  local service="$1"
  local image="${REGISTRY}/vprocly/${service}"
  shift

  log "Building and pushing ${service}:${RELEASE_TAG}"
  docker buildx build \
    --platform "$PLATFORM" \
    --push \
    --tag "${image}:${RELEASE_TAG}" \
    --tag "${image}:latest" \
    "$@"
}

for service in "${SELECTED_SERVICES[@]}"; do
  case "$service" in
    api)
      build_and_push api \
        --file infra/docker/node-service.Dockerfile \
        --build-arg APP=api \
        .
      ;;
    worker)
      build_and_push worker \
        --file infra/docker/node-service.Dockerfile \
        --build-arg APP=worker \
        .
      ;;
    excel)
      build_and_push excel \
        --file services/excel/Dockerfile \
        services/excel
      ;;
    web)
      build_and_push web \
        --file apps/web/Dockerfile \
        .
      ;;
  esac
done

log "Starting release ${RELEASE_TAG} on ${INSTANCE_ID}"
if [[ " ${SELECTED_SERVICES[*]} " == *" api "* ]]; then
  LOWER_RELEASE_TAG="$(printf '%s' "$RELEASE_TAG" | tr '[:upper:]' '[:lower:]')"
  SNAPSHOT_ID="${RDS_INSTANCE_ID}-pre-${LOWER_RELEASE_TAG}"
  SNAPSHOT_ID="${SNAPSHOT_ID//_/-}"
  SNAPSHOT_ID="${SNAPSHOT_ID:0:63}"
  log "Creating pre-migration database snapshot ${SNAPSHOT_ID}"
  aws rds create-db-snapshot \
    --region "$AWS_REGION" \
    --db-instance-identifier "$RDS_INSTANCE_ID" \
    --db-snapshot-identifier "$SNAPSHOT_ID" >/dev/null
  aws rds wait db-snapshot-available \
    --region "$AWS_REGION" \
    --db-snapshot-identifier "$SNAPSHOT_ID"
fi

SELECTED_SERVICES_LIST="$(printf '%s ' "${SELECTED_SERVICES[@]}")"
SELECTED_SERVICES_LIST="${SELECTED_SERVICES_LIST% }"
CADDYFILE_B64="$(base64 < "${ROOT_DIR}/infra/compose/Caddyfile" | tr -d '\n')"
export REGISTRY RELEASE_TAG AWS_REGION DEPLOY_ENV
REMOTE_SCRIPT="$(python3 - "$SELECTED_SERVICES_LIST" "$REGISTRY" "$RELEASE_TAG" "$AWS_REGION" "$DEPLOY_ENV" "$CADDYFILE_B64" <<'PY'
import sys
selected = sys.argv[1]
registry = sys.argv[2]
release_tag = sys.argv[3]
aws_region = sys.argv[4]
deploy_env = sys.argv[5]
caddyfile_b64 = sys.argv[6]
script = r'''#!/bin/bash
set -Eeuo pipefail

REGISTRY='__REGISTRY__'
RELEASE_TAG='__RELEASE_TAG__'
AWS_REGION='__AWS_REGION__'

cd /opt/vprocly
cp .env .env.pre-deploy
ENV_ACTIVATED=false
CADDY_ACTIVATED=false

send_alert() {
  local summary="$1"
  local env_file=".env.next"
  [[ -f "$env_file" ]] || env_file=".env"
  local webhook
  webhook="$(grep '^OPS_ALERT_WEBHOOK_URL=' "$env_file" 2>/dev/null | tail -n 1 | cut -d= -f2- || true)"
  [[ -n "$webhook" ]] || return 0
  curl --silent --show-error --max-time 5 \
    --header 'content-type: application/json' \
    --data "$(jq -cn --arg summary "$summary" --arg release "__RELEASE_TAG__" '{service:"vprocly-deploy",severity:"error",summary:$summary,releaseVersion:$release}')" \
    "$webhook" >/dev/null || true
}

rollback() {
  trap - ERR
  set +e
  if [[ "$ENV_ACTIVATED" != true || ! -f .env.pre-deploy ]]; then
    echo "Deployment failed before activation; the current release is unchanged."
    send_alert "Deployment failed before activation"
    return
  fi
  echo "Deployment failed; restoring the previous image set."
  cp .env.pre-deploy .env
  if [[ "$CADDY_ACTIVATED" == true && -f Caddyfile.pre-deploy ]]; then
    cp Caddyfile.pre-deploy Caddyfile
    docker compose -f docker-compose.prod.yml exec -T caddy caddy reload --config /etc/caddy/Caddyfile || true
  fi
  docker compose -f docker-compose.prod.yml pull || true
  docker compose -f docker-compose.prod.yml up -d --remove-orphans || true
  send_alert "Deployment failed and the previous release was restored"
}
trap rollback ERR

aws ssm get-parameters-by-path \
  --path /vprocly/__DEPLOY_ENV__/env \
  --recursive \
  --with-decryption \
  --region "${AWS_REGION}" \
  --output json \
  | jq -r '.Parameters[] | (.Name | split("/") | last) as $key | select($key | IN("API_IMAGE","WORKER_IMAGE","EXCEL_IMAGE","WEB_IMAGE") | not) | "\($key)=\(.Value)"' > .env.next
printf 'RELEASE_VERSION=__RELEASE_TAG__\n' >> .env.next

SELECTED_SERVICES=( __SELECTED__ )
for image_key in API_IMAGE WORKER_IMAGE EXCEL_IMAGE WEB_IMAGE; do
  case "$image_key" in
    API_IMAGE) image_service=api ;;
    WORKER_IMAGE) image_service=worker ;;
    EXCEL_IMAGE) image_service=excel ;;
    WEB_IMAGE) image_service=web ;;
  esac
  if [[ " ${SELECTED_SERVICES[*]} " == *" ${image_service} "* ]]; then
    continue
  fi
  previous_value="$(grep "^${image_key}=" .env 2>/dev/null | tail -n 1 || true)"
  if [[ -n "$previous_value" ]]; then
    printf '%s\n' "$previous_value" >> .env.next
  fi
done
for service in "${SELECTED_SERVICES[@]}"; do
  case "$service" in
    api)
      printf 'API_IMAGE=__REGISTRY__/vprocly/api:__RELEASE_TAG__\n' >> .env.next
      ;;
    worker)
      printf 'WORKER_IMAGE=__REGISTRY__/vprocly/worker:__RELEASE_TAG__\n' >> .env.next
      ;;
    excel)
      printf 'EXCEL_IMAGE=__REGISTRY__/vprocly/excel:__RELEASE_TAG__\n' >> .env.next
      ;;
    web)
      printf 'WEB_IMAGE=__REGISTRY__/vprocly/web:__RELEASE_TAG__\n' >> .env.next
      ;;
  esac
done

for required_key in DATABASE_URL RDS_ENDPOINT KC_DB_PASSWORD KC_VPROCLY_WEB_SECRET KC_VPROCLY_ADMIN_API_SECRET KC_BOOTSTRAP_ADMIN_PASSWORD API_IMAGE WORKER_IMAGE EXCEL_IMAGE WEB_IMAGE; do
  if ! grep -q "^${required_key}=." .env.next; then
    echo "Missing required deployment env var: ${required_key}" >&2
    exit 1
  fi
done

cp .env .env.pre-deploy
mv .env.next .env
chmod 600 .env
ENV_ACTIVATED=true

if [[ " ${SELECTED_SERVICES[*]} " == *" web "* ]]; then
  echo '__CADDYFILE_B64__' | base64 -d > Caddyfile.next
  docker run --rm -v "$PWD/Caddyfile.next:/etc/caddy/Caddyfile:ro" caddy:2-alpine \
    caddy validate --config /etc/caddy/Caddyfile
  if ! cmp -s Caddyfile.next Caddyfile; then
    cp Caddyfile Caddyfile.pre-deploy
    mv Caddyfile.next Caddyfile
    CADDY_ACTIVATED=true
  else
    rm -f Caddyfile.next
  fi
fi

aws ecr get-login-password --region "${AWS_REGION}" \
  | docker login --username AWS --password-stdin "${REGISTRY}"

docker compose -f docker-compose.prod.yml pull "${SELECTED_SERVICES[@]}"

if [[ " ${SELECTED_SERVICES[*]} " == *" api "* ]]; then
  echo "Applying database migrations."
  docker compose -f docker-compose.prod.yml run --rm --no-deps -T api \
    node node_modules/@vprocly/db/dist/migrate.js
fi

docker compose -f docker-compose.prod.yml up -d --remove-orphans "${SELECTED_SERVICES[@]}"

if [[ "$CADDY_ACTIVATED" == true ]]; then
  docker compose -f docker-compose.prod.yml exec -T caddy caddy reload --config /etc/caddy/Caddyfile
fi

sleep 5
for service in "${SELECTED_SERVICES[@]}"; do
  if ! docker compose -f docker-compose.prod.yml ps --status running --services | grep -qx "$service"; then
    echo "${service} did not remain running after startup." >&2
    docker compose -f docker-compose.prod.yml logs --tail=100 "$service" >&2 || true
    exit 1
  fi
done

if [[ " ${SELECTED_SERVICES[*]} " == *" api "* ]]; then
  echo "Waiting for API readiness."
  for attempt in $(seq 1 36); do
    if docker compose -f docker-compose.prod.yml exec -T api \
      node -e 'fetch("http://127.0.0.1:4000/health/ready").then(r => { if (!r.ok) throw new Error(String(r.status)); })'; then
      break
    fi
    if [[ "$attempt" == 36 ]]; then
      echo "API did not become ready in time." >&2
      exit 1
    fi
    sleep 5
  done
fi

docker compose -f docker-compose.prod.yml ps
docker image prune -f
trap - ERR
rm -f .env.pre-deploy Caddyfile.pre-deploy
echo "Release ${RELEASE_TAG} deployed successfully."
'''
script = script.replace('__SELECTED__', selected)
script = script.replace('__REGISTRY__', registry)
script = script.replace('__RELEASE_TAG__', release_tag)
script = script.replace('__AWS_REGION__', aws_region)
script = script.replace('__DEPLOY_ENV__', deploy_env)
script = script.replace('__CADDYFILE_B64__', caddyfile_b64)
print(script)
PY
)"
ENCODED_SCRIPT="$(printf '%s' "$REMOTE_SCRIPT" | base64 | tr -d '\n')"
REMOTE_COMMAND="$(printf 'script=/tmp/vprocly-deploy-%s.sh; echo %s | base64 -d > \"$script\"; chmod 700 \"$script\"; bash \"$script\"; status=$?; rm -f \"$script\"; exit $status' "$RELEASE_TAG" "$ENCODED_SCRIPT")"
COMMAND_PARAMETERS="$(jq -cn --arg command "$REMOTE_COMMAND" '{commands: [$command]}')"

COMMAND_ID="$(aws ssm send-command \
  --region "$AWS_REGION" \
  --instance-ids "$INSTANCE_ID" \
  --document-name AWS-RunShellScript \
  --comment "Deploy vProcly ${RELEASE_TAG}" \
  --parameters "$COMMAND_PARAMETERS" \
  --query 'Command.CommandId' \
  --output text)"

REMOTE_STATUS="Pending"
for attempt in $(seq 1 240); do
  REMOTE_STATUS="$(aws ssm get-command-invocation \
    --region "$AWS_REGION" \
    --command-id "$COMMAND_ID" \
    --instance-id "$INSTANCE_ID" \
    --query Status \
    --output text 2>/dev/null || printf 'Pending')"
  case "$REMOTE_STATUS" in
    Pending|InProgress|Delayed)
      sleep 5
      ;;
    *)
      break
      ;;
  esac
done

INVOCATION="$(aws ssm get-command-invocation \
  --region "$AWS_REGION" \
  --command-id "$COMMAND_ID" \
  --instance-id "$INSTANCE_ID")"
printf '%s\n' "$INVOCATION" | jq -r '.StandardOutputContent, .StandardErrorContent | select(length > 0)'
REMOTE_STATUS="$(printf '%s\n' "$INVOCATION" | jq -r '.Status')"

if [[ "$REMOTE_STATUS" != "Success" ]]; then
  die "Remote deployment failed with status ${REMOTE_STATUS}. Command ID: ${COMMAND_ID}"
fi

check_url() {
  local label="$1"
  local url="$2"
  local expected="$3"

  for attempt in $(seq 1 12); do
    status="$(curl --silent --show-error --location --output /dev/null --write-out '%{http_code}' "$url" || true)"
    if [[ "$status" =~ $expected ]]; then
      printf '%-10s %s (%s)\n' "$label" "$url" "$status"
      return 0
    fi
    sleep 5
  done
  die "${label} health check failed: ${url} returned ${status:-no response}"
}

log "Release complete"
printf 'Release:  %s\n' "$RELEASE_TAG"
printf 'Instance: %s\n' "$INSTANCE_ID"
printf 'Services: %s\n' "${SELECTED_SERVICES[*]}"

if [[ " ${SELECTED_SERVICES[*]} " == *" web "* ]]; then
  check_url Web "https://${APP_DOMAIN}/" '^(200|30[1278])$'
  check_url Operations "https://operations.${APP_DOMAIN}/" '^(200|30[1278])$'
fi
if [[ " ${SELECTED_SERVICES[*]} " == *" api "* ]]; then
  check_url API "https://api.${APP_DOMAIN}/health/ready" '^200$'
fi
if [[ " ${SELECTED_SERVICES[*]} " == *" web "* ]] || [[ " ${SELECTED_SERVICES[*]} " == *" api "* ]]; then
  printf 'Web:      https://%s\n' "$APP_DOMAIN"
fi

"${ROOT_DIR}/scripts/smoke-aws.sh" "https://${APP_DOMAIN}" "https://api.${APP_DOMAIN}"

if [[ " ${SELECTED_SERVICES[*]} " == *" api "* ]]; then
  check_url Auth "https://auth.${APP_DOMAIN}/realms/vprocly/.well-known/openid-configuration" '^200$'
fi
