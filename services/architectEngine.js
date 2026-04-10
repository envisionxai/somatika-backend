const fs = require("fs");
const path = require("path");
const fetch = require("node-fetch");
const { executeAllFileActions, formatFileOpsPostscript } = require("../engine/fileActions");

const STORAGE_PATH = path.join(__dirname, "..", "storage");
const OPENAI_API_URL = "https://api.openai.com/v1/chat/completions";

// Поддерживаемые текстовые расширения для чтения файлов пользователя
const READABLE_EXTENSIONS = new Set([
  ".txt", ".md", ".json", ".yaml", ".yml", ".csv", ".log",
  ".js", ".ts", ".py", ".html", ".css", ".xml", ".ini", ".conf"
]);

function isReadableFile(fileName) {
  const lower = fileName.toLowerCase();
  const ext = path.extname(lower);
  if (ext === "") return true; // файлы без расширения — читаем
  return READABLE_EXTENSIONS.has(ext);
}

function readFolder(folderName) {
  const folderPath = path.join(STORAGE_PATH, folderName);
  if (!fs.existsSync(folderPath)) return "";
  const files = fs.readdirSync(folderPath).filter(f => f.endsWith(".txt")).sort();
  return files.map(f => fs.readFileSync(path.join(folderPath, f), "utf-8")).join("\n\n");
}

function scanStorageStructure() {
  const folders = ["core", "protocols", "scenarios", "patches", "misc", "projects"];
  const structure = {};
  for (const folder of folders) {
    const folderPath = path.join(STORAGE_PATH, folder);
    if (fs.existsSync(folderPath)) {
      const files = [];
      function scan(dir, prefix) {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const e of entries) {
          if (e.isDirectory()) scan(path.join(dir, e.name), prefix + e.name + "/");
          else files.push(prefix + e.name);
        }
      }
      scan(folderPath, "");
      structure[folder] = files;
    }
  }
  return structure;
}

/**
 * Рекурсивно читает файлы из папки с умным лимитом.
 *
 * ФИКС post-2026-04-09: старый readFolderLimited не был рекурсивным, читал только .txt,
 * и при первом большом файле обрезал всё остальное на `break`. В результате AI физически
 * не видел большинства файлов в misc/, но промпт уверял его в обратном — и AI галлюцинировал.
 *
 * Новая логика:
 * 1. Рекурсивный обход всех подпапок
 * 2. Читаем все текстовые расширения из READABLE_EXTENSIONS
 * 3. Сортировка по размеру (меньшие сначала) — чтобы маленькие файлы гарантированно попали
 * 4. Per-file лимит: большие файлы обрезаются head+tail, а не отбрасываются целиком
 * 5. Per-folder лимит: если бюджет исчерпан, файл отмечается included=false, но остаётся в индексе
 * 6. Возвращается и content, и file index metadata — для UPLOADED FILES INDEX блока в промпте
 *
 * @param {string} folderName — имя папки относительно storage/
 * @param {object} opts — { maxFileChars, maxTotalChars }
 * @returns {{ content: string, files: Array<{relPath, size, included, truncated, reason?}> }}
 */
function readFolderRecursive(folderName, opts) {
  opts = opts || {};
  const maxFileChars = opts.maxFileChars || 12000;
  const maxTotalChars = opts.maxTotalChars || 80000;

  const folderPath = path.join(STORAGE_PATH, folderName);
  if (!fs.existsSync(folderPath)) {
    return { content: "", files: [] };
  }

  // Собрать все файлы рекурсивно
  const allFiles = [];
  function walk(dir, relPrefix) {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (e) {
      return;
    }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      const rel = relPrefix ? `${relPrefix}/${e.name}` : e.name;
      if (e.isDirectory()) {
        walk(full, rel);
      } else if (e.isFile()) {
        if (!isReadableFile(e.name)) continue;
        let stats;
        try {
          stats = fs.statSync(full);
        } catch (err) {
          continue;
        }
        allFiles.push({ relPath: rel, fullPath: full, size: stats.size });
      }
    }
  }
  walk(folderPath, "");

  // Сортировка: сначала маленькие, чтобы они гарантированно попали в контекст
  allFiles.sort((a, b) => a.size - b.size);

  let totalChars = 0;
  const parts = [];
  const fileMeta = [];

  for (const f of allFiles) {
    // Если общий бюджет уже исчерпан — отмечаем как "не в контексте"
    if (totalChars >= maxTotalChars) {
      fileMeta.push({
        relPath: f.relPath,
        size: f.size,
        included: false,
        truncated: false,
        reason: "budget exhausted"
      });
      continue;
    }

    let content;
    try {
      content = fs.readFileSync(f.fullPath, "utf-8");
    } catch (e) {
      fileMeta.push({
        relPath: f.relPath,
        size: f.size,
        included: false,
        truncated: false,
        reason: "read error: " + e.message
      });
      continue;
    }

    let included = content;
    let truncated = false;

    // Per-file лимит: head + tail, если файл больше лимита
    if (included.length > maxFileChars) {
      const headLen = Math.floor(maxFileChars * 0.8);
      const tailLen = Math.floor(maxFileChars * 0.2);
      const head = included.substring(0, headLen);
      const tail = included.substring(included.length - tailLen);
      included = head +
        `\n\n[... ФАЙЛ ОБРЕЗАН — реальный размер ${f.size} байт, показано ~${maxFileChars} симв (начало + конец) ...]\n\n` +
        tail;
      truncated = true;
    }

    // Total budget check — если не влезает даже обрезанный
    if (totalChars + included.length > maxTotalChars) {
      const remaining = maxTotalChars - totalChars;
      if (remaining < 500) {
        fileMeta.push({
          relPath: f.relPath,
          size: f.size,
          included: false,
          truncated: false,
          reason: "budget exhausted"
        });
        continue;
      }
      included = included.substring(0, remaining) + `\n[... ОБРЕЗАНО ПО ОБЩЕМУ ЛИМИТУ ПАПКИ ...]`;
      truncated = true;
    }

    parts.push(`--- ${f.relPath} (${f.size} bytes${truncated ? ", TRUNCATED" : ""}) ---\n${included}`);
    totalChars += included.length;
    fileMeta.push({
      relPath: f.relPath,
      size: f.size,
      included: true,
      truncated
    });
  }

  return { content: parts.join("\n\n"), files: fileMeta };
}

/**
 * Сформировать человекочитаемый индекс файлов для инъекции в промпт.
 * AI должен точно знать: какие файлы есть, какие обрезаны, какие вообще не в контексте.
 */
function formatFileIndex(folderName, files) {
  if (!files || files.length === 0) {
    return `(папка ${folderName}/ пуста или недоступна)`;
  }
  const lines = files.map(f => {
    let status;
    if (f.included && !f.truncated) status = "[FULL]";
    else if (f.included && f.truncated) status = "[TRUNCATED — смотри содержимое ниже]";
    else status = `[NOT IN CONTEXT — ${f.reason || "unknown"}]`;
    return `- ${folderName}/${f.relPath} (${f.size} bytes) ${status}`;
  });
  return lines.join("\n");
}

function buildArchitectPrompt(userId, memoryContext) {
  const core = readFolder("core");
  const protocols = readFolder("protocols");
  const scenarios = readFolder("scenarios");
  const patches = readFolder("patches");

  // Бюджет снижен с 80K→30K, per-file с 12K→5K — чтобы промпт не превышал ~40K.
  // Мини-модели теряют информацию из середины длинных промптов ("lost in the middle").
  const miscResult = readFolderRecursive("misc", { maxFileChars: 5000, maxTotalChars: 30000 });

  const storageStructure = scanStorageStructure();
  const structureText = Object.entries(storageStructure)
    .map(([folder, files]) => folder + "/\n" + files.map(f => "  - " + f).join("\n"))
    .join("\n\n");

  // ============================================================
  // ПОРЯДОК ПРОМПТА: роль+правила ПЕРВЫМИ, файлы ПОСЛЕДНИМИ.
  // Мини-модели лучше всего читают начало и конец промпта.
  // ============================================================

  let prompt = "=== ROLE ===\n";
  prompt += "Ты — Архитектор. Главный управляющий AI-модуль системы.\n";
  prompt += "Ты имеешь доступ к файлам системы через инъекцию в системный промпт (секции ниже).\n";
  prompt += "По умолчанию ты работаешь как управляющий центр: анализируешь, управляешь, создаёшь патчи.\n";
  prompt += "По прямой команде владельца можешь временно перейти в режим ассистента.\n";
  prompt += "После выполнения задачи возвращаешься в режим Архитектора.\n\n";

  // ============================================================
  // КРИТИЧЕСКИЕ ПРАВИЛА ЧЕСТНОСТИ (post-incident 2026-04-09)
  // ============================================================
  prompt += "=== КРИТИЧЕСКИЕ ПРАВИЛА ЧЕСТНОСТИ (ОБЯЗАТЕЛЬНО) ===\n";
  prompt += "1. ЗАПРЕЩЕНО СИМУЛИРОВАТЬ ПРОЦЕСС.\n";
  prompt += "   Не пиши: «жду», «подождите», «анализирую», «сейчас прочитаю», «это займёт минуту».\n";
  prompt += "   Все операции синхронные. К моменту, когда пользователь читает твой ответ, результат уже есть.\n";
  prompt += "   Если не можешь сделать — скажи это СРАЗУ, не симулируй процесс.\n\n";

  prompt += "2. ФАЙЛЫ MISC/ ЗАГРУЖЕНЫ В ТВОЙ КОНТЕКСТ.\n";
  prompt += "   Содержимое файлов из misc/ РЕАЛЬНО НАХОДИТСЯ в конце этого промпта в секции UPLOADED FILES CONTENT.\n";
  prompt += "   Смотри UPLOADED FILES INDEX внизу — файл с [FULL] или [TRUNCATED] ты МОЖЕШЬ читать, его текст ниже.\n";
  prompt += "   Файл с [NOT IN CONTEXT] — НЕ в контексте, скажи об этом честно.\n";
  prompt += "   ВАЖНО: если файл помечен [FULL] или [TRUNCATED] — НЕ ГОВОРИ «не вижу» и «загрузите заново». Его содержимое ниже, прочитай его.\n\n";

  prompt += "3. ЗАПРЕЩЕНО ПИСАТЬ ПЛЕЙСХОЛДЕРЫ В CONTENT.\n";
  prompt += "   НИКОГДА не пиши в CONTENT: «(содержимое файла)», «<контент>», «...», «(text)», пустую строку.\n";
  prompt += "   Если ты не знаешь реального содержимого — НЕ СОЗДАВАЙ файл. Точка.\n\n";

  prompt += "4. ЗАПРЕЩЕНО ПЕРЕЗАПИСЫВАТЬ СУЩЕСТВУЮЩИЕ ФАЙЛЫ ЧЕРЕЗ CREATE.\n";
  prompt += "   CREATE работает только для НОВОГО файла. Для существующего используй ACTION: UPDATE.\n\n";

  prompt += "5. ЗАПРЕЩЕНО ДЕСТРУКТИВНЫЕ ДЕЙСТВИЯ БЕЗ ЯВНОГО НАМЕРЕНИЯ ПОЛЬЗОВАТЕЛЯ.\n";
  prompt += "   DELETE, RMDIR, MOVE, RENAME — только если пользователь явно попросил.\n\n";

  prompt += "6. ПАМЯТЬ — ЭТО РЕАЛЬНО ТВОЙ КОНТЕКСТ.\n";
  prompt += "   Блоки OWNER PROFILE, USER MEMORY, RECENT HISTORY — это твоя память. Используй их.\n\n";

  prompt += "7. ЧЕСТНОСТЬ ПРО ОПЕРАЦИИ.\n";
  prompt += "   Сервер сам добавит постскриптум с реальными результатами (✓/✗/🛑). Описывай что делаешь, не утверждай что сделано.\n\n";

  prompt += "=== FILE & FOLDER OPERATIONS ===\n";
  prompt += "Блоки [MODE: FILE] выполняются синхронно. Не оборачивай в markdown code fence.\n\n";
  prompt += "Файлы: ACTION: CREATE|UPDATE|DELETE|MOVE|RENAME, NAME: путь, CONTENT: текст\n";
  prompt += "Папки: ACTION: MKDIR|RMDIR|MOVE_DIR|RENAME_DIR, PATH: путь\n";
  prompt += "Пути относительны storage/. Корневой сегмент: patches|protocols|scenarios|misc|memory|sessions|projects|core.\n\n";

  // Системные данные — середина (менее критично для attention)
  prompt += "=== SYSTEM INFO ===\nServer: active\nMode: architect\nStorage structure:\n\n" + structureText;
  prompt += "\n\n=== SYSTEM FILES ===\n\n" + core + "\n\n" + protocols + "\n\n" + scenarios + "\n\n" + patches;

  // Блок памяти
  if (memoryContext) {
    if (memoryContext.ownerProfile) {
      prompt += "\n\n=== OWNER PROFILE ===\n" + memoryContext.ownerProfile;
    }
    if (memoryContext.semanticMemory) {
      prompt += "\n\n=== USER MEMORY ===\n" + memoryContext.semanticMemory;
    }
    if (memoryContext.recentHistory) {
      prompt += "\n\n=== RECENT HISTORY ===\n" + memoryContext.recentHistory;
    }
  }

  // ============================================================
  // ФАЙЛЫ В КОНЦЕ — ближе всего к сообщению пользователя.
  // Мини-модели лучше всего читают то, что ближе к user message.
  // ============================================================
  prompt += "\n\n=== UPLOADED FILES INDEX (misc/) ===\n";
  prompt += formatFileIndex("misc", miscResult.files);
  prompt += "\n[FULL]=в контексте, [TRUNCATED]=начало+конец, [NOT IN CONTEXT]=не загружен\n";

  if (miscResult.content) {
    prompt += "\n=== UPLOADED FILES CONTENT ===\n";
    prompt += "Ниже — реальное содержимое файлов из misc/. Ты МОЖЕШЬ и ДОЛЖЕН его читать при запросе пользователя.\n\n";
    prompt += miscResult.content;
  }

  return prompt;
}

// parseFileFromReply заменён на executeAllFileActions из engine/fileActions.js

async function runArchitect(userMessage, userId, memoryContext) {
  const apiKey = process.env.OPENAI_API_KEY;
  const systemPrompt = buildArchitectPrompt(userId, memoryContext);

  // DEBUG: проверяем что промпт содержит нужные файлы
  console.log(`[ARCHITECT DEBUG] prompt length: ${systemPrompt.length} chars`);
  console.log(`[ARCHITECT DEBUG] model: ${process.env.OPENAI_MODEL || "gpt-5"}`);
  const hasIndex = systemPrompt.includes("UPLOADED FILES INDEX");
  const hasFile = systemPrompt.includes("простыня");
  console.log(`[ARCHITECT DEBUG] has INDEX block: ${hasIndex}, has 'простыня': ${hasFile}`);

  const response = await fetch(OPENAI_API_URL, {
    method: "POST",
    headers: {
      "Authorization": "Bearer " + apiKey,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || "gpt-5",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage }
      ],
      temperature: 0.3,
      max_completion_tokens: 16000
    })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error("OpenAI API error: " + response.status + " - " + error);
  }

  const data = await response.json();
  const rawReply = data.choices[0].message.content;

  // Выполняем все файловые операции из ответа AI с гардами (source=ai_reply).
  // Деструктивные операции без явного намерения пользователя — блокируются.
  // CREATE на существующем файле — блокируется.
  // Плейсхолдеры в CONTENT — блокируются.
  const fileResults = executeAllFileActions(rawReply, {
    source: "ai_reply",
    userMessage
  });
  const savedFiles = fileResults.filter(r => r.success);
  const failedFiles = fileResults.filter(r => !r.success);
  const blockedFiles = fileResults.filter(r => r.blocked);

  if (savedFiles.length > 0) {
    console.log(`Architect file operations: ${savedFiles.length} succeeded`);
  }
  if (blockedFiles.length > 0) {
    console.warn(`Architect file operations: ${blockedFiles.length} BLOCKED by safety guards`, blockedFiles);
  }
  if (failedFiles.length > blockedFiles.length) {
    console.warn(`Architect file operations: ${failedFiles.length - blockedFiles.length} failed (other errors)`, failedFiles);
  }

  // Постскриптум с реальными результатами — приклеивается к ответу AI.
  // Пользователь должен видеть честную картину, а не только то, что AI написал в тексте.
  const postscript = formatFileOpsPostscript(fileResults);
  const reply = postscript ? rawReply + "\n" + postscript : rawReply;

  return { reply, savedFiles, failedFiles, blockedFiles };
}

module.exports = { runArchitect };
