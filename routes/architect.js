const express = require("express");
const router = express.Router();
const { runArchitect } = require("../services/architectEngine");
const { executeAllFileActions } = require("../engine/fileActions");
const { saveMessage } = require("../db/db");
const { buildMemoryContext, updateSemanticMemory } = require("../services/architectMemory");

// ============================================================
// In-memory job store для async-паттерна.
// gpt-5 может думать 30-60 сек, а Wix Velo имеет платформенный
// лимит 14-30 сек на backend-функции. Поэтому:
// 1. POST /api/architect → возвращает { jobId } мгновенно
// 2. GET /api/architect/status/:jobId → клиент опрашивает каждые 2 сек
// ============================================================
const jobs = new Map();
let jobCounter = 0;

// Очистка старых jobs каждые 5 минут (храним не более 10 мин)
setInterval(() => {
  const cutoff = Date.now() - 10 * 60 * 1000;
  for (const [id, job] of jobs) {
    if (job.createdAt < cutoff) jobs.delete(id);
  }
}, 5 * 60 * 1000);

/**
 * GET /api/architect/status/:jobId
 * Опрос статуса async-задачи
 */
router.get("/status/:jobId", (req, res) => {
  const job = jobs.get(req.params.jobId);

  if (!job) {
    return res.status(404).json({ success: false, error: "Job not found or expired" });
  }

  if (job.status === "done") {
    return res.json({
      success: true,
      data: {
        status: "done",
        reply: job.reply,
        type: job.type,
        savedFiles: job.savedFiles,
        errors: job.errors
      }
    });
  }

  if (job.status === "error") {
    return res.json({
      success: false,
      data: { status: "error", error: job.error }
    });
  }

  // status === "processing"
  return res.json({
    success: true,
    data: { status: "processing" }
  });
});

/**
 * POST /api/architect
 * Обработка сообщения в режиме Архитектора (async)
 */
router.post("/", async (req, res) => {
  try {
    const { message, userId = "default" } = req.body;

    if (!message) {
      return res.status(400).json({ success: false, error: "Message is required" });
    }

    // [MODE: FILE] блоки от пользователя — синхронные, быстрые, без AI.
    // Возвращаем результат сразу (без jobId).
    if (message.includes("[MODE: FILE]") || message.includes("[MODE: PATCH]")) {
      const fileResults = executeAllFileActions(message, { source: "user", userMessage: message });
      const succeeded = fileResults.filter(r => r.success);
      const failed = fileResults.filter(r => !r.success);

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

    // AI-запрос — async. Возвращаем jobId мгновенно.
    const jobId = `arch_${++jobCounter}_${Date.now()}`;
    jobs.set(jobId, { status: "processing", createdAt: Date.now() });

    res.json({ success: true, data: { jobId, status: "processing" } });

    // Обработка в фоне
    (async () => {
      try {
        const memoryContext = buildMemoryContext(userId);
        const { reply, savedFiles, failedFiles } = await runArchitect(message, userId, memoryContext);

        saveMessage({
          userId,
          project: "architect",
          message,
          reply,
          type: savedFiles.length > 0 ? "architect_file" : "architect",
          timestamp: new Date().toISOString()
        });

        updateSemanticMemory(userId, message, reply).catch(err => {
          console.error("Async memory update failed:", err.message);
        });

        jobs.set(jobId, {
          status: "done",
          createdAt: Date.now(),
          reply,
          type: "architect",
          savedFiles: savedFiles.length > 0 ? savedFiles : undefined,
          errors: failedFiles && failedFiles.length > 0 ? failedFiles : undefined
        });

        console.log(`Job ${jobId}: done`);
      } catch (error) {
        console.error(`Job ${jobId} error:`, error.message);
        jobs.set(jobId, {
          status: "error",
          createdAt: Date.now(),
          error: error.message
        });
      }
    })();

  } catch (error) {
    console.error("Architect route error:", error);
    return res.status(500).json({ success: false, error: "Architect error: " + error.message });
  }
});

module.exports = router;
