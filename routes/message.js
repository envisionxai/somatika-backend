const express = require("express");
const router = express.Router();
const { processMessage } = require("../engine/leo");
const { saveMessage, getMessagesByUser } = require("../db/db");
const { saveFile } = require("../engine/fileManager");

/**
 * Парсинг сообщения в формате [MODE: FILE]
 * @param {string} message - Текст сообщения
 * @returns {object|null} - { name, content } или null
 */
function parseFileMessage(message) {
  // Проверка на формат файла
  if (!message.includes("[MODE: FILE]")) {
    return null;
  }

  // Извлечение имени файла
  const nameMatch = message.match(/NAME:\s*([^\n]+)/);
  if (!nameMatch) {
    return null;
  }
  const name = nameMatch[1].trim();

  // Извлечение содержимого
  const contentStart = message.indexOf("CONTENT:");
  const contentEnd = message.indexOf("[END FILE]");
  
  if (contentStart === -1 || contentEnd === -1) {
    return null;
  }

  const content = message
    .substring(contentStart + 8, contentEnd)
    .trim();

  return { name, content };
}

/**
 * POST /api/message
 * Обработка сообщения пользователя
 *
 * Body:
 * {
 *   "userId": "123",
 *   "project": "leo",
 *   "message": "текст"
 * }
 */
router.post("/", async (req, res) => {
  try {
    const { userId, project, message } = req.body;

    // Валидация
    if (!userId || !project || !message) {
      return res.status(400).json({
        error: "Missing required fields",
        required: ["userId", "project", "message"]
      });
    }

    // ПРОВЕРКА: Если сообщение содержит [MODE: FILE]
    if (message.includes("[MODE: FILE]")) {
      const fileData = parseFileMessage(message);

      if (!fileData) {
        return res.status(400).json({
          error: "Invalid file format",
          required: ["[MODE: FILE]", "NAME:", "CONTENT:", "[END FILE]"]
        });
      }

      // Сохранение файла (без Leo Engine, без AI)
      const result = saveFile(fileData.name, fileData.content);

      // Сохранение в БД как системное сообщение
      await saveMessage({
        userId,
        project,
        message,
        reply: "Файл принят",
        type: "system",
        timestamp: new Date().toISOString()
      });

      console.log(`📁 File message received from ${userId}: ${fileData.name}`);

      return res.json({
        success: true,
        data: {
          reply: "Файл принят",
          type: "system",
          file: result
        }
      });
    }

    // Обработка через Leo Engine (обычный режим)
    const result = await processMessage(userId, project, message);

    // Сохранение в БД
    await saveMessage({
      userId,
      project,
      message,
      reply: result.reply,
      type: result.type,
      timestamp: new Date().toISOString()
    });

    res.json({
      success: true,
      data: result
    });

  } catch (error) {
    console.error("Message error:", error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/message/history?userId=123&project=leo
 * Получение истории сообщений
 */
router.get("/history", async (req, res) => {
  try {
    const { userId, project } = req.query;

    if (!userId) {
      return res.status(400).json({
        error: "userId is required"
      });
    }

    const messages = await getMessagesByUser(userId, project);

    res.json({
      success: true,
      data: messages
    });

  } catch (error) {
    console.error("History error:", error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
