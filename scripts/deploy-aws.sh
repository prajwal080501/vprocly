#!/usr/bin/env bash

set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
AWS_REGION="${AWS_REGION:-ap-south-1}"
APP_DOMAIN="${APP_DOMAIN:-vprocly.com}"
PLATFORM="${PLATFORM:-linux/arm64}"
INSTANCE_TAG="${INSTANCE_TAG:-vprocly-pilot-app}"
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
  APP_DOMAIN               Public domain (default: vprocly.com)
  PLATFORM                 Docker target platform (default: linux/arm64)
  INSTANCE_TAG             EC2 Name tag (default: vprocly-pilot-app)

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

for command in aws docker jq curl git pnpm; do
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
SELECTED_SERVICES_LIST="$(printf '%s ' "${SELECTED_SERVICES[@]}")"
SELECTED_SERVICES_LIST="${SELECTED_SERVICES_LIST% }"
export REGISTRY RELEASE_TAG AWS_REGION
REMOTE_SCRIPT="$(REGISTRY="$REGISTRY" RELEASE_TAG="$RELEASE_TAG" AWS_REGION="$AWS_REGION" python3 - "$SELECTED_SERVICES_LIST" <<'PY'
import os, sys
selected = sys.argv[1].strip()
registry = os.environ['REGISTRY']
release_tag = os.environ['RELEASE_TAG']
aws_region = os.environ['AWS_REGION']
script = f'''#!/bin/bash
set -Eeuo pipefail

cd /opt/vprocly
cp .env .env.pre-deploy

rollback() {{
  trap - ERR
  set +e
  echo "Deployment failed; restoring the previous image set."
  cp .env.pre-deploy .env
  docker compose -f docker-compose.prod.yml pull
  docker compose -f docker-compose.prod.yml up -d --remove-orphans
}}
trap rollback ERR

aws ssm get-parameters-by-path \
  --path /vprocly/prod/env \
  --recursive \
  --with-decryption \
  --region {aws_region} \
  --output json \
  | python3 -c 'import json, sys
params = json.load(sys.stdin)["Parameters"]
with open(".env.next", "w") as env_file:
    for param in params:
        key = param["Name"].rsplit("/", 1)[-1]
        env_file.write("{{}}={{}}\\n".format(key, param["Value"]))'

SELECTED_SERVICES=( {selected} )
for service in "${{SELECTED_SERVICES[@]}}"; do
  case "$service" in
    api)
      printf 'API_IMAGE={registry}/vprocly/api:{release_tag}\\n' >> .env.next
      ;;
    worker)
      printf 'WORKER_IMAGE={registry}/vprocly/worker:{release_tag}\\n' >> .env.next
      ;;
    excel)
      printf 'EXCEL_IMAGE={registry}/vprocly/excel:{release_tag}\\n' >> .env.next
      ;;
    web)
      printf 'WEB_IMAGE={registry}/vprocly/web:{release_tag}\\n' >> .env.next
      ;;
  esac
done
mv .env.next .env
chmod 600 .env

aws ecr get-login-password --region {aws_region} \
  | docker login --username AWS --password-stdin {registry}

if [[ " {selected} " == *" api "* ]]; then
  docker compose -f docker-compose.prod.yml pull api
else
  docker compose -f docker-compose.prod.yml pull
fi

if [[ " {selected} " == *" api "* ]]; then
  echo "Applying database migrations."
  docker compose -f docker-compose.prod.yml run --rm --no-deps -T api \
    node node_modules/@vprocly/db/dist/migrate.js
fi

if [[ " {selected} " == *" api "* ]]; then
  docker compose -f docker-compose.prod.yml up -d --remove-orphans api
else
  docker compose -f docker-compose.prod.yml up -d --remove-orphans {selected}
fi

if [[ " {selected} " == *" api "* ]]; then
  echo "Waiting for API readiness."
  for attempt in $(seq 1 36); do
    if docker compose -f docker-compose.prod.yml exec -T api \
      node -e 'fetch("http://127.0.0.1:4000/health/ready").then(r => {{ if (!r.ok) throw new Error(String(r.status)); }})'; then
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
rm -f .env.pre-deploy
echo "Release {release_tag} deployed successfully."
'''
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
fi
if [[ " ${SELECTED_SERVICES[*]} " == *" api "* ]]; then
  check_url API "https://api.${APP_DOMAIN}/health/ready" '^200$'
fi
if [[ " ${SELECTED_SERVICES[*]} " == *" web "* ]] || [[ " ${SELECTED_SERVICES[*]} " == *" api "* ]]; then
  printf 'Web:      https://%s\n' "$APP_DOMAIN"
fi

if [[ " ${SELECTED_SERVICES[*]} " == *" api "* ]]; then
  check_url Auth "https://auth.${APP_DOMAIN}/realms/vprocly/.well-known/openid-configuration" '^200$'
fi
