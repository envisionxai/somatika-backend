/**
 * AI Service - Работа с OpenAI API
 */

const fetch = require("node-fetch");

const OPENAI_API_URL = "https://api.openai.com/v1/chat/completions";

/**
 * Системные промпты для разных проектов
 */
const SYSTEM_PROMPTS = {
  leo: `Ты - поддерживающий AI-ассистент проекта LEO.
Твоя задача: помогать пользователям осознавать свои состояния, мягко направлять.
Стиль: тёплый, эмпатичный, без оценок.
Избегай: советов, критики, сложных терминов.`,

  math: `Ты - AI-ассистент проекта MATH.
Твоя задача: помогать с математическими задачами, объяснять понятно.
Стиль: чёткий, структурированный, с примерами.
Показывай решения пошагово.`,

  custom: `Ты - универсальный AI-ассистент.
Твоя задача: помогать пользователю в различных вопросах.
Стиль: дружелюбный, полезный, точный.`
};

/**
 * Вызов OpenAI API
 * @param {string} message - Сообщение пользователя
 * @param {string} project - Проект
 * @param {string} scenario - Сценарий
 * @returns {string} - Ответ AI
 */
async function callAI(message, project = "custom", scenario = "NORMAL") {
  const apiKey = process.env.OPENAI_API_KEY;

  const systemPrompt = SYSTEM_PROMPTS[project] || SYSTEM_PROMPTS.custom;

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
          { role: "developer", content: systemPrompt },
          { role: "user", content: message }
        ],
        max_completion_tokens: 4000
      })
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenAI API error: ${response.status} - ${error}`);
    }

    const data = await response.json();
    return data.choices[0].message.content;

  } catch (error) {
    console.error("AI Service error:", error.message);
    throw error;
  }
}

/**
 * Mock-ответ при отсутствии API ключа
 */
function getMockResponse(message, project, scenario) {
  const mocks = {
    leo: "Понимаю ваше состояние. Давайте вместе разберёмся, что происходит.",
    math: "Давайте разберём эту задачу пошагово. Что именно нужно найти?",
    custom: "Я понял ваш вопрос. Вот что я думаю по этому поводу..."
  };

  return mocks[project] || mocks.custom;
}

module.exports = { callAI };
