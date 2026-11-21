# Coolify: set Base Directory = deploy/coturn
# Env (Runtime): TURN_SECRET, TURN_EXTERNAL_IP, TURN_REALM
# Ports: 3478/tcp 3478/udp 49152-49200/udp  (no HTTP domain / no Traefik)
FROM coturn/coturn:4.6

USER root
COPY turnserver.conf /etc/coturn/turnserver.conf.template
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

ENV TURN_REALM=turn.laboratorium.club \
    TURN_CONFIG_TEMPLATE=/etc/coturn/turnserver.conf.template \
    TURN_CONFIG_OUT=/tmp/turnserver.conf

EXPOSE 3478/tcp 3478/udp 49152-49200/udp

ENTRYPOINT ["/entrypoint.sh"]
