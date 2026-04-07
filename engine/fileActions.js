/**
 * File Actions — Универсальный парсер и исполнитель файловых операций
 * Поддержка: CREATE, UPDATE, DELETE, MOVE, RENAME
 */

const fs = require("fs");
const path = require("path");
const { saveFile, deleteFile } = require("./fileManager");
const { STORAGE_BASE } = require("./fileRouter");

// Разрешённые папки для операций
const ALLOWED_FOLDERS = ["patches", "protocols", "scenarios", "misc", "memory", "sessions"];
const RESTRICTED_FOLDERS = ["core"]; // только чтение

/**
 * Валидация пути — запрет выхода за storage/
 * @param {string} filePath — путь к файлу (относительный или имя)
 * @returns {boolean}
 */
function isPathSafe(filePath) {
  if (!filePath) return false;
  const normalized = path.normalize(filePath);
  if (normalized.includes("..")) return false;
  if (path.isAbsolute(normalized)) return false;
  return true;
}

/**
 * Проверка, что файл находится в разрешённой папке
 * @param {string} name — имя файла
 * @param {string} action — действие (CREATE/DELETE/MOVE и т.д.)
 * @returns {{ allowed: boolean, reason: string }}
 */
function checkPermission(name, action) {
  const upperName = name.toUpperCase();

  // Для core — только чтение
  if (upperName.includes("ARCHITECTOR") || upperName.includes("CORE")) {
    if (action !== "CREATE" && action !== "UPDATE") {
      return { allowed: false, reason: "core files are restricted: read-only" };
    }
    // CREATE/UPDATE в core разрешён (архитектор должен мочь обновлять свой core)
  }

  return { allowed: true, reason: "ok" };
}

/**
 * Парсинг одного [MODE: FILE] блока с поддержкой ACTION
 * @param {string} block — текст блока
 * @returns {object|null} — { action, name, content, from, to }
 */
function parseSingleBlock(block) {
  const nameMatch = block.match(/NAME:\s*([^\n]+)/);
  if (!nameMatch) return null;

  const name = nameMatch[1].trim();
  const actionMatch = block.match(/ACTION:\s*([^\n]+)/i);
  const action = actionMatch ? actionMatch[1].trim().toUpperCase() : "CREATE";

  const fromMatch = block.match(/FROM:\s*([^\n]+)/i);
  const toMatch = block.match(/TO:\s*([^\n]+)/i);

  let content = null;
  const contentStart = block.indexOf("CONTENT:");
  if (contentStart !== -1) {
    const endMarkers = ["[END FILE]", "[END PATCH]"];
    let contentEnd = -1;
    for (const marker of endMarkers) {
      const idx = block.indexOf(marker, contentStart);
      if (idx !== -1 && (contentEnd === -1 || idx < contentEnd)) {
        contentEnd = idx;
      }
    }
    if (contentEnd !== -1) {
      content = block.substring(contentStart + 8, contentEnd).trim();
    }
  }

  return {
    action,
    name,
    content,
    from: fromMatch ? fromMatch[1].trim() : null,
    to: toMatch ? toMatch[1].trim() : null
  };
}

/**
 * Парсинг всех [MODE: FILE/PATCH] блоков из текста
 * @param {string} text — текст сообщения или ответа AI
 * @returns {Array<object>} — массив распарсенных блоков
 */
function parseFileBlocks(text) {
  const regex = /\[MODE:\s*(?:FILE|PATCH)\]([\s\S]*?)\[END\s*(?:FILE|PATCH)\]/gi;
  const blocks = [];
  let match;

  while ((match = regex.exec(text)) !== null) {
    const parsed = parseSingleBlock(match[0]);
    if (parsed) {
      blocks.push(parsed);
    }
  }

  return blocks;
}

/**
 * Парсинг одного [MODE: FILE] блока (для совместимости с /api/message)
 * @param {string} text — текст сообщения
 * @returns {{ name: string, content: string }|null}
 */
function parseFileMessage(text) {
  if (!text.includes("[MODE: FILE]") && !text.includes("[MODE: PATCH]")) {
    return null;
  }

  const blocks = parseFileBlocks(text);
  if (blocks.length === 0) return null;

  const block = blocks[0];
  if (!block.name || !block.content) return null;

  return { name: block.name, content: block.content };
}

/**
 * Выполнение файловой операции
 * @param {object} fileOp — распарсенный блок { action, name, content, from, to }
 * @returns {{ success: boolean, action: string, name: string, error?: string }}
 */
function executeFileAction(fileOp) {
  const { action, name, content, from, to } = fileOp;

  // Валидация пути
  if (!isPathSafe(name)) {
    return { success: false, action, name, error: "Unsafe path" };
  }

  // Проверка разрешений
  const perm = checkPermission(name, action);
  if (!perm.allowed) {
    return { success: false, action, name, error: perm.reason };
  }

  switch (action) {
    case "CREATE":
    case "UPDATE": {
      if (!content) {
        return { success: false, action, name, error: "No content provided" };
      }
      const result = saveFile(name, content);
      return { success: true, action, name, path: result.path };
    }

    case "DELETE": {
      const deleted = deleteFile(name);
      if (!deleted) {
        return { success: false, action, name, error: "File not found" };
      }
      return { success: true, action, name };
    }

    case "MOVE":
    case "RENAME": {
      if (!from || !to) {
        return { success: false, action, name, error: "FROM and TO required" };
      }
      if (!isPathSafe(from) || !isPathSafe(to)) {
        return { success: false, action, name, error: "Unsafe path in FROM/TO" };
      }
      return moveFile(from, to);
    }

    default:
      return { success: false, action, name, error: `Unknown action: ${action}` };
  }
}

/**
 * Перемещение / переименование файла
 * @param {string} fromRelative — исходный путь (относительно storage)
 * @param {string} toRelative — целевой путь (относительно storage)
 * @returns {object}
 */
function moveFile(fromRelative, toRelative) {
  const fromPath = path.join(STORAGE_BASE, fromRelative);
  const toPath = path.join(STORAGE_BASE, toRelative);

  if (!fs.existsSync(fromPath)) {
    return { success: false, action: "MOVE", name: fromRelative, error: "Source file not found" };
  }

  // Создать целевую директорию
  const toDir = path.dirname(toPath);
  if (!fs.existsSync(toDir)) {
    fs.mkdirSync(toDir, { recursive: true });
  }

  fs.renameSync(fromPath, toPath);
  console.log(`📁 File moved: ${fromRelative} → ${toRelative}`);

  return { success: true, action: "MOVE", name: toRelative, from: fromRelative };
}

/**
 * Выполнение всех файловых операций из текста
 * @param {string} text — текст с [MODE: FILE] блоками
 * @returns {Array<object>} — результаты операций
 */
function executeAllFileActions(text) {
  const blocks = parseFileBlocks(text);
  return blocks.map(block => executeFileAction(block));
}

module.exports = {
  parseFileBlocks,
  parseFileMessage,
  executeFileAction,
  executeAllFileActions,
  isPathSafe,
  checkPermission
};
