/**
 * Проект MATH - Математический ассистент
 */

/**
 * Улучшение сообщения перед отправкой в AI
 * @param {string} message - Исходное сообщение
 * @param {string} userId - ID пользователя
 * @returns {string} - Улучшенное сообщение
 */
function enhanceMessage(message, userId) {
  // Добавляем математический контекст
  return `Математическая задача или вопрос. Объясни пошагово и понятно: ${message}`;
}

/**
 * Обработка ответа AI
 * @param {string} response - Ответ от AI
 * @param {string} scenario - Сценарий
 * @returns {string} - Финальный ответ
 */
function processResponse(response, scenario) {
  // Для непонимания добавляем ободрение
  if (scenario === "NO_UNDERSTANDING") {
    return `📐 ${response}\n\n💡 Если что-то непонятно — спрашивайте, разберём ещё раз!`;
  }

  return response;
}

/**
 * Конфигурация проекта
 */
const config = {
  name: "MATH",
  description: "Математический ассистент",
  defaultScenario: "NORMAL",
  priorityScenarios: ["NO_UNDERSTANDING", "RESISTANCE"]
};

module.exports = {
  enhanceMessage,
  processResponse,
  config
};
