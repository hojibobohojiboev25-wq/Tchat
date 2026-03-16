# Tchat

Полноценный видеочат-продукт на Vercel + Neon PostgreSQL.

## Что умеет сейчас

- Профиль пользователя перед входом (handle, display name, avatar URL).
- Лобби с онлайн-участниками.
- Инвайты: отправить, принять, отклонить.
- 1:1 видеозвонок после принятия приглашения.
- WebRTC P2P (STUN/TURN), сигналинг через Vercel API polling.
- Сохранение состояния в БД: пользователи, presence, invitations, call sessions, signals.
- Базовая защита: валидация payload, ограничение частоты invite/send, idempotency у сигналинга.
- Мобильная устойчивость: запуск медиа по user-gesture, fallback constraints, recover после offline/online.

## Архитектура

- `client/*` - SPA на чистом ES6.
- `api/*` - Vercel serverless endpoints.
- `PostgreSQL (Neon)` - источник истины для realtime-состояния.

## Быстрый старт (локально)

1. Установить зависимости:
   ```bash
   npm install
   ```
2. Создать `.env`:
   ```bash
   copy .env.example .env
   ```
3. Заполнить минимум:
   - `DATABASE_URL`
4. Запустить:
   ```bash
   npm run dev
   ```
5. Открыть:
   - `http://localhost:3000`

## Переменные окружения

- `DATABASE_URL` (обязательно для Vercel API)
- `API_BASE_URL` (опционально, если API находится на другом домене)
- `STUN_URLS`
- `TURN_URL`
- `TURN_USERNAME`
- `TURN_CREDENTIAL`
- `NODE_ENV`
- `PORT` (для локального Node-сервера)

## REST API

### Service
- `GET /api/health`
- `GET /api/runtime-config`

### Profile / Presence
- `POST /api/profile/create-or-update`
- `GET /api/profile/me?userId=...`
- `POST /api/presence/heartbeat`
- `GET /api/users/online?userId=...`

### Invite / Call
- `POST /api/invite/send`
- `POST /api/invite/respond`
- `GET /api/invite/inbox?userId=...&after=...`
- `POST /api/call/start-from-invite`
- `POST /api/call/end`

### Signaling
- `POST /api/signal/send`
- `GET /api/signal/poll?callSessionId=...&userId=...&afterId=...`

## Vercel deploy runbook

1. Импортируйте GitHub репозиторий в Vercel.
2. В `Project Settings -> Environment Variables` задайте:
   - `DATABASE_URL=postgresql://...`
   - `STUN_URLS=stun:stun.l.google.com:19302,stun:stun1.l.google.com:19302`
   - (опционально) `TURN_URL`, `TURN_USERNAME`, `TURN_CREDENTIAL`
   - (опционально) `API_BASE_URL` если API отделен от frontend
3. Нажмите `Redeploy`.
4. Проверка:
   - `https://<project>.vercel.app/api/health`
   - `https://<project>.vercel.app/api/runtime-config`

## Мобильный сценарий

- Открывать в Safari/Chrome, не во встроенном webview мессенджеров.
- Нажать кнопку входа в платформу (это user gesture для разрешений).
- Разрешить camera/microphone.
- Выбрать собеседника в лобби и отправить приглашение.

## Безопасность

- Не коммитить `.env`.
- Хранить секреты только в Vercel/Neon environment variables.
- Использовать HTTPS (Vercel уже даёт).
- Рекомендовано периодически ротировать пароль `DATABASE_URL`.
