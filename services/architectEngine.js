const fs = require("fs");
const path = require("path");
const fetch = require("node-fetch");
const { executeAllFileActions } = require("../engine/fileActions");

const STORAGE_PATH = path.join(__dirname, "..", "storage");
const OPENAI_API_URL = "https://api.openai.com/v1/chat/completions";

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

function readFolderLimited(folderName, maxTotalChars) {
  const folderPath = path.join(STORAGE_PATH, folderName);
  if (!fs.existsSync(folderPath)) return "";
  const files = fs.readdirSync(folderPath).filter(f => f.endsWith(".txt")).sort();
  let total = 0;
  const parts = [];
  for (const f of files) {
    const content = fs.readFileSync(path.join(folderPath, f), "utf-8");
    if (total + content.length > maxTotalChars) {
      parts.push("--- " + f + " ---\n" + content.substring(0, maxTotalChars - total) + "\n[...обрезано]");
      break;
    }
    parts.push("--- " + f + " ---\n" + content);
    total += content.length;
  }
  return parts.join("\n\n");
}

function buildArchitectPrompt(userId, memoryContext) {
  const core = readFolder("core");
  const protocols = readFolder("protocols");
  const scenarios = readFolder("scenarios");
  const patches = readFolder("patches");
  const misc = readFolderLimited("misc", 10000);
  const storageStructure = scanStorageStructure();
  const structureText = Object.entries(storageStructure)
    .map(([folder, files]) => folder + "/\n" + files.map(f => "  - " + f).join("\n"))
    .join("\n\n");

  let prompt = "=== SYSTEM INFO ===\nServer: active\nMode: architect\nStorage structure:\n\n" + structureText;
  prompt += "\n\n=== SYSTEM FILES ===\n\n" + core + "\n\n" + protocols + "\n\n" + scenarios + "\n\n" + patches;
  if (misc) {
    prompt += "\n\n=== UPLOADED FILES (misc/) ===\n\n" + misc;
  }

  // Блок памяти (если есть)
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

  prompt += "\n\n=== ROLE ===\n";
  prompt += "Ты — Архитектор. Главный управляющий AI-модуль системы.\n";
  prompt += "Ты имеешь доступ ко всем файлам системы. Ты видишь структуру storage и содержимое файлов.\n";
  prompt += "Загруженные пользователем файлы находятся в misc/. Их содержимое доступно тебе в секции UPLOADED FILES.\n";
  prompt += "По умолчанию ты работаешь как управляющий центр: анализируешь, управляешь, создаёшь патчи.\n";
  prompt += "По прямой команде владельца можешь временно перейти в режим ассистента.\n";
  prompt += "После выполнения задачи возвращаешься в режим Архитектора.\n\n";
  prompt += "=== FILE & FOLDER OPERATIONS ===\n";
  prompt += "ВАЖНО: все операции выполняются СРАЗУ после твоего ответа — парсер читает блоки [MODE: FILE] и применяет их синхронно.\n";
  prompt += "НЕ пиши фразы «жду ответа», «выполняется», «подождите» — к моменту, когда пользователь читает твой ответ, операция УЖЕ выполнена.\n";
  prompt += "Просто выведи блок и кратко подтверди действие: «Папка создана» / «Файл обновлён» / «Удалено».\n";
  prompt += "Не оборачивай блоки [MODE: FILE] в markdown code fence (```), пиши их как есть.\n\n";

  prompt += "--- ПРАВИЛА ПУТЕЙ ---\n";
  prompt += "- Все пути ОТНОСИТЕЛЬНЫ storage/.\n";
  prompt += "- Правильно: `misc/test`, `patches/neural/foo`, `core/memory`\n";
  prompt += "- НЕПРАВИЛЬНО: `/misc/test` (ведущий слеш), `storage/misc/test` (префикс storage), `C:/...` (абсолютный), `../foo` (traversal)\n";
  prompt += "- Корневой сегмент должен быть одним из: patches, protocols, scenarios, misc, memory, sessions, projects, core.\n\n";

  prompt += "--- ФАЙЛОВЫЕ ОПЕРАЦИИ ---\n";
  prompt += "Формат:\n\n";
  prompt += "[MODE: FILE]\nACTION: CREATE | UPDATE | DELETE | MOVE | RENAME\nNAME: путь/к/файлу\nCONTENT:\n...содержимое...\n[END FILE]\n\n";
  prompt += "- ACTION по умолчанию: CREATE. Для MOVE/RENAME используй FROM: и TO: вместо NAME.\n";
  prompt += "- Папка core: файлы можно только создавать/обновлять, нельзя удалять.\n\n";

  prompt += "--- ОПЕРАЦИИ С ПАПКАМИ ---\n";
  prompt += "Формат:\n\n";
  prompt += "[MODE: FILE]\nACTION: MKDIR | RMDIR | MOVE_DIR | RENAME_DIR\nPATH: путь/к/папке\nFROM: старый_путь (для MOVE_DIR/RENAME_DIR)\nTO: новый_путь (для MOVE_DIR/RENAME_DIR)\nFORCE: true (опционально, для RMDIR непустой папки)\n[END FILE]\n\n";
  prompt += "- MKDIR — создаёт папку (включая промежуточные). Идемпотентно.\n";
  prompt += "- RMDIR — удаляет ПУСТУЮ папку. Для непустой добавь FORCE: true (рекурсивно, опасно!).\n";
  prompt += "- MOVE_DIR / RENAME_DIR — перемещает/переименовывает папку (только FROM: и TO:, без NAME/PATH).\n";
  prompt += "- Папка core/ защищена: нельзя удалять, переименовывать или перемещать её целиком. Но внутри core/ можно создавать подпапки.\n";
  prompt += "- Для деструктивных действий (DELETE, RMDIR с FORCE, массовые операции) — сначала предложи и ЖДИ подтверждения в следующем сообщении, не выполняй сразу.\n\n";

  prompt += "--- ПРИМЕРЫ ---\n";
  prompt += "Пример MKDIR:\n";
  prompt += "[MODE: FILE]\nACTION: MKDIR\nPATH: misc/test_folder\n[END FILE]\n\n";
  prompt += "Пример MOVE_DIR:\n";
  prompt += "[MODE: FILE]\nACTION: MOVE_DIR\nFROM: misc/old_name\nTO: misc/new_name\n[END FILE]\n\n";
  prompt += "Пример RMDIR с подтверждением:\n";
  prompt += "[MODE: FILE]\nACTION: RMDIR\nPATH: misc/test_folder\nFORCE: true\n[END FILE]\n\n";
  prompt += "=== FILE UPLOAD ===\n";
  prompt += "Пользователь может загружать файлы через кнопку 📎 (скрепка) в чате.\n";
  prompt += "Загруженные файлы автоматически сохраняются в storage/misc/ и их содержимое доступно тебе.\n";
  prompt += "Если пользователь хочет отправить файл — подскажи нажать на кнопку 📎 рядом с полем ввода.\n";
  prompt += "После загрузки файл появится в секции UPLOADED FILES и ты сможешь прочитать его содержимое.\n";

  return prompt;
}

// parseFileFromReply заменён на executeAllFileActions из engine/fileActions.js

async function runArchitect(userMessage, userId, memoryContext) {
  const apiKey = process.env.OPENAI_API_KEY;
  const systemPrompt = buildArchitectPrompt(userId, memoryContext);

  const response = await fetch(OPENAI_API_URL, {
    method: "POST",
    headers: {
      "Authorization": "Bearer " + apiKey,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage }
      ],
      temperature: 0.3,
      max_tokens: 2000
    })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error("OpenAI API error: " + response.status + " - " + error);
  }

  const data = await response.json();
  const reply = data.choices[0].message.content;

  // Выполняем все файловые операции из ответа AI (CREATE/UPDATE/DELETE/MOVE/RENAME)
  const fileResults = executeAllFileActions(reply);
  const savedFiles = fileResults.filter(r => r.success);
  const failedFiles = fileResults.filter(r => !r.success);

  if (savedFiles.length > 0) {
    console.log(`Architect file operations: ${savedFiles.length} succeeded`);
  }
  if (failedFiles.length > 0) {
    console.warn(`Architect file operations: ${failedFiles.length} failed`, failedFiles);
  }

  return { reply, savedFiles, failedFiles };
}

module.exports = { runArchitect };
