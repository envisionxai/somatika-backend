# SOMATIKA Platform Server

AI-платформа с единым сервером для управления несколькими проектами (LEO, MATH, CUSTOM) с поддержкой патчей и Wix Velo интеграции.

## 🏗 Архитектура

```
User → Wix (UI) → Velo Backend → Node.js Server → Leo Engine → Database
```

## 📁 Структура

```
/somatika-server
  server.js              # Точка входа
  package.json
  .env                   # Переменные окружения
  
  /routes
    message.js           # POST /api/message
    patch.js             # POST /api/patch
  
  /engine
    router.js            # Детекция сценариев
    leo.js               # Основной движок
    patchManager.js      # Управление патчами
  
  /projects
    leo.js               # Проект LEO
    math.js              # Проект MATH
    custom.js            # Проект CUSTOM
  
  /services
    ai.js                # OpenAI API
  
  /db
    db.js                # Хранилище данных
```

## 🚀 Быстрый старт

### 1. Установка зависимостей

```bash
cd somatika-server
npm install
```

### 2. Настройка окружения

```bash
cp .env.example .env
```

Отредактируйте `.env` и добавьте ваш OpenAI API ключ:

```
OPENAI_API_KEY=sk-...
```

### 3. Запуск сервера

**Разработка:**
```bash
npm run dev
```

**Продакшен:**
```bash
npm start
```

Сервер запустится на `http://localhost:3000`

## 📡 API Endpoints

### POST /api/message

Отправка сообщения для обработки.

**Request:**
```json
{
  "userId": "123",
  "project": "leo",
  "message": "Мне плохо"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "reply": "Понимаю ваше состояние...",
    "type": "patch",
    "patchName": "OVERLOAD_FIX",
    "scenario": "OVERLOAD"
  }
}
```

### POST /api/patch

Добавление нового патча.

**Request:**
```json
{
  "project": "leo",
  "name": "OVERLOAD_FIX",
  "triggers": ["плохо", "накрыло", "тяжело"],
  "steps": [
    "Посмотри на любой предмет рядом",
    "Где ты по шкале от 1 до 10?"
  ],
  "active": true
}
```

**Response:**
```json
{
  "success": true,
  "message": "Patch added successfully",
  "patch": {
    "id": "uuid...",
    "project": "leo",
    "name": "OVERLOAD_FIX",
    ...
  }
}
```

### GET /api/patch

Получение всех патчей.

**Query params:**
- `project` (опционально) - фильтр по проекту

### DELETE /api/patch/:id

Деактивация патча по ID.

### GET /api/message/history

История сообщений пользователя.

**Query params:**
- `userId` (обязательно)
- `project` (опционально)

### GET /health

Проверка статуса сервера.

## 🔧 Сценарии (Router)

Автоматическая детекция состояний:

| Сценарий | Триггеры |
|----------|----------|
| OVERLOAD | "плохо", "не могу", "накрыло", "тяжело" |
| RESISTANCE | "не хочу", "не буду", "отказ" |
| NO_UNDERSTANDING | "не понимаю", "не ясно", "запутался" |
| CONFLICT | "должен", "надо", "обязан" |
| ANXIETY | "боюсь", "страшно", "тревога" |
| NORMAL | по умолчанию |

## 📦 Патчи

Патчи имеют приоритет над AI-ответами.

**Структура патча:**
```json
{
  "id": "uuid",
  "project": "leo",
  "name": "OVERLOAD_FIX",
  "triggers": ["плохо", "накрыло"],
  "steps": ["шаг 1", "шаг 2"],
  "active": true,
  "createdAt": "2026-03-21T..."
}
```

## 🎨 Wix Velo Интеграция

### backend/leo.jsw

```javascript
export async function sendMessage(message, project, userId) {
  const res = await fetch("https://your-server.com/api/message", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ message, project, userId })
  });

  return res.json();
}

export async function addPatch(patch) {
  const res = await fetch("https://your-server.com/api/patch", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(patch)
  });

  return res.json();
}
```

## 🧪 Примеры использования

### 1. Отправка сообщения

```bash
curl -X POST http://localhost:3000/api/message \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "user123",
    "project": "leo",
    "message": "Чувствую перегрузку"
  }'
```

### 2. Добавление патча

```bash
curl -X POST http://localhost:3000/api/patch \
  -H "Content-Type: application/json" \
  -d '{
    "project": "leo",
    "name": "GROUNDING",
    "triggers": ["тревога", "паника"],
    "steps": ["Назови 5 предметов вокруг", "Глубокий вдох-выдох"],
    "active": true
  }'
```

### 3. Получение патчей

```bash
curl http://localhost:3000/api/patch?project=leo
```

## 📊 Мониторинг

### Статистика патчей

```bash
curl http://localhost:3000/api/patch
```

### История сообщений

```bash
curl "http://localhost:3000/api/message/history?userId=user123&project=leo"
```

## 🔐 Безопасность

- Не храните `.env` в репозитории
- Используйте HTTPS в продакшене
- Добавьте аутентификацию для `/api/patch` endpoints

## 📝 Расширение

### Добавление нового проекта

1. Создайте файл `/projects/yourproject.js`
2. Экспортируйте `enhanceMessage`, `processResponse`, `config`
3. Добавьте проект в `engine/leo.js`

### Добавление нового сценария

1. Добавьте детекцию в `engine/router.js`
2. Добавьте конфигурацию в `getScenarioConfig()`

## 🛠 Технологии

- **Node.js** - сервер
- **Express** - веб-фреймворк
- **better-sqlite3** - локальная БД (файл `somatika.db`)
- **node-fetch** - HTTP-запросы
- **OpenAI API** - AI-движок
- **Wix Velo** - frontend-интеграция

## 📄 Лицензия

MIT
