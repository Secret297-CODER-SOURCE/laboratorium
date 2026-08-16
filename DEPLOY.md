# laboratorium. — деплой на сервер (Docker)

Увесь production працює в Docker: **app** + **nginx** (TLS, WebSocket). Окремий nginx на хості не потрібен.

## Вимоги на сервері

- Linux з Docker Engine 24+ і Docker Compose v2
- Порти **80** і **443** вільні (або змініть `NGINX_HTTP_PORT` / `NGINX_HTTPS_PORT` у `.env`)
- Домен, напр. `laboratorium.club`, A-запис → IP сервера
- Для CTF-лабораторій (опційно): Docker на хості + образ `laboratorium/ctf-lab:latest`

## 1. Клонування та `.env`

```bash
git clone <repo-url> /opt/laboratorium
cd /opt/laboratorium
cp .env.example .env
nano .env
```

### Обов'язково змінити в production

| Змінна | Приклад | Навіщо |
|--------|---------|--------|
| `JWT_SECRET` | довгий випадковий рядок ≥32 символів | підпис JWT |
| `DOMAIN` | `laboratorium.club` | nginx + Let's Encrypt |
| `APP_URL` | `https://laboratorium.club` | посилання в листах, reset password |
| `SITE_URL` | `https://laboratorium.club` | QR-код, публічні URL |
| `CORS_ORIGIN` | `https://laboratorium.club` | WebSocket + API (не `*` у prod) |
| `CERTBOT_EMAIL` | `admin@laboratorium.club` | автоматичний HTTPS |
| `SEED_DATABASE` | `false` | після першого запуску — не перезаписувати демо-дані |
| `OWNER_PASSWORD` | сильний пароль | акаунт власника |
| `LAB_TUNNEL_GATEWAY_IP` | публічний IP сервера | sslip.io тунелі для учнів |
| `LAB_PUBLIC_SCHEME` | `https` | публічні посилання на лаби |

Повний список — у `.env.example`.

## 2. Запуск (одна команда)

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

Або з перевірками, SSL і CTF-образом:

```bash
chmod +x scripts/deploy.sh
./scripts/deploy.sh
# npm run deploy
```

Перший запуск без сертифіката: сайт доступний по **HTTP** на порту 80.  
Якщо в `.env` задано `CERTBOT_EMAIL`, `deploy.sh` отримає Let's Encrypt і перезапустить nginx з HTTPS.

Перевірка:

```bash
curl -s http://localhost/api/health
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml logs -f app nginx
```

## 3. Архітектура контейнерів

```
Internet :80 / :443
        │
   ┌────▼────┐
   │  nginx  │  TLS, gzip, WebSocket / Socket.IO
   └────┬────┘
        │ app:3000 (internal network)
   ┌────▼────┐
   │   app   │  Node.js + SQLite + uploads
   └─────────┘
        │
   volume lab-data  →  /app/data (БД, recordings, chat)
   volume certbot-* →  Let's Encrypt certs
```

| Контейнер | Роль |
|-----------|------|
| `laboratorium-app` | Node.js API, Socket.IO, статика |
| `laboratorium-nginx` | Reverse proxy, HTTPS |
| `laboratorium-certbot` | Авто-оновлення сертифікатів (profile `ssl-renew`) |

Конфіг nginx: `deploy/nginx/` (збирається в образ `laboratorium/nginx`).

## 4. HTTPS та оновлення сертифікатів

Отримати сертифікат вручну (якщо не використовували `deploy.sh`):

```bash
docker compose -f docker-compose.prod.yml --profile tools run --rm certbot-cli \
  certonly --webroot -w /var/www/certbot \
  -d laboratorium.club -d www.laboratorium.club \
  --email admin@laboratorium.club --agree-tos --no-eff-email

docker compose -f docker-compose.prod.yml up -d --force-recreate nginx
```

Авто-оновлення (cron раз на добу або постійний контейнер):

```bash
docker compose -f docker-compose.prod.yml --profile ssl-renew up -d certbot
```

## 5. CTF-образ (якщо потрібен)

```bash
npm run ctf:build
# або
docker build -t laboratorium/ctf-lab:latest challenges/ctf-lab
```

У `.env`:

```env
LAB_USE_LOCAL_DOCKER=true
CTF_DOCKER_IMAGE=laboratorium/ctf-lab:latest
```

У `docker-compose.prod.yml` розкоментуйте монтування сокета в сервісі `app`:

```yaml
volumes:
  - /var/run/docker.sock:/var/run/docker.sock
```

> **Увага:** доступ до docker.sock дає root-подібні права всередині контейнера. Використовуйте лише на довіреному сервері.

## 6. Дані та бекапи

Усе персистентне зберігається у Docker volume `lab-data`:

- SQLite: `/app/data/laboratorium.db`
- Завантаження: `/app/data/uploads/` (записи, чат)

Бекап:

```bash
docker run --rm \
  -v laboratorium_lab-data:/data \
  -v "$(pwd)":/backup \
  alpine tar czf "/backup/lab-data-$(date +%F).tar.gz" -C /data .
```

## 7. Оновлення версії

```bash
git pull
export STATIC_VERSION=$(date +%Y%m%d%H%M)   # або номер релізу
docker compose -f docker-compose.prod.yml up -d --build
```

## 8. Типові проблеми

| Симптом | Рішення |
|---------|---------|
| 502 Bad Gateway | `docker compose ps`, перевірте healthcheck app |
| WebSocket / конференції | nginx у Docker вже налаштований (`Upgrade` headers) |
| CORS помилки | `CORS_ORIGIN=https://ваш-домен` |
| Mixed content | `APP_URL` і `SITE_URL` — `https://` |
| Немає HTTPS | задайте `CERTBOT_EMAIL`, запустіть `./scripts/deploy.sh` |
| Старі CSS | змініть `STATIC_VERSION`, hard refresh |
| CTF не стартує | `LAB_USE_LOCAL_DOCKER=true` + docker.sock у compose |

## Команди npm

```bash
npm run docker:prod:up      # production up --build
npm run docker:prod:build   # production build
npm run docker:prod:down    # зупинка
npm run deploy              # scripts/deploy.sh (SSL + перевірки)
npm run ctf:build           # образ CTF-лабораторії
```

## Локальний Docker (dev)

```bash
cp .env.example .env
docker compose up -d --build
# http://localhost:3000  (без nginx, напряму app:3000)
```
