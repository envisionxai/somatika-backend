/**
 * File Actions — Универсальный парсер и исполнитель файловых операций
 * Поддержка файлов: CREATE, UPDATE, DELETE, MOVE, RENAME
 * Поддержка папок: MKDIR, RMDIR, MOVE_DIR, RENAME_DIR
 */

const fs = require("fs");
const path = require("path");
const { saveFile, deleteFile } = require("./fileManager");
const { STORAGE_BASE } = require("./fileRouter");

// Разрешённые корневые папки для операций (файлы и подпапки)
const ALLOWED_FOLDERS = ["patches", "protocols", "scenarios", "misc", "memory", "sessions", "projects"];
// Корневые папки, которые нельзя удалять/переименовывать/перемещать целиком,
// но внутрь которых можно писать (core содержит системные файлы архитектора)
const PROTECTED_ROOT_FOLDERS = ["core"];
const RESTRICTED_FOLDERS = ["core"]; // legacy: только чтение для DELETE файлов

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
 * Валидация пути папки — расширение isPathSafe для директорий
 * @param {string} folderPath — путь к папке относительно storage/
 * @returns {boolean}
 */
function isFolderPathSafe(folderPath) {
  if (!isPathSafe(folderPath)) return false;
  const normalized = path.normalize(folderPath).replace(/[\\/]+$/, "");
  if (!normalized) return false;
  if (normalized === "." || normalized === "/") return false;
  return true;
}

/**
 * Первый сегмент пути (корневая папка в storage/)
 * @param {string} relative
 * @returns {string}
 */
function firstSegment(relative) {
  const normalized = path.normalize(relative).replace(/[\\/]+$/, "");
  const parts = normalized.split(/[\\/]/);
  return parts[0] || "";
}

/**
 * Проверка, что путь находится под одной из разрешённых корневых папок
 * (ALLOWED_FOLDERS или PROTECTED_ROOT_FOLDERS — внутрь protected писать можно)
 * @param {string} relative
 * @returns {boolean}
 */
function isWithinAllowedRoot(relative) {
  const root = firstSegment(relative);
  return ALLOWED_FOLDERS.includes(root) || PROTECTED_ROOT_FOLDERS.includes(root);
}

/**
 * Проверка, что путь указывает именно на защищённую корневую папку целиком
 * (например, "core" или "core/" — но НЕ "core/subfolder")
 * @param {string} relative
 * @returns {boolean}
 */
function isProtectedFolder(relative) {
  if (!relative) return false;
  const normalized = path.normalize(relative).replace(/[\\/]+$/, "");
  return PROTECTED_ROOT_FOLDERS.includes(normalized);
}

/**
 * Построить абсолютный путь папки внутри storage/
 * @param {string} relative
 * @returns {string}
 */
function resolveFolderPath(relative) {
  const normalized = path.normalize(relative).replace(/[\\/]+$/, "");
  return path.join(STORAGE_BASE, normalized);
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
 * Нормализация пути, присланного AI:
 * - убирает ведущие слеши/бэкслеши (/misc/foo → misc/foo)
 * - убирает обрамляющие кавычки и бэктики
 * - убирает префикс storage/ (storage/misc/foo → misc/foo)
 * @param {string|null} raw
 * @returns {string|null}
 */
function normalizeRelativePath(raw) {
  if (raw === null || raw === undefined) return null;
  let s = String(raw).trim();
  if (!s) return s;
  // Убрать обрамляющие кавычки
  s = s.replace(/^["'`]+|["'`]+$/g, "").trim();
  // Убрать ведущие слеши/бэкслеши
  s = s.replace(/^[\\/]+/, "");
  // Убрать префикс storage/
  s = s.replace(/^storage[\\/]+/i, "");
  return s;
}

/**
 * Парсинг одного [MODE: FILE] блока с поддержкой ACTION
 * @param {string} block — текст блока
 * @returns {object|null} — { action, name, path, content, from, to, force }
 */
function parseSingleBlock(block) {
  const actionMatch = block.match(/ACTION:\s*([^\n]+)/i);
  const action = actionMatch ? actionMatch[1].trim().toUpperCase() : "CREATE";

  const nameMatch = block.match(/NAME:\s*([^\n]+)/);
  const pathMatch = block.match(/PATH:\s*([^\n]+)/i);
  const name = normalizeRelativePath(nameMatch ? nameMatch[1] : null);
  const pathValue = normalizeRelativePath(pathMatch ? pathMatch[1] : null);

  // Для файловых операций требуется NAME. Для операций над папками — PATH или NAME.
  // Операциям MOVE/RENAME/MOVE_DIR/RENAME_DIR хватает FROM/TO.
  const isMoveLike = action === "MOVE" || action === "RENAME" || action === "MOVE_DIR" || action === "RENAME_DIR";
  if (!name && !pathValue && !isMoveLike) return null;

  const fromMatch = block.match(/FROM:\s*([^\n]+)/i);
  const toMatch = block.match(/TO:\s*([^\n]+)/i);
  const forceMatch = block.match(/FORCE:\s*([^\n]+)/i);
  const force = forceMatch ? /^(true|1|yes)$/i.test(forceMatch[1].trim()) : false;

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
    name: name || pathValue,
    path: pathValue || name,
    content,
    from: normalizeRelativePath(fromMatch ? fromMatch[1] : null),
    to: normalizeRelativePath(toMatch ? toMatch[1] : null),
    force
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
 * @param {object} fileOp — распарсенный блок { action, name, path, content, from, to, force }
 * @returns {{ success: boolean, action: string, name: string, error?: string }}
 */
function executeFileAction(fileOp) {
  const { action, content, force } = fileOp;
  // Нормализация всех путей — страхуемся на случай прямого вызова в обход парсера
  const name = normalizeRelativePath(fileOp.name);
  const from = normalizeRelativePath(fileOp.from);
  const to = normalizeRelativePath(fileOp.to);
  const targetPath = normalizeRelativePath(fileOp.path) || name;

  switch (action) {
    case "CREATE":
    case "UPDATE": {
      if (!isPathSafe(name)) {
        return { success: false, action, name, error: "Unsafe path" };
      }
      const perm = checkPermission(name, action);
      if (!perm.allowed) {
        return { success: false, action, name, error: perm.reason };
      }
      if (!content) {
        return { success: false, action, name, error: "No content provided" };
      }
      const result = saveFile(name, content);
      return { success: true, action, name, path: result.path };
    }

    case "DELETE": {
      if (!isPathSafe(name)) {
        return { success: false, action, name, error: "Unsafe path" };
      }
      const perm = checkPermission(name, action);
      if (!perm.allowed) {
        return { success: false, action, name, error: perm.reason };
      }
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

    case "MKDIR":
      return mkdirAction(targetPath);

    case "RMDIR":
      return rmdirAction(targetPath, force);

    case "MOVE_DIR":
    case "RENAME_DIR":
      return moveDirAction(from, to, action);

    default:
      return { success: false, action, name, error: `Unknown action: ${action}` };
  }
}

/**
 * Создание папки (рекурсивно, идемпотентно)
 * @param {string} relative — путь относительно storage/
 */
function mkdirAction(relative) {
  if (!isFolderPathSafe(relative)) {
    return { success: false, action: "MKDIR", name: relative, error: "Unsafe folder path" };
  }
  if (!isWithinAllowedRoot(relative)) {
    return {
      success: false,
      action: "MKDIR",
      name: relative,
      error: `Root folder must be one of: ${ALLOWED_FOLDERS.concat(PROTECTED_ROOT_FOLDERS).join(", ")}`
    };
  }

  const absPath = resolveFolderPath(relative);
  const existed = fs.existsSync(absPath);

  try {
    fs.mkdirSync(absPath, { recursive: true });
  } catch (error) {
    return { success: false, action: "MKDIR", name: relative, error: error.message };
  }

  console.log(`📁 Folder ${existed ? "exists" : "created"}: ${relative}`);
  return { success: true, action: "MKDIR", name: relative, path: absPath, existed };
}

/**
 * Удаление папки. По умолчанию только пустой; с force=true — рекурсивно.
 * @param {string} relative
 * @param {boolean} force
 */
function rmdirAction(relative, force) {
  if (!isFolderPathSafe(relative)) {
    return { success: false, action: "RMDIR", name: relative, error: "Unsafe folder path" };
  }
  if (!isWithinAllowedRoot(relative)) {
    return { success: false, action: "RMDIR", name: relative, error: "Folder outside allowed roots" };
  }
  if (isProtectedFolder(relative)) {
    return { success: false, action: "RMDIR", name: relative, error: "Protected folder: cannot delete root folder" };
  }

  const absPath = resolveFolderPath(relative);
  if (!fs.existsSync(absPath)) {
    return { success: false, action: "RMDIR", name: relative, error: "Folder not found" };
  }

  const stats = fs.statSync(absPath);
  if (!stats.isDirectory()) {
    return { success: false, action: "RMDIR", name: relative, error: "Path is not a directory" };
  }

  const entries = fs.readdirSync(absPath);
  const isEmpty = entries.length === 0;

  try {
    if (isEmpty) {
      fs.rmdirSync(absPath);
    } else if (force === true) {
      fs.rmSync(absPath, { recursive: true, force: true });
    } else {
      return {
        success: false,
        action: "RMDIR",
        name: relative,
        error: "Folder not empty, use FORCE: true for recursive delete"
      };
    }
  } catch (error) {
    return { success: false, action: "RMDIR", name: relative, error: error.message };
  }

  console.log(`🗑️ Folder removed${force ? " (recursive)" : ""}: ${relative}`);
  return { success: true, action: "RMDIR", name: relative, recursive: force === true };
}

/**
 * Перемещение / переименование папки
 * @param {string} fromRelative
 * @param {string} toRelative
 * @param {string} action — "MOVE_DIR" или "RENAME_DIR"
 */
function moveDirAction(fromRelative, toRelative, action) {
  if (!fromRelative || !toRelative) {
    return { success: false, action, name: fromRelative, error: "FROM and TO required" };
  }
  if (!isFolderPathSafe(fromRelative) || !isFolderPathSafe(toRelative)) {
    return { success: false, action, name: fromRelative, error: "Unsafe folder path in FROM/TO" };
  }
  if (!isWithinAllowedRoot(fromRelative) || !isWithinAllowedRoot(toRelative)) {
    return { success: false, action, name: fromRelative, error: "Folder outside allowed roots" };
  }
  if (isProtectedFolder(fromRelative) || isProtectedFolder(toRelative)) {
    return { success: false, action, name: fromRelative, error: "Protected folder: cannot move/rename root folder" };
  }

  const fromAbs = resolveFolderPath(fromRelative);
  const toAbs = resolveFolderPath(toRelative);

  if (!fs.existsSync(fromAbs)) {
    return { success: false, action, name: fromRelative, error: "Source folder not found" };
  }
  const stats = fs.statSync(fromAbs);
  if (!stats.isDirectory()) {
    return { success: false, action, name: fromRelative, error: "Source path is not a directory" };
  }
  if (fs.existsSync(toAbs)) {
    return { success: false, action, name: fromRelative, error: "Target already exists" };
  }

  try {
    const parentDir = path.dirname(toAbs);
    if (!fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true });
    }
    fs.renameSync(fromAbs, toAbs);
  } catch (error) {
    return { success: false, action, name: fromRelative, error: error.message };
  }

  console.log(`📁 Folder moved: ${fromRelative} → ${toRelative}`);
  return { success: true, action, from: fromRelative, to: toRelative, name: toRelative };
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
  isFolderPathSafe,
  isProtectedFolder,
  isWithinAllowedRoot,
  checkPermission,
  ALLOWED_FOLDERS,
  PROTECTED_ROOT_FOLDERS
};
