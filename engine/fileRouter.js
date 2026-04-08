/**
 * File Router System — Автоматическое распределение файлов
 * Определяет путь сохранения на основе имени файла
 */

const path = require('path');

// Базовая директория хранения
const STORAGE_BASE = path.join(__dirname, '..', 'storage');

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
 * Получить полный путь для сохранения файла
 * @param {string} name - Имя файла
 * @returns {string} - Полный путь к папке
 */
function getStoragePath(name) {
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
  // Если уже есть расширение, не добавляем
  if (name.includes('.')) {
    return name;
  }
  return `${name}.txt`;
}

/**
 * Получить полный путь к файлу
 * @param {string} name - Имя файла
 * @returns {string} - Полный путь к файлу
 */
function getFullPath(name) {
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
  STORAGE_BASE
};
