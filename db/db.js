/**
 * Database Service - SQLite (локальное хранилище)
 * Данные сохраняются в файл somatika.db
 */

const Database = require('better-sqlite3');
const path = require('path');

// Путь к базе данных (в папке проекта)
const DB_PATH = path.join(__dirname, '..', 'somatika.db');

// Инициализация подключения
const db = new Database(DB_PATH);

// Включение внешнего ключа
db.pragma('foreign_keys = ON');

// Создание таблиц при инициализации
db.exec(`
  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    userId TEXT NOT NULL,
    project TEXT NOT NULL,
    message TEXT NOT NULL,
    reply TEXT NOT NULL,
    type TEXT NOT NULL,
    scenario TEXT,
    patchName TEXT,
    timestamp TEXT NOT NULL
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    userId TEXT PRIMARY KEY,
    firstSeen TEXT NOT NULL,
    lastActive TEXT NOT NULL,
    messageCount INTEGER DEFAULT 0
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS patches (
    id TEXT PRIMARY KEY,
    project TEXT NOT NULL,
    name TEXT NOT NULL,
    triggers TEXT NOT NULL,
    steps TEXT NOT NULL,
    active INTEGER DEFAULT 1,
    createdAt TEXT NOT NULL,
    deactivatedAt TEXT
  )
`);

// Индексы для ускорения поиска
db.exec(`
  CREATE INDEX IF NOT EXISTS idx_messages_user ON messages(userId)
`);
db.exec(`
  CREATE INDEX IF NOT EXISTS idx_messages_project ON messages(project)
`);
db.exec(`
  CREATE INDEX IF NOT EXISTS idx_patches_project ON patches(project, active)
`);

console.log('✅ Database initialized:', DB_PATH);

/**
 * Сохранение сообщения
 * @param {object} messageData - Данные сообщения
 * @returns {object} - Сохранённое сообщение с ID
 */
function saveMessage(messageData) {
  const stmt = db.prepare(`
    INSERT INTO messages (userId, project, message, reply, type, scenario, patchName, timestamp)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const result = stmt.run(
    messageData.userId,
    messageData.project,
    messageData.message,
    messageData.reply,
    messageData.type,
    messageData.scenario || null,
    messageData.patchName || null,
    messageData.timestamp
  );

  // Обновление статистики пользователя
  updateUser(messageData.userId, messageData.timestamp);

  console.log(`💾 Message saved: ${result.lastInsertRowid}`);

  return {
    id: result.lastInsertRowid,
    ...messageData
  };
}

/**
 * Обновление данных пользователя
 * @param {string} userId - ID пользователя
 * @param {string} timestamp - Время активности
 */
function updateUser(userId, timestamp) {
  const existing = db.prepare('SELECT * FROM users WHERE userId = ?').get(userId);

  if (existing) {
    db.prepare(`
      UPDATE users 
      SET lastActive = ?, messageCount = messageCount + 1 
      WHERE userId = ?
    `).run(timestamp, userId);
  } else {
    db.prepare(`
      INSERT INTO users (userId, firstSeen, lastActive, messageCount)
      VALUES (?, ?, ?, 1)
    `).run(userId, timestamp, timestamp);
  }
}

/**
 * Получение сообщений пользователя
 * @param {string} userId - ID пользователя
 * @param {string} project - Опционально фильтр по проекту
 * @param {number} limit - Лимит записей
 * @returns {array} - Массив сообщений
 */
function getMessagesByUser(userId, project = null, limit = 50) {
  let query = 'SELECT * FROM messages WHERE userId = ?';
  const params = [userId];

  if (project) {
    query += ' AND project = ?';
    params.push(project);
  }

  query += ' ORDER BY timestamp DESC LIMIT ?';
  params.push(limit);

  const stmt = db.prepare(query);
  return stmt.all(...params);
}

/**
 * Получение пользователя
 * @param {string} userId - ID пользователя
 * @returns {object|null} - Данные пользователя
 */
function getUser(userId) {
  const stmt = db.prepare('SELECT * FROM users WHERE userId = ?');
  return stmt.get(userId) || null;
}

/**
 * Статистика базы данных
 * @returns {object} - Статистика
 */
function getStats() {
  const totalMessages = db.prepare('SELECT COUNT(*) as count FROM messages').get().count;
  const totalUsers = db.prepare('SELECT COUNT(*) as count FROM users').get().count;
  
  const messagesByProject = db.prepare(`
    SELECT project, COUNT(*) as count 
    FROM messages 
    GROUP BY project
  `).all();

  return {
    totalMessages,
    totalUsers,
    messagesByProject: Object.fromEntries(
      messagesByProject.map(p => [p.project, p.count])
    )
  };
}

/**
 * Получение всех сообщений (для админки)
 * @param {number} limit - Лимит записей
 * @returns {array} - Массив сообщений
 */
function getAllMessages(limit = 100) {
  const stmt = db.prepare(`
    SELECT * FROM messages 
    ORDER BY timestamp DESC 
    LIMIT ?
  `);
  return stmt.all(limit);
}

/**
 * Очистка старых сообщений
 * @param {number} olderThanDays - Удалять сообщения старше N дней
 * @returns {number} - Количество удалённых
 */
function cleanupOldMessages(olderThanDays = 30) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - olderThanDays);
  const cutoffStr = cutoff.toISOString();

  const stmt = db.prepare('DELETE FROM messages WHERE timestamp < ?');
  const result = stmt.run(cutoffStr);

  console.log(`🧹 Cleaned up ${result.changes} old messages`);
  return result.changes;
}

/**
 * Сохранение патча (для постоянного хранения)
 * @param {object} patch - Объект патча
 */
function savePatch(patch) {
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO patches (id, project, name, triggers, steps, active, createdAt, deactivatedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    patch.id,
    patch.project,
    patch.name,
    JSON.stringify(patch.triggers),
    JSON.stringify(patch.steps),
    patch.active ? 1 : 0,
    patch.createdAt,
    patch.deactivatedAt || null
  );
}

/**
 * Загрузка патчей из БД
 * @returns {array} - Массив патчей
 */
function loadPatches() {
  const stmt = db.prepare('SELECT * FROM patches');
  const rows = stmt.all();

  return rows.map(row => ({
    ...row,
    triggers: JSON.parse(row.triggers),
    steps: JSON.parse(row.steps),
    active: row.active === 1
  }));
}

/**
 * Закрытие соединения (при остановке сервера)
 */
function close() {
  db.close();
  console.log('📦 Database closed');
}

// Обработка завершения процесса
process.on('SIGINT', () => {
  close();
  process.exit();
});

module.exports = {
  saveMessage,
  getMessagesByUser,
  getUser,
  getStats,
  getAllMessages,
  cleanupOldMessages,
  savePatch,
  loadPatches,
  close,
  db // Экспорт для прямого доступа при необходимости
};
