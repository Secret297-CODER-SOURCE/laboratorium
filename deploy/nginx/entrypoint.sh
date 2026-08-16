#!/bin/sh
set -eu

DOMAIN="${DOMAIN:-laboratorium.club}"
export DOMAIN
export WWW_DOMAIN="${WWW_DOMAIN:-www.${DOMAIN}}"

mkdir -p /etc/nginx/conf.d

if [ -f "/etc/letsencrypt/live/${DOMAIN}/fullchain.pem" ]; then
  envsubst '${DOMAIN} ${WWW_DOMAIN}' < /etc/nginx/templates/http-ssl-redirect.conf.template \
    > /etc/nginx/conf.d/10-http.conf
  envsubst '${DOMAIN} ${WWW_DOMAIN}' < /etc/nginx/templates/https.conf.template \
    > /etc/nginx/conf.d/20-https.conf
else
  envsubst '${DOMAIN} ${WWW_DOMAIN}' < /etc/nginx/templates/http-proxy.conf.template \
    > /etc/nginx/conf.d/10-http.conf
fi

exec "$@"
