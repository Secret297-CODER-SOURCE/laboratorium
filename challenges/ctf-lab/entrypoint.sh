#!/bin/sh
set -e

if [ "$CTF_SLUG" = "nmap-scan" ] || [ "$CTF_SLUG" = "python-port-scanner" ]; then
  node /app/elite-service.js &
fi

if [ "$CTF_SLUG" = "priv-esc-linux" ]; then
  echo "$CTF_FLAG" > /root/flag.txt
  chmod 600 /root/flag.txt
  ssh-keygen -A
  echo "lab:${LAB_SSH_PASSWORD:-labpass}" | chpasswd
  /usr/sbin/sshd
fi

exec node /app/server.js
