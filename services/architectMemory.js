/**
 * Architect Memory — Система памяти для Архитектора
 *
 * 3 уровня:
 * 1. Short-term memory — последние N сообщений из БД
 * 2. Semantic memory — смысловая выжимка в файле
 * 3. Owner profile — профиль владельца в файле
 */

const fs = require("fs");
const path = require("path");
const fetch = require("node-fetch");
const { getMessagesByUser } = require("../db/db");

const MEMORY_DIR = path.join(__dirname, "..", "storage", "memory");
const OPENAI_API_URL = "https://api.openai.com/v1/chat/completions";

/**
 * Убедиться, что директория memory существует
 */
function ensureMemoryDir() {
  if (!fs.existsSync(MEMORY_DIR)) {
    fs.mkdirSync(MEMORY_DIR, { recursive: true });
  }
}

// --- SHORT-TERM MEMORY ---

/**
 * Получить последние сообщения пользователя с архитектором
 * @param {string} userId
 * @param {number} limit — максимум сообщений
 * @returns {string} — форматированная история
 */
function getRecentHistory(userId, limit = 10) {
  const messages = getMessagesByUser(userId, "architect", limit);

  if (!messages || messages.length === 0) {
    return "";
  }

  // messages из БД приходят в порядке DESC, разворачиваем
  const ordered = [...messages].reverse();

  return ordered
    .map(m => `user: ${m.message}\nassistant: ${m.reply}`)
    .join("\n\n");
}

// --- SEMANTIC MEMORY ---

/**
 * Путь к файлу семантической памяти пользователя
 * @param {string} userId
 * @returns {string}
 */
function getMemoryFilePath(userId) {
  return path.join(MEMORY_DIR, `${userId}_memory.txt`);
}

/**
 * Прочитать семантическую память
 * @param {string} userId
 * @returns {string}
 */
function getSemanticMemory(userId) {
  ensureMemoryDir();
  const filePath = getMemoryFilePath(userId);

  if (!fs.existsSync(filePath)) {
    return "";
  }

  return fs.readFileSync(filePath, "utf8");
}

/**
 * Обновить семантическую память после диалога
 * Делает вызов к AI для генерации обновлённого резюме
 * @param {string} userId
 * @param {string} userMessage — последнее сообщение пользователя
 * @param {string} assistantReply — последний ответ архитектора
 */
async function updateSemanticMemory(userId, userMessage, assistantReply) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return;

  ensureMemoryDir();
  const currentMemory = getSemanticMemory(userId);
  const filePath = getMemoryFilePath(userId);

  const prompt = `Ты — модуль памяти AI-системы. Твоя задача: обновить резюме памяти.

ТЕКУЩАЯ ПАМЯТЬ:
${currentMemory || "(пусто)"}

НОВЫЙ ДИАЛОГ:
user: ${userMessage}
assistant: ${assistantReply}

ИНСТРУКЦИИ:
- Обнови резюме памяти, добавив важную информацию из нового диалога
- Убери устаревшее или неактуальное
- Оставь только то, что влияет на систему: решения, задачи, проблемы, изменения
- НЕ сохраняй эмоции, повторы, мусор
- Максимум 500 слов
- Формат: краткие пункты

Верни ТОЛЬКО обновлённый текст памяти, без пояснений.`;

  try {
    const response = await fetch(OPENAI_API_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || "gpt-5",
        messages: [
          { role: "user", content: prompt }
        ],
        temperature: 0.3,
        max_tokens: 800
      })
    });

    if (!response.ok) {
      console.error("Memory update API error:", response.status);
      return;
    }

    const data = await response.json();
    const updatedMemory = data.choices[0].message.content;

    fs.writeFileSync(filePath, updatedMemory, "utf8");
    console.log(`🧠 Semantic memory updated for user: ${userId}`);
  } catch (error) {
    console.error("Memory update error:", error.message);
  }
}

// --- OWNER PROFILE ---

/**
 * Путь к файлу профиля пользователя
 * @param {string} userId
 * @returns {string}
 */
function getProfileFilePath(userId) {
  return path.join(MEMORY_DIR, `${userId}_profile.txt`);
}

/**
 * Прочитать профиль владельца
 * @param {string} userId
 * @returns {string}
 */
function getOwnerProfile(userId) {
  ensureMemoryDir();
  const filePath = getProfileFilePath(userId);

  if (!fs.existsSync(filePath)) {
    return "";
  }

  return fs.readFileSync(filePath, "utf8");
}

// --- CONTEXT BUILDER ---

/**
 * Собрать полный контекст памяти для промпта архитектора
 * @param {string} userId
 * @returns {object} — { ownerProfile, semanticMemory, recentHistory }
 */
function buildMemoryContext(userId) {
  return {
    ownerProfile: getOwnerProfile(userId),
    semanticMemory: getSemanticMemory(userId),
    recentHistory: getRecentHistory(userId, 10)
  };
}

module.exports = {
  getRecentHistory,
  getSemanticMemory,
  updateSemanticMemory,
  getOwnerProfile,
  buildMemoryContext,
  ensureMemoryDir
};
