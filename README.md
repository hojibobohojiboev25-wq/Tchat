# Tchat

Полноценный MVP видеочата без регистрации на базе WebRTC + Socket.IO.

## Возможности

- Мгновенный вход в чат без аккаунта.
- Локальное и удаленное видео в одном интерфейсе.
- Вкл/выкл камеры и микрофона.
- P2P WebRTC-соединение через STUN, с архитектурной поддержкой TURN.
- Сигналинг через Socket.IO.
- REST API для управления комнатами.
- Логирование HTTP и socket событий через `morgan` + `winston`.
- Хранение комнат/сессий в SQLite (по умолчанию) или PostgreSQL (опционально через `DATABASE_URL`).

## Структура

```text
Tchat/
  client/
    index.html
    styles.css
    app.js
  server/
    src/
      db/index.js
      logger.js
      routes/rooms.js
      services/roomService.js
      socket/signaling.js
      index.js
  utils/
    room.js
  config/
    default.js
  .env.example
  package.json
```

## Быстрый старт

1. Установите зависимости:
   ```bash
   npm install
   ```
2. Создайте `.env`:
   ```bash
   copy .env.example .env
   ```
3. При необходимости заполните `DATABASE_URL` (для PostgreSQL) и TURN параметры.
4. Запустите:
   ```bash
   npm run dev
   ```
5. Откройте `http://localhost:3000`.

## Переменные окружения

- `PORT` - порт сервера (по умолчанию `3000`)
- `NODE_ENV` - окружение (`development`/`production`)
- `LOG_LEVEL` - уровень логирования
- `DATABASE_URL` - PostgreSQL строка подключения (если не задано, используется SQLite)
- `STUN_URLS` - STUN серверы через запятую
- `TURN_URL`, `TURN_USERNAME`, `TURN_CREDENTIAL` - TURN параметры

## REST API

- `GET /api/health` - проверка доступности сервиса
- `GET /api/webrtc-config` - конфигурация ICE серверов
- `GET /api/runtime-config` - runtime-конфиг клиента (API URL, signaling URL, ICE)
- `POST /api/rooms` - создать комнату
- `GET /api/rooms/:roomId` - состояние комнаты

## Vercel-only API (без отдельного Socket.IO сервера)

- `GET /api/health` - healthcheck Vercel API + DB
- `POST /api/room-create` - создать комнату
- `POST /api/room-join` - войти в комнату
- `POST /api/room-leave` - выйти из комнаты
- `POST /api/signal-send` - отправить WebRTC сигнал
- `GET /api/signal-poll` - получить новые сигналы (polling)

На мобильных устройствах сначала нажмите кнопку "Начать чат", чтобы камера/микрофон были запрошены по пользовательскому действию.

## Деплой на VPS/облако

- Приложение слушает `0.0.0.0` и готово к reverse proxy (Nginx/Caddy).
- Для production используйте процесс-менеджер (например `pm2`) и HTTPS.
- Для TURN в production рекомендуется поднять собственный coturn-сервер.

## Деплой с Vercel + GitHub

Vercel не подходит для постоянного Socket.IO/WebSocket сигналинг-сервера в serverless-режиме.  
Рекомендуемая схема:

- `frontend` (`client`) — хостится на Vercel;
- `backend` (`server`) — хостится на VPS/Railway/Render/Fly.io.

### 1) Backend (Node.js) деплой

Задайте env на backend-хостинге:

- `PORT=3000`
- `NODE_ENV=production`
- `DATABASE_URL=...` (ваш Neon URL)
- `STUN_URLS=stun:stun.l.google.com:19302,stun:stun1.l.google.com:19302`
- `SIGNALING_URL=https://your-backend-domain.com`
- `API_BASE_URL=https://your-backend-domain.com`

### 2) Frontend (Vercel) деплой

В репозитории уже есть `vercel.json` и serverless функция `api/runtime-config.js`.

В Vercel Project Settings -> Environment Variables задайте:

- `API_BASE_URL=https://your-backend-domain.com`
- `SIGNALING_URL=https://your-backend-domain.com`
- `STUN_URLS=stun:stun.l.google.com:19302,stun:stun1.l.google.com:19302`
- при наличии TURN: `TURN_URL`, `TURN_USERNAME`, `TURN_CREDENTIAL`

После deploy фронтенд загрузит конфиг с `/api/runtime-config` и подключится к вашему backend.

## Безопасность URL и секретов

- Никогда не коммитьте `.env` в GitHub.
- Все секреты (`DATABASE_URL`, TURN креды) храните только в env переменных хостинга.
- Для Neon используйте отдельного пользователя с минимальными правами.
- Включите HTTPS на frontend и backend (иначе WebRTC/camera работают нестабильно).
