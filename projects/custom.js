/**
 * Проект CUSTOM - Универсальный проект
 * Используется по умолчанию для неизвестных проектов
 */

/**
 * Улучшение сообщения перед отправкой в AI
 * @param {string} message - Исходное сообщение
 * @param {string} userId - ID пользователя
 * @returns {string} - Улучшенное сообщение
 */
function enhanceMessage(message, userId) {
  return message;
}

/**
 * Обработка ответа AI
 * @param {string} response - Ответ от AI
 * @param {string} scenario - Сценарий
 * @returns {string} - Финальный ответ
 */
function processResponse(response, scenario) {
  return response;
}

/**
 * Конфигурация проекта
 */
const config = {
  name: "CUSTOM",
  description: "Универсальный проект",
  defaultScenario: "NORMAL",
  priorityScenarios: []
};

module.exports = {
  enhanceMessage,
  processResponse,
  config
};
