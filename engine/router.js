/**
 * Router - Детекция сценариев по сообщению
 * Определяет эмоциональное состояние пользователя
 */

/**
 * Детектирует сценарий по тексту сообщения
 * @param {string} message - Текст сообщения
 * @returns {string} - Название сценария
 */
function detectScenario(message) {
  const text = message.toLowerCase();

  // Перегрузка / эмоциональное напряжение
  if (text.includes("плохо") || 
      text.includes("не могу") || 
      text.includes("накрыло") ||
      text.includes("тяжело") ||
      text.includes("устал")) {
    return "OVERLOAD";
  }

  // Сопротивление / нежелание
  if (text.includes("не хочу") || 
      text.includes("не буду") ||
      text.includes("отказ")) {
    return "RESISTANCE";
  }

  // Непонимание
  if (text.includes("не понимаю") || 
      text.includes("не ясно") ||
      text.includes("запутался")) {
    return "NO_UNDERSTANDING";
  }

  // Внутренний конфликт
  if (text.includes("должен") || 
      text.includes("надо") ||
      text.includes("обязан")) {
    return "CONFLICT";
  }

  // Тревога / страх
  if (text.includes("боюсь") || 
      text.includes("страшно") ||
      text.includes("тревога")) {
    return "ANXIETY";
  }

  // Стандартный сценарий
  return "NORMAL";
}

/**
 * Получение конфигурации сценария
 * @param {string} scenario - Название сценария
 * @returns {object} - Конфигурация сценария
 */
function getScenarioConfig(scenario) {
  const configs = {
    OVERLOAD: {
      priority: "high",
      approach: "grounding",
      description: "Эмоциональная перегрузка"
    },
    RESISTANCE: {
      priority: "medium",
      approach: "exploration",
      description: "Сопротивление действию"
    },
    NO_UNDERSTANDING: {
      priority: "medium",
      approach: "clarification",
      description: "Отсутствие понимания"
    },
    CONFLICT: {
      priority: "high",
      approach: "values_alignment",
      description: "Внутренний конфликт"
    },
    ANXIETY: {
      priority: "high",
      approach: "calming",
      description: "Тревожное состояние"
    },
    NORMAL: {
      priority: "low",
      approach: "standard",
      description: "Стандартный режим"
    }
  };

  return configs[scenario] || configs.NORMAL;
}

module.exports = { 
  detectScenario,
  getScenarioConfig
};
