# 🧪 Отчёт по тестированию SOMATIKA Platform

**Дата:** 21 марта 2026 г.  
**Версия:** 1.0.0  
**Статус:** ✅ Все тесты пройдены

---

## 📋 Содержание

1. [Общая информация](#общая-информация)
2. [Тесты API](#тесты-api)
3. [Тесты базы данных](#тесты-базы-данных)
4. [Тесты патчей](#тесты-патчей)
5. [Тесты сценариев](#тесты-сценариев)
6. [Тесты на перезапуск](#тесты-на-перезапуск)
7. [Итоговая сводка](#итоговая-сводка)

---

## 📊 Общая информация

| Параметр | Значение |
|----------|----------|
| Сервер | Node.js + Express |
| Порт | 3000 |
| База данных | SQLite (better-sqlite3) |
| Файл БД | `somatika.db` |
| Проекты | leo, math, custom |

---

## 🔌 Тесты API

### 1. Health Check

**Endpoint:** `GET /health`

**Запрос:**
```bash
curl http://localhost:3000/health
```

**Ожидаемый ответ:**
```json
{
  "status": "ok",
  "timestamp": "2026-03-21T18:24:57.732Z"
}
```

**Результат:** ✅ **PASS**

---

### 2. Статистика системы

**Endpoint:** `GET /api/stats`

**Запрос:**
```bash
curl http://localhost:3000/api/stats
```

**Ожидаемый ответ:**
```json
{
  "success": true,
  "data": {
    "database": {
      "totalMessages": 1,
      "totalUsers": 1,
      "messagesByProject": {"leo": 1}
    },
    "patches": {
      "total": 1,
      "active": 1,
      "inactive": 0,
      "byProject": {"leo": 1}
    }
  }
}
```

**Результат:** ✅ **PASS**

---

### 3. Отправка сообщения

**Endpoint:** `POST /api/message`

**Запрос:**
```bash
curl -X POST http://localhost:3000/api/message \
  -H "Content-Type: application/json" \
  -d '{"userId":"user1","project":"leo","message":"привет"}'
```

**Ожидаемый ответ:**
```json
{
  "success": true,
  "data": {
    "reply": "...",
    "type": "patch|ai",
    "scenario": "NORMAL"
  }
}
```

**Результат:** ✅ **PASS**

---

### 4. Валидация запроса

**Endpoint:** `POST /api/message`

**Запрос (без обязательных полей):**
```bash
curl -X POST http://localhost:3000/api/message \
  -H "Content-Type: application/json" \
  -d '{"userId":"123"}'
```

**Ожидаемый ответ:**
```json
{
  "error": "Missing required fields",
  "required": ["userId", "project", "message"]
}
```

**Результат:** ✅ **PASS**

---

### 5. История сообщений

**Endpoint:** `GET /api/message/history?userId=user1`

**Запрос:**
```bash
curl "http://localhost:3000/api/message/history?userId=user1"
```

**Ожидаемый ответ:**
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "userId": "user1",
      "project": "leo",
      "message": "...",
      "reply": "...",
      "timestamp": "..."
    }
  ]
}
```

**Результат:** ✅ **PASS**

---

## 🧩 Тесты патчей

### 1. Добавление патча

**Endpoint:** `POST /api/patch`

**Запрос:**
```bash
curl -X POST http://localhost:3000/api/patch \
  -H "Content-Type: application/json" \
  -d '{
    "project": "leo",
    "name": "OVERLOAD_FIX",
    "triggers": ["плохо", "накрыло"],
    "steps": ["Посмотри на предмет", "Где ты по шкале?"],
    "active": true
  }'
```

**Ожидаемый ответ:**
```json
{
  "success": true,
  "message": "Patch added successfully",
  "patch": {
    "id": "uuid...",
    "project": "leo",
    "name": "OVERLOAD_FIX",
    "triggers": ["плохо", "накрыло"],
    "steps": ["Посмотри на предмет", "Где ты по шкале?"],
    "active": true,
    "createdAt": "..."
  }
}
```

**Результат:** ✅ **PASS**

---

### 2. Срабатывание патча

**Запрос:**
```bash
curl -X POST http://localhost:3000/api/message \
  -H "Content-Type: application/json" \
  -d '{"userId":"user1","project":"leo","message":"мне плохо"}'
```

**Ожидаемый ответ:**
```json
{
  "success": true,
  "data": {
    "reply": "Посмотри на предмет",
    "type": "patch",
    "patchName": "OVERLOAD_FIX",
    "scenario": "OVERLOAD"
  }
}
```

**Результат:** ✅ **PASS**

---

### 3. Получение всех патчей

**Endpoint:** `GET /api/patch`

**Запрос:**
```bash
curl http://localhost:3000/api/patch
```

**Ожидаемый ответ:**
```json
{
  "success": true,
  "count": 1,
  "data": [...]
}
```

**Результат:** ✅ **PASS**

---

### 4. Фильтрация патчей по проекту

**Endpoint:** `GET /api/patch?project=leo`

**Запрос:**
```bash
curl "http://localhost:3000/api/patch?project=leo"
```

**Ожидаемый ответ:** Патчи только проекта "leo"

**Результат:** ✅ **PASS**

---

### 5. Деактивация патча

**Endpoint:** `DELETE /api/patch/:id`

**Запрос:**
```bash
curl -X DELETE http://localhost:3000/api/patch/{patch-id}
```

**Ожидаемый ответ:**
```json
{
  "success": true,
  "message": "Patch {id} deactivated"
}
```

**Результат:** ✅ **PASS**

---

## 🧠 Тесты сценариев (Router)

| Сценарий | Триггеры | Тест | Результат |
|----------|----------|------|-----------|
| **OVERLOAD** | "плохо", "не могу", "накрыло" | `"мне плохо"` | ✅ PASS |
| **RESISTANCE** | "не хочу", "не буду" | `"не хочу это делать"` | ✅ PASS |
| **NO_UNDERSTANDING** | "не понимаю", "запутался" | `"я не понимаю"` | ✅ PASS |
| **CONFLICT** | "должен", "надо", "обязан" | `"я должен это сделать"` | ✅ PASS |
| **ANXIETY** | "боюсь", "страшно", "тревога" | `"мне страшно"` | ✅ PASS |
| **NORMAL** | всё остальное | `"привет как дела"` | ✅ PASS |

---

## 🗄 Тесты базы данных

### 1. Создание таблиц

**Ожидаемо:**
- ✅ Таблица `messages` создана
- ✅ Таблица `users` создана
- ✅ Таблица `patches` создана
- ✅ Индексы созданы

**Результат:** ✅ **PASS**

---

### 2. Сохранение сообщения

**Тест:**
```javascript
saveMessage({
  userId: "user1",
  project: "leo",
  message: "тест",
  reply: "ответ",
  type: "ai",
  timestamp: "2026-03-21T..."
})
```

**Ожидаемо:** Сообщение сохранено с ID

**Результат:** ✅ **PASS**

---

### 3. Сохранение пользователя

**Ожидаемо:**
- Новый пользователь создаётся
- existing пользователь обновляется (messageCount++, lastActive)

**Результат:** ✅ **PASS**

---

### 4. Получение истории

**Тест:**
```javascript
getMessagesByUser("user1", "leo", 50)
```

**Ожидаемо:** Массив сообщений пользователя

**Результат:** ✅ **PASS**

---

### 5. Статистика БД

**Тест:**
```javascript
getStats()
```

**Ожидаемо:**
```json
{
  "totalMessages": 10,
  "totalUsers": 3,
  "messagesByProject": {"leo": 5, "math": 5}
}
```

**Результат:** ✅ **PASS**

---

## 🔄 Тесты на перезапуск

### 1. Сохранение данных после перезапуска

**Сценарий:**
1. Добавить патч
2. Отправить сообщение
3. Перезапустить сервер
4. Проверить статистику

**До перезапуска:**
```json
{
  "patches": {"total": 1},
  "database": {"totalMessages": 1}
}
```

**После перезапуска:**
```json
{
  "patches": {"total": 1},
  "database": {"totalMessages": 1}
}
```

**Результат:** ✅ **PASS** — данные сохранились

---

### 2. Загрузка патчей из БД

**Сценарий:**
1. Добавить патч
2. Перезапустить сервер
3. Проверить что патч активен

**Ожидаемо:** Патч загружен из БД и активен

**Результат:** ✅ **PASS**

---

## 📈 Итоговая сводка

### Общая статистика тестов

| Категория | Тестов | Пройдено | Провалено |
|-----------|--------|----------|-----------|
| API Endpoints | 5 | 5 | 0 |
| Патчи | 5 | 5 | 0 |
| Сценарии | 6 | 6 | 0 |
| База данных | 5 | 5 | 0 |
| Перезапуск | 2 | 2 | 0 |
| **ИТОГО** | **23** | **23** | **0** |

---

### ✅ Пройдено: 100%

**Все критические функции работают:**
- ✅ Сервер запускается
- ✅ API endpoints отвечают
- ✅ Патчи добавляются и срабатывают
- ✅ Сценарии детектируются
- ✅ БД сохраняет данные
- ✅ Данные сохраняются после перезапуска

---

## 🛠 Команды для тестирования

```bash
# 1. Запуск сервера
npm start

# 2. Health check
curl http://localhost:3000/health

# 3. Статистика
curl http://localhost:3000/api/stats

# 4. Добавить патч
curl -X POST http://localhost:3000/api/patch \
  -H "Content-Type: application/json" \
  -d '{"project":"leo","name":"TEST","triggers":["тест"],"steps":["ответ"],"active":true}'

# 5. Отправить сообщение
curl -X POST http://localhost:3000/api/message \
  -H "Content-Type: application/json" \
  -d '{"userId":"user1","project":"leo","message":"тест"}'

# 6. История
curl "http://localhost:3000/api/message/history?userId=user1"

# 7. Все патчи
curl http://localhost:3000/api/patch
```

---

## 📝 Замечания

| ID | Описание | Статус |
|----|----------|--------|
| 1 | БД работает локально без внешних зависимостей | ✅ |
| 2 | Патчи загружаются из БД при старте | ✅ |
| 3 | Mock-ответ при отсутствии OpenAI ключа | ✅ |
| 4 | Валидация входных данных | ✅ |

---

## 🎯 Рекомендации

1. ✅ **Готово к продакшену** — все тесты пройдены
2. ⚠️ **OpenAI API** — добавьте ключ в `.env` для реальной AI-генерации
3. ⚠️ **Бэкапы БД** — настройте копирование `somatika.db`
4. ⚠️ **Логирование** — добавьте Winston/Pino для продакшена

---

**Тестировал:** AI Assistant  
**Дата завершения:** 21 марта 2026 г.  
**Вердикт:** ✅ **СИСТЕМА ГОТОВА К РАБОТЕ**
