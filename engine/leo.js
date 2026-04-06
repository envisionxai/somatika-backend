/**
 * Leo Engine - Основной движок обработки сообщений
 * Маршрутизация между патчами и AI
 */

const { detectScenario, getScenarioConfig } = require("./router");
const { matchPatch } = require("./patchManager");
const { callAI } = require("../services/ai");

// Загрузка проектов
const projects = {
  leo: require("../projects/leo"),
  math: require("../projects/math"),
  custom: require("../projects/custom")
};

/**
 * Обработка сообщения пользователя
 * @param {string} userId - ID пользователя
 * @param {string} project - Название проекта
 * @param {string} message - Текст сообщения
 * @returns {object} - Результат обработки
 */
async function processMessage(userId, project, message) {
  console.log(`📨 Processing: [${project}] ${userId}: "${message}"`);

  // 1. Детекция сценария
  const scenario = detectScenario(message);
  const scenarioConfig = getScenarioConfig(scenario);

  console.log(`🎯 Scenario: ${scenario} (${scenarioConfig.description})`);

  // 2. Проверка патчей (имеют приоритет)
  const patch = matchPatch(message, project);

  if (patch) {
    console.log(`✅ Patch matched: ${patch.name}`);
    
    // Выбираем первый шаг или случайный из шагов
    const step = patch.steps[0];
    
    return {
      reply: step,
      type: "patch",
      patchName: patch.name,
      scenario,
      scenarioConfig
    };
  }

  // 3. Получение проектной логики
  const projectLogic = projects[project] || projects.custom;
  
  // 4. Применение проектных модификаторов
  const enhancedMessage = projectLogic.enhanceMessage 
    ? projectLogic.enhanceMessage(message, userId)
    : message;

  // 5. Вызов AI
  console.log(`🤖 Calling AI for project: ${project}`);
  const aiReply = await callAI(enhancedMessage, project, scenario);

  // 6. Постобработка ответа
  const finalReply = projectLogic.processResponse
    ? projectLogic.processResponse(aiReply, scenario)
    : aiReply;

  return {
    reply: finalReply,
    type: "ai",
    scenario,
    scenarioConfig,
    model: "gpt-4o-mini"
  };
}

/**
 * Получение статистики движка
 * @returns {object} - Статистика
 */
function getEngineStats() {
  return {
    projects: Object.keys(projects),
    loaded: true
  };
}

module.exports = { 
  processMessage,
  getEngineStats
};
