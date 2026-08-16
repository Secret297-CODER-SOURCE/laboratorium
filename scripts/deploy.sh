#!/usr/bin/env bash
# Docker-only production deploy for laboratorium.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

COMPOSE_FILE="docker-compose.prod.yml"
ENV_FILE=".env"

echo "==> laboratorium deploy (Docker)"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "ERROR: $ENV_FILE not found. Copy from .env.example and configure production values."
  echo "  cp .env.example .env && nano .env"
  exit 1
fi

# shellcheck disable=SC1090
source "$ENV_FILE" 2>/dev/null || true

if [[ "${JWT_SECRET:-}" == "your-super-secret-jwt-key-min-32-chars" ]] \
  || [[ "${JWT_SECRET:-}" == "change-me-in-production" ]] \
  || [[ ${#JWT_SECRET} -lt 24 ]]; then
  echo "ERROR: Set a strong JWT_SECRET in .env before production deploy."
  exit 1
fi

if [[ -z "${APP_URL:-}" || -z "${SITE_URL:-}" ]]; then
  echo "ERROR: Set APP_URL and SITE_URL in .env (https://your-domain)."
  exit 1
fi

DOMAIN="${DOMAIN:-laboratorium.club}"
WWW_DOMAIN="${WWW_DOMAIN:-www.${DOMAIN}}"
CERTBOT_EMAIL="${CERTBOT_EMAIL:-}"
NGINX_HTTP_PORT="${NGINX_HTTP_PORT:-80}"
NGINX_HTTPS_PORT="${NGINX_HTTPS_PORT:-443}"

export STATIC_VERSION="${STATIC_VERSION:-$(date +%Y%m%d%H%M)}"
export DOMAIN WWW_DOMAIN
echo "==> STATIC_VERSION=$STATIC_VERSION"
echo "==> DOMAIN=$DOMAIN"

echo "==> Building and starting stack (no cache for app image)..."
docker compose -f "$COMPOSE_FILE" build --pull app nginx
docker compose -f "$COMPOSE_FILE" up -d

if grep -qE '^LAB_USE_LOCAL_DOCKER=(true|1|yes)' "$ENV_FILE" 2>/dev/null; then
  echo "==> Building CTF image (LAB_USE_LOCAL_DOCKER=true)..."
  docker build -t "${CTF_DOCKER_IMAGE:-laboratorium/ctf-lab:latest}" challenges/ctf-lab
fi

if [[ -n "$CERTBOT_EMAIL" ]]; then
  if ! docker compose -f "$COMPOSE_FILE" exec -T nginx \
    test -f "/etc/letsencrypt/live/${DOMAIN}/fullchain.pem" 2>/dev/null; then
    echo "==> Obtaining Let's Encrypt certificate for ${DOMAIN}..."
    docker compose -f "$COMPOSE_FILE" --profile tools run --rm certbot-cli \
      certonly --webroot -w /var/www/certbot \
      -d "$DOMAIN" -d "$WWW_DOMAIN" \
      --email "$CERTBOT_EMAIL" --agree-tos --no-eff-email
    echo "==> Reloading nginx with HTTPS..."
    docker compose -f "$COMPOSE_FILE" up -d --force-recreate nginx
  else
    echo "==> SSL certificate already present for ${DOMAIN}"
  fi
else
  echo "==> CERTBOT_EMAIL not set — running HTTP only on port ${NGINX_HTTP_PORT}"
  echo "    Set CERTBOT_EMAIL in .env and re-run deploy for HTTPS."
fi

HEALTH_URL="http://127.0.0.1:${NGINX_HTTP_PORT}/api/health"
if docker compose -f "$COMPOSE_FILE" exec -T nginx \
  test -f "/etc/letsencrypt/live/${DOMAIN}/fullchain.pem" 2>/dev/null; then
  HEALTH_URL="https://127.0.0.1:${NGINX_HTTPS_PORT}/api/health"
fi

echo "==> Waiting for healthcheck..."
for _ in $(seq 1 30); do
  if curl -sfk "$HEALTH_URL" >/dev/null 2>&1; then
    echo "==> OK: /api/health"
    curl -sfk "$HEALTH_URL"
    echo ""
    docker compose -f "$COMPOSE_FILE" ps
    echo ""
    echo "Deploy complete."
    echo "  Site: ${APP_URL:-https://${DOMAIN}}"
    echo "  Logs: docker compose -f ${COMPOSE_FILE} logs -f"
  exit 0
  fi
  sleep 2
done

echo "ERROR: Health check failed. Logs:"
docker compose -f "$COMPOSE_FILE" logs --tail=80 app nginx
exit 1
