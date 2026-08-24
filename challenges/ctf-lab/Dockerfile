FROM node:20-alpine
RUN apk add --no-cache gcc musl-dev openssh
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY server.js elite-service.js entrypoint.sh ./
COPY suid-backup.c ./
RUN gcc -O2 -o /usr/local/bin/backup suid-backup.c \
  && chown root:root /usr/local/bin/backup \
  && chmod u+s /usr/local/bin/backup \
  && rm suid-backup.c
RUN adduser -D -s /bin/sh lab \
  && mkdir -p /home/lab \
  && chmod +x entrypoint.sh
ENV PORT=80
EXPOSE 80 22 31337
CMD ["./entrypoint.sh"]
