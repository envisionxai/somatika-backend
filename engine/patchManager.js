/**
 * Patch Manager - Управление патчами
 * Хранит и применяет патчи для различных сценариев
 */

const { savePatch, loadPatches } = require('../db/db');

// Хранилище патчей в памяти (загружается из БД)
let patches = [];

/**
 * Инициализация - загрузка патчей из БД
 */
function init() {
  patches = loadPatches();
  console.log(`📦 Loaded ${patches.length} patches from database`);
}

/**
 * Добавление патча
 * @param {object} patch - Объект патча
 */
function addPatch(patch) {
  patches.push(patch);
  savePatch(patch); // Сохраняем в БД
  console.log(`📦 Patch saved: ${patch.name} (${patch.project}) - ${patch.triggers.length} triggers`);
}

/**
 * Получение патчей по проекту
 * @param {string} project - Название проекта
 * @param {boolean} activeOnly - Только активные патчи
 * @returns {array} - Массив патчей
 */
function getPatches(project, activeOnly = true) {
  return patches.filter(p => {
    if (activeOnly && !p.active) return false;
    return p.project === project;
  });
}

/**
 * Получение всех патчей
 * @param {string} project - Опционально фильтр по проекту
 * @returns {array} - Массив патчей
 */
function getAllPatches(project) {
  if (!project) {
    return [...patches];
  }
  return getPatches(project, false);
}

/**
 * Поиск подходящего патча по сообщению
 * @param {string} message - Текст сообщения
 * @param {string} project - Название проекта
 * @returns {object|null} - Найденный патч или null
 */
function matchPatch(message, project) {
  const list = getPatches(project);
  const messageLower = message.toLowerCase();

  // Ищем патч с наивысшим приоритетом
  const matched = list.find(p =>
    p.triggers.some(t => messageLower.includes(t.toLowerCase()))
  );

  return matched || null;
}

/**
 * Деактивация патча по ID
 * @param {string} id - ID патча
 * @returns {boolean} - Успешность операции
 */
function deactivatePatch(id) {
  const index = patches.findIndex(p => p.id === id);
  
  if (index === -1) {
    return false;
  }

  patches[index].active = false;
  patches[index].deactivatedAt = new Date().toISOString();
  
  // Обновляем в БД
  savePatch(patches[index]);
  
  return true;
}

/**
 * Статистика патчей
 * @returns {object} - Статистика
 */
function getStats() {
  const total = patches.length;
  const active = patches.filter(p => p.active).length;
  const byProject = {};

  patches.forEach(p => {
    byProject[p.project] = (byProject[p.project] || 0) + 1;
  });

  return {
    total,
    active,
    inactive: total - active,
    byProject
  };
}

module.exports = { 
  init,
  addPatch, 
  matchPatch, 
  getAllPatches,
  deactivatePatch,
  getStats
};
