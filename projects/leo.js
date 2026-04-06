/**
 * Проект LEO - Эмоциональная поддержка и осознанность
 */

/**
 * Улучшение сообщения перед отправкой в AI
 * @param {string} message - Исходное сообщение
 * @param {string} userId - ID пользователя
 * @returns {string} - Улучшенное сообщение
 */
function enhanceMessage(message, userId) {
  // Добавляем контекст для AI
  return `Пользователь обращается за поддержкой. Контекст: ${message}`;
}

/**
 * Обработка ответа AI
 * @param {string} response - Ответ от AI
 * @param {string} scenario - Сценарий
 * @returns {string} - Финальный ответ
 */
function processResponse(response, scenario) {
  // Для сценариев перегрузки добавляем заботливый тон
  if (scenario === "OVERLOAD" || scenario === "ANXIETY") {
    return `🌿 ${response}\n\nПомните: вы не одиноки. Дышите.`;
  }

  return response;
}

/**
 * Конфигурация проекта
 */
const config = {
  name: "LEO",
  description: "Эмоциональная поддержка и осознанность",
  defaultScenario: "NORMAL",
  priorityScenarios: ["OVERLOAD", "ANXIETY", "CONFLICT"]
};

module.exports = {
  enhanceMessage,
  processResponse,
  config
};
