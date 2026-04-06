const express = require("express");
const router = express.Router();
const { addPatch, getAllPatches, deactivatePatch } = require("../engine/patchManager");
const { v4: uuidv4 } = require("uuid");

/**
 * POST /api/patch
 * Добавление нового патча
 * 
 * Body:
 * {
 *   "project": "leo",
 *   "name": "OVERLOAD_FIX",
 *   "triggers": ["плохо", "накрыло"],
 *   "steps": ["посмотри на любой предмет рядом", "где ты по шкале?"],
 *   "active": true
 * }
 */
router.post("/", (req, res) => {
  try {
    const patch = req.body;

    // Валидация
    if (!patch.project || !patch.name || !patch.triggers || !patch.steps) {
      return res.status(400).json({
        error: "Missing required fields",
        required: ["project", "name", "triggers", "steps"]
      });
    }

    // Добавляем ID и метаданные
    const newPatch = {
      id: uuidv4(),
      ...patch,
      active: patch.active !== false,
      createdAt: new Date().toISOString()
    };

    addPatch(newPatch);

    console.log(`✅ Patch added: ${newPatch.name} (${newPatch.project})`);

    res.json({
      success: true,
      message: "Patch added successfully",
      patch: newPatch
    });

  } catch (error) {
    console.error("Patch add error:", error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/patch
 * Получение всех патчей (опционально по проекту)
 */
router.get("/", (req, res) => {
  try {
    const { project } = req.query;
    const patches = getAllPatches(project);

    res.json({
      success: true,
      count: patches.length,
      data: patches
    });

  } catch (error) {
    console.error("Patch list error:", error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * DELETE /api/patch/:id
 * Деактивация патча
 */
router.delete("/:id", (req, res) => {
  try {
    const { id } = req.params;
    const success = deactivatePatch(id);

    if (!success) {
      return res.status(404).json({
        success: false,
        error: "Patch not found"
      });
    }

    res.json({
      success: true,
      message: `Patch ${id} deactivated`
    });

  } catch (error) {
    console.error("Patch delete error:", error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
