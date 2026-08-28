#!/bin/sh
# Runs as root briefly (only this script) so it can grant the unprivileged
# `lab` user access to a mounted /var/run/docker.sock, whose group ownership
# is host-specific and unknown at image build time. The actual app process
# is always started as `lab` via su-exec — this never runs application code
# as root.
set -e

if [ -S /var/run/docker.sock ]; then
  SOCK_GID=$(stat -c '%g' /var/run/docker.sock)
  SOCK_GROUP=$(awk -F: -v gid="$SOCK_GID" '$3==gid{print $1; exit}' /etc/group)
  if [ -z "$SOCK_GROUP" ]; then
    addgroup -g "$SOCK_GID" dockerhost
    SOCK_GROUP=dockerhost
  fi
  addgroup lab "$SOCK_GROUP" 2>/dev/null || true
fi

# su-exec only changes uid/gid — it does not reset env vars the way `su -`
# or `docker exec -u` do. Without this, HOME stays /root (inherited from this
# root-run entrypoint), and the Docker CLI's config/buildx bootstrap under
# $HOME/.docker hangs when `lab` can't write there.
export HOME=/home/lab
export USER=lab

exec su-exec lab "$@"
