# laboratorium.

Сайт школи IT та кібербезпеки з бекендом, особистим кабінетом, відеоконференціями та Docker.

## Швидкий старт (Docker)

```bash
cp .env.example .env   # відредагуйте JWT_SECRET
docker compose up -d --build
```

Сайт: **http://localhost:3000**

**Production на сервері:** див. [DEPLOY.md](./DEPLOY.md) — Docker (app + nginx + HTTPS), `.env`, CTF-образ.

### Вхід власника

При кожному запуску сервера створюється акаунт власника з повним доступом до адмін-панелі (`/admin.html`):

| | |
|---|---|
| **Email (логін)** | `maks.47.turbo@gmail.com` |
| **Пароль** | `LaboratoriumOwner2026` |

Змінити можна через змінні `OWNER_EMAIL` та `OWNER_PASSWORD` у `.env`.

**Можливості власника:** керування напрямками та програмами, зміна ролей, створення акаунтів після оплати, надсилання пароля на email.

Реєстрація на сайті **закрита** — доступ видається вручну через адмінку після оплати.

Для email (скидання пароля, надсилання доступу) налаштуйте `SMTP_*` у `.env`. Без SMTP у dev-режимі листи виводяться в консоль сервера.

```bash
docker compose logs -f app   # логи
docker compose down          # зупинка
```

## Локальна розробка

```bash
cp .env.example .env
npm install
npm run dev
```

Після оплати власник створює акаунт у `/admin.html` → вкладка **Користувачі**.

---

## Архітектура бекенду

```
server/
├── index.js              # Точка входа, graceful shutdown
├── app.js                # Express-приложение
├── config/               # Конфигурация из .env
├── db/
│   ├── index.js          # SQLite + WAL
│   ├── schema.js         # Схема БД + индексы
│   └── seed.js           # Демо-данные
├── middleware/
│   ├── auth.js           # JWT
│   ├── errorHandler.js   # Централизованные ошибки
│   └── logger.js         # Логирование запросов
├── services/             # Бизнес-логика
│   ├── user.service.js
│   ├── program.service.js
│   ├── challenge.service.js
│   ├── bounty.service.js
│   └── application.service.js
├── controllers/          # HTTP-обработчики
├── routes/               # Маршруты
└── utils/                # Ошибки, валидация, tier
```

### Принципы

- **Слои**: routes → controllers → services → db
- **Ошибки**: типизированные `AppError` с кодами
- **Безопасность**: helmet, rate-limit, bcrypt, JWT
- **Конфиг**: всё через `.env`
- **БД**: SQLite с WAL, volume в Docker для персистентности
- **Healthcheck**: `GET /api/health` с метриками

## API

| Метод | Путь | Auth | Описание |
|-------|------|------|----------|
| GET | `/api/health` | — | Health + статистика БД |
| POST | `/api/auth/register` | — | Регистрация |
| POST | `/api/auth/login` | — | Вход |
| GET | `/api/auth/me` | ✓ | Текущий пользователь |
| GET | `/api/programs` | — | Программы |
| GET | `/api/leaderboard` | — | Рейтинг |
| POST | `/api/applications` | opt | Заявка |
| GET | `/api/dashboard` | ✓ | Личный кабинет |
| POST | `/api/enroll` | ✓ | Запись на программу |
| POST | `/api/challenges/:id/complete` | ✓ | Сдать challenge |
| PATCH | `/api/profile` | ✓ | Профиль |
| PATCH | `/api/enrollments/:id/progress` | ✓ | Прогресс |

## Переменные окружения

| Переменная | По умолчанию | Описание |
|------------|--------------|----------|
| `PORT` | `3000` | Порт сервера |
| `JWT_SECRET` | — | Секрет JWT (обязательно в prod) |
| `DATABASE_PATH` | `./data/laboratorium.db` | Путь к SQLite |
| `SEED_DATABASE` | `true` | Заповнити програмами та challenges |
| `CORS_ORIGIN` | `*` | Разрешённые origin |
| `RATE_LIMIT_MAX` | `100` | Лимит запросов / 15 мин |
| `AUTH_RATE_LIMIT_MAX` | `20` | Лимит на auth / 15 мин |

## Docker

- **Multi-stage build** — компиляция `better-sqlite3` в builder
- **Non-root user** `lab` (uid 1001)
- **Volume** `lab-data` для SQLite та uploads
- **Healthcheck** `GET /api/health`
- **Production:** `docker-compose.prod.yml` — app + nginx у Docker, [DEPLOY.md](./DEPLOY.md)
- **CTF:** `npm run ctf:build` → образ `laboratorium/ctf-lab:latest`

## Стек

- Frontend: HTML, CSS, vanilla JS
- Backend: Node.js 22, Express
- DB: SQLite (better-sqlite3)
- Auth: JWT + bcrypt
- Docker: Alpine, compose
