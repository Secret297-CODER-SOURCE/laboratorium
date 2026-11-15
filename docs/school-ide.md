# Шкільна IDE: Web preview, Git OAuth, Circuits

## Огляд

У кабінеті учня (програмістські напрямки / staff):

- **Редактор коду** — CodeMirror, Docker sandbox, live web-preview, локальний Git + GitHub/GitLab remote
- **Circuits** — embed Wokwi (Arduino) і EasyEDA (схема/PCB) + rule-based підказки з `diagram.json`

## GitHub / GitLab OAuth

1. Створіть OAuth App:
   - **GitHub**: Settings → Developer settings → OAuth Apps  
     Callback: `https://<домен>/api/git-oauth/github/callback`  
     Scopes при авторизації: `repo`, `read:user`
   - **GitLab**: User Settings → Applications  
     Callback: `https://<домен>/api/git-oauth/gitlab/callback`  
     Scopes: `api`, `read_user`, `write_repository`
2. У `.env` задайте (див. `.env.example`):
   - `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET`
   - `GITLAB_CLIENT_ID` / `GITLAB_CLIENT_SECRET`
   - `GIT_TOKEN_ENCRYPTION_KEY` — окремий секрет для AES-GCM сховища токенів
3. Перезапустіть app. У вкладці «Редактор коду» з’являться кнопки підключення акаунтів.
4. Токени **не** пишуться в `.git/config`; для push/pull/clone використовується ephemeral `http.extraHeader`.

## Wokwi / EasyEDA

- Шаблони Wokwi (Blink, LED+кнопка, UART, I2C) створюють проєкт з `diagram.json` + sketch у БД.
- EasyEDA — посилання на публічний/shared editor або oshwlab.
- «Діагностика уроку» перевіряє очікувані компоненти правилами (не SPICE).

## Домашнє завдання

У адмінці при призначенні ДЗ можна вказати **ID схеми** (`circuit_project_id`). У картці задачі учня з’явиться посилання «Відкрити схему Circuits». Викладач (staff) може відкрити чужий проєкт схеми через API за ID.

## Tab access

Ключі: `dash.code`, `dash.circuits`. Обмежуються тими ж правилами, що й інші вкладки кабінету (плюс доступ за програмістським напрямком).
