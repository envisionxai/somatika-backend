const express = require("express");
const router = express.Router();
const { saveFile, getAllFiles, fileExists } = require("../engine/fileManager");
const { getRouterStats } = require("../engine/fileRouter");

/**
 * POST /api/file
 * Сохранение файла из чата
 *
 * Body:
 * {
 *   "name": "FILE_NAME",
 *   "content": "TEXT",
 *   "project": "leo"
 * }
 */
router.post("/", (req, res) => {
  try {
    const { name, content, project } = req.body;

    // Валидация
    if (!name || !content) {
      return res.status(400).json({
        error: "Missing required fields",
        required: ["name", "content"]
      });
    }

    // Сохранение файла
    const result = saveFile(name, content);

    console.log(`✅ File received: ${name} (project: ${project || 'unknown'})`);

    res.json({
      success: true,
      status: "ok",
      message: "Файл принят",
      data: result
    });

  } catch (error) {
    console.error("File save error:", error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/file
 * Получение списка всех файлов
 */
router.get("/", (req, res) => {
  try {
    const { folder } = req.query;
    const files = getAllFiles(folder);

    res.json({
      success: true,
      count: files.length,
      data: files
    });

  } catch (error) {
    console.error("File list error:", error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/file/:name
 * Проверка существования файла
 */
router.get("/:name", (req, res) => {
  try {
    const { name } = req.params;
    const exists = fileExists(name);

    res.json({
      success: true,
      exists,
      name
    });

  } catch (error) {
    console.error("File check error:", error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/file/router/stats
 * Статистика роутера
 */
router.get("/router/stats", (req, res) => {
  try {
    const stats = getRouterStats();
    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    console.error("Router stats error:", error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
