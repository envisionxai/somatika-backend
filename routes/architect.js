const express = require("express");
const router = express.Router();
const { runArchitect } = require("../services/architectEngine");
const { executeAllFileActions } = require("../engine/fileActions");
const { saveMessage } = require("../db/db");
const { buildMemoryContext, updateSemanticMemory } = require("../services/architectMemory");

/**
 * POST /api/architect
 * Обработка сообщения в режиме Архитектора
 *
 * Body:
 * {
 *   "message": "текст",
 *   "userId": "alex" (опционально, по умолчанию "default")
 * }
 */
router.post("/", async (req, res) => {
  try {
    const { message, userId = "default" } = req.body;

    if (!message) {
      return res.status(400).json({ success: false, error: "Message is required" });
    }

    // Проверка: если пользователь отправляет [MODE: FILE] напрямую
    if (message.includes("[MODE: FILE]") || message.includes("[MODE: PATCH]")) {
      const fileResults = executeAllFileActions(message);
      const succeeded = fileResults.filter(r => r.success);
      const failed = fileResults.filter(r => !r.success);

      // Сохранить в историю
      saveMessage({
        userId,
        project: "architect",
        message,
        reply: `Файловые операции: ${succeeded.length} выполнено, ${failed.length} ошибок`,
        type: "file",
        timestamp: new Date().toISOString()
      });

      return res.json({
        success: true,
        data: {
          reply: `Файловые операции выполнены: ${succeeded.length} успешно`,
          type: "file",
          fileResults: succeeded,
          errors: failed.length > 0 ? failed : undefined
        }
      });
    }

    // Собрать контекст памяти
    const memoryContext = buildMemoryContext(userId);

    // Вызов AI архитектора с памятью
    const { reply, savedFiles, failedFiles } = await runArchitect(message, userId, memoryContext);

    // Сохранить в историю (для памяти)
    saveMessage({
      userId,
      project: "architect",
      message,
      reply,
      type: savedFiles.length > 0 ? "architect_file" : "architect",
      timestamp: new Date().toISOString()
    });

    // Асинхронно обновить семантическую память (не блокируем ответ)
    updateSemanticMemory(userId, message, reply).catch(err => {
      console.error("Async memory update failed:", err.message);
    });

    return res.json({
      success: true,
      data: {
        reply,
        type: "architect",
        savedFiles: savedFiles.length > 0 ? savedFiles : undefined,
        errors: failedFiles && failedFiles.length > 0 ? failedFiles : undefined
      }
    });
  } catch (error) {
    console.error("Architect route error:", error);
    return res.status(500).json({ success: false, error: "Architect error: " + error.message });
  }
});

module.exports = router;
