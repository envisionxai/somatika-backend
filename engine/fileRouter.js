/**
 * File Router System — Автоматическое распределение файлов
 * Определяет путь сохранения на основе имени файла
 */

const path = require('path');

// Базовая директория хранения
const STORAGE_BASE = path.join(__dirname, '..', 'storage');

// Корневые папки, которые можно указывать явно в пути (без автороутинга)
const EXPLICIT_ROOT_FOLDERS = [
  'patches', 'protocols', 'scenarios', 'misc', 'memory', 'sessions', 'projects', 'core'
];

/**
 * Нормализация имени: убрать ведущие слеши, префикс storage/, кавычки
 * @param {string} name
 * @returns {string}
 */
function normalizeName(name) {
  if (!name) return name;
  let s = String(name).trim();
  s = s.replace(/^["'`]+|["'`]+$/g, '').trim();
  s = s.replace(/^[\\/]+/, '');
  s = s.replace(/^storage[\\/]+/i, '');
  return s;
}

/**
 * Проверить, содержит ли имя явный путь с разрешённой корневой папкой
 * @param {string} name
 * @returns {boolean}
 */
function hasExplicitPath(name) {
  const cleaned = normalizeName(name);
  if (!cleaned.includes('/') && !cleaned.includes('\\')) return false;
  const firstSeg = cleaned.split(/[\\/]/)[0];
  return EXPLICIT_ROOT_FOLDERS.includes(firstSeg);
}

/**
 * Определить тип файла и подпапку для патчей
 * @param {string} name - Имя файла
 * @returns {object} - { folder, subfolder (опционально) }
 */
function determineFileType(name) {
  const upperName = name.toUpperCase();

  // Приоритет 1: PATCH
  if (upperName.includes('PATCH')) {
    // Определяем подтип патча
    if (upperName.includes('STRUCTURAL')) {
      return { folder: 'patches', subfolder: 'structural' };
    }
    if (upperName.includes('MUSCLE')) {
      return { folder: 'patches', subfolder: 'muscle' };
    }
    if (upperName.includes('FAT')) {
      return { folder: 'patches', subfolder: 'fat' };
    }
    if (upperName.includes('NEURAL')) {
      return { folder: 'patches', subfolder: 'neural' };
    }
    // Патч без подтипа
    return { folder: 'patches' };
  }

  // Приоритет 2: PROTOCOL
  if (upperName.includes('PROTOCOL')) {
    return { folder: 'protocols' };
  }

  // Приоритет 3: SCENARIO
  if (upperName.includes('SCENARIO')) {
    return { folder: 'scenarios' };
  }

  // Приоритет 4: CORE / ARCHITECTOR
  if (upperName.includes('ARCHITECTOR') || upperName.includes('CORE')) {
    return { folder: 'core' };
  }

  // Приоритет 5: PROJECT (только если имя начинается с ключевого слова)
  if (upperName.startsWith('PROJECT') ||
      upperName.startsWith('LEO_') ||
      upperName.startsWith('MATH_')) {
    return { folder: 'projects' };
  }

  // Default: misc
  return { folder: 'misc' };
}

/**
 * Получить полный путь для сохранения файла (папку)
 * Если имя содержит явный путь с разрешённой корневой папкой — используется он,
 * иначе применяется автороутинг по ключевым словам.
 * @param {string} name - Имя файла
 * @returns {string} - Полный путь к папке
 */
function getStoragePath(name) {
  if (hasExplicitPath(name)) {
    const cleaned = normalizeName(name);
    // Берём только директорию из явного пути
    const dir = path.dirname(cleaned);
    return path.join(STORAGE_BASE, dir);
  }

  const { folder, subfolder } = determineFileType(name);

  if (subfolder) {
    return path.join(STORAGE_BASE, folder, subfolder);
  }

  return path.join(STORAGE_BASE, folder);
}

/**
 * Получить полное имя файла с расширением
 * @param {string} name - Имя файла (без расширения)
 * @returns {string} - Имя файла с .txt
 */
function getFullFileName(name) {
  // Достаём только базовое имя, если пришёл путь
  const base = path.basename(name);
  if (base.includes('.')) {
    return base;
  }
  return `${base}.txt`;
}

/**
 * Получить полный путь к файлу
 * Если имя содержит явный путь с разрешённой корневой папкой — он используется целиком,
 * иначе автороутинг размещает файл в соответствующую папку.
 * @param {string} name - Имя файла
 * @returns {string} - Полный путь к файлу
 */
function getFullPath(name) {
  if (hasExplicitPath(name)) {
    const cleaned = normalizeName(name);
    // Для явного пути сохраняем имя файла как есть (с добавлением .txt если нет расширения)
    const dir = path.dirname(cleaned);
    const base = path.basename(cleaned);
    const fileName = base.includes('.') ? base : `${base}.txt`;
    return path.join(STORAGE_BASE, dir, fileName);
  }

  const dirPath = getStoragePath(name);
  const fileName = getFullFileName(name);
  return path.join(dirPath, fileName);
}

/**
 * Получить статистику роутера
 * @returns {object} - Статистика
 */
function getRouterStats() {
  return {
    storageBase: STORAGE_BASE,
    rules: [
      { keyword: 'PATCH', folder: 'patches', subfolders: ['structural', 'muscle', 'fat', 'neural'] },
      { keyword: 'PROTOCOL', folder: 'protocols' },
      { keyword: 'SCENARIO', folder: 'scenarios' },
      { keyword: 'ARCHITECTOR/CORE', folder: 'core' },
      { keyword: 'PROJECT/LEO/MATH', folder: 'projects' },
      { keyword: 'DEFAULT', folder: 'misc' }
    ]
  };
}

module.exports = {
  determineFileType,
  getStoragePath,
  getFullFileName,
  getFullPath,
  getRouterStats,
  hasExplicitPath,
  normalizeName,
  STORAGE_BASE
};
