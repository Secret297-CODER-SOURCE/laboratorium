#!/bin/sh
# Inject Coolify/env secrets into coturn config, then exec turnserver.
set -eu

SECRET="${TURN_SECRET:-}"
EXTERNAL_IP="${TURN_EXTERNAL_IP:-}"
REALM="${TURN_REALM:-turn.laboratorium.club}"
TEMPLATE="${TURN_CONFIG_TEMPLATE:-/etc/coturn/turnserver.conf.template}"
OUT="${TURN_CONFIG_OUT:-/tmp/turnserver.conf}"

if [ -z "$SECRET" ]; then
  echo "[coturn] TURN_SECRET is required" >&2
  exit 1
fi
if [ -z "$EXTERNAL_IP" ]; then
  echo "[coturn] TURN_EXTERNAL_IP is required (public VPS IP, e.g. 176.37.168.47)" >&2
  exit 1
fi
if [ ! -f "$TEMPLATE" ]; then
  echo "[coturn] missing template: $TEMPLATE" >&2
  exit 1
fi

# Escape sed replacement metacharacters in secret / IP / realm
esc() {
  printf '%s' "$1" | sed -e 's/[&|\\]/\\&/g'
}

sed \
  -e "s|__TURN_SECRET__|$(esc "$SECRET")|g" \
  -e "s|__TURN_EXTERNAL_IP__|$(esc "$EXTERNAL_IP")|g" \
  -e "s|__TURN_REALM__|$(esc "$REALM")|g" \
  "$TEMPLATE" > "$OUT"

echo "[coturn] starting realm=$REALM external-ip=$EXTERNAL_IP listening=3478 (UDP/TCP)"
exec turnserver -c "$OUT" --log-file=stdout --simple-log
