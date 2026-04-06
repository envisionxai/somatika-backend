/**
 * File Manager — Управление сохранением файлов
 * Сохраняет файлы в соответствующие папки на основе FILE_ROUTING_SYSTEM
 */

const fs = require('fs');
const path = require('path');
const { getFullPath, getStoragePath, STORAGE_BASE } = require('./fileRouter');

/**
 * Убедиться, что директория существует
 * @param {string} dirPath - Путь к директории
 */
function ensureDirectory(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
    console.log(`📁 Created directory: ${dirPath}`);
  }
}

/**
 * Сохранить файл
 * @param {string} name - Имя файла
 * @param {string} content - Содержание файла
 * @returns {object} - Результат сохранения
 */
function saveFile(name, content) {
  try {
    // Получить полный путь
    const fullPath = getFullPath(name);
    const dirPath = getStoragePath(name);
    
    // Убедиться, что директория существует
    ensureDirectory(dirPath);
    
    // Записать файл
    fs.writeFileSync(fullPath, content, 'utf8');
    
    console.log(`💾 File saved: ${name} → ${fullPath}`);
    
    return {
      success: true,
      name,
      path: fullPath,
      relativePath: path.relative(STORAGE_BASE, fullPath),
      size: Buffer.byteLength(content, 'utf8')
    };
  } catch (error) {
    console.error('File save error:', error);
    throw error;
  }
}

/**
 * Прочитать файл
 * @param {string} name - Имя файла
 * @returns {string} - Содержание файла
 */
function readFile(name) {
  try {
    const fullPath = getFullPath(name);
    
    if (!fs.existsSync(fullPath)) {
      throw new Error(`File not found: ${name}`);
    }
    
    return fs.readFileSync(fullPath, 'utf8');
  } catch (error) {
    console.error('File read error:', error);
    throw error;
  }
}

/**
 * Проверить существование файла
 * @param {string} name - Имя файла
 * @returns {boolean} - Существует ли файл
 */
function fileExists(name) {
  const fullPath = getFullPath(name);
  return fs.existsSync(fullPath);
}

/**
 * Удалить файл
 * @param {string} name - Имя файла
 * @returns {boolean} - Успешность удаления
 */
function deleteFile(name) {
  try {
    const fullPath = getFullPath(name);
    
    if (!fs.existsSync(fullPath)) {
      return false;
    }
    
    fs.unlinkSync(fullPath);
    console.log(`🗑️ File deleted: ${name}`);
    return true;
  } catch (error) {
    console.error('File delete error:', error);
    throw error;
  }
}

/**
 * Получить список всех файлов в хранилище
 * @param {string} folder - Опционально: фильтровать по папке
 * @returns {Array} - Список файлов
 */
function getAllFiles(folder = null) {
  const result = [];
  
  let searchPath = STORAGE_BASE;
  if (folder) {
    searchPath = path.join(STORAGE_BASE, folder);
  }
  
  if (!fs.existsSync(searchPath)) {
    return result;
  }
  
  function scanDirectory(dirPath, relativePath = '') {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    
    for (const entry of entries) {
      const currentRelativePath = relativePath 
        ? path.join(relativePath, entry.name) 
        : entry.name;
      
      if (entry.isDirectory()) {
        scanDirectory(path.join(dirPath, entry.name), currentRelativePath);
      } else if (entry.isFile()) {
        const fullPath = path.join(dirPath, entry.name);
        const stats = fs.statSync(fullPath);
        
        result.push({
          name: entry.name,
          relativePath: currentRelativePath,
          fullPath,
          size: stats.size,
          createdAt: stats.birthtime.toISOString(),
          modifiedAt: stats.mtime.toISOString()
        });
      }
    }
  }
  
  scanDirectory(searchPath);
  
  return result;
}

/**
 * Получить статистику файлового менеджера
 * @returns {object} - Статистика
 */
function getStats() {
  const files = getAllFiles();
  const totalSize = files.reduce((sum, file) => sum + file.size, 0);
  
  return {
    totalFiles: files.length,
    totalSize,
    storageBase: STORAGE_BASE,
    files
  };
}

module.exports = {
  saveFile,
  readFile,
  fileExists,
  deleteFile,
  getAllFiles,
  getStats,
  ensureDirectory
};
