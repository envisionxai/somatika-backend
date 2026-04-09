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
  prompt += "=== FILE OPERATIONS ===\n";
  prompt += "Для работы с файлами используй формат:\n\n";
  prompt += "[MODE: FILE]\nACTION: CREATE | UPDATE | DELETE | MOVE | RENAME\nNAME: имя_файла\nCONTENT:\n...содержимое...\n[END FILE]\n\n";
  prompt += "ACTION по умолчанию: CREATE\n";
  prompt += "Для MOVE/RENAME используй FROM: и TO: (пути относительно storage/).\n";
  prompt += "Разрешённые корневые папки: patches, protocols, scenarios, misc, memory, sessions, projects, core\n";
  prompt += "Папка core — только обновление файлов, нельзя удалять файлы в core и нельзя удалять/переименовывать саму папку core.\n";
  prompt += "Для опасных действий (DELETE, массовые изменения) — сначала предложи, жди подтверждения.\n\n";

  prompt += "=== FOLDER OPERATIONS ===\n";
  prompt += "Для работы с папками используй формат:\n\n";
  prompt += "[MODE: FILE]\nACTION: MKDIR | RMDIR | MOVE_DIR | RENAME_DIR\nPATH: путь_к_папке\nFROM: старый_путь (для MOVE_DIR/RENAME_DIR)\nTO: новый_путь (для MOVE_DIR/RENAME_DIR)\nFORCE: true (опционально, для RMDIR с непустой папкой)\n[END FILE]\n\n";
  prompt += "- MKDIR — создаёт папку (включая промежуточные директории). Идемпотентно.\n";
  prompt += "- RMDIR — удаляет пустую папку. Для непустой добавь FORCE: true (рекурсивно, осторожно!).\n";
  prompt += "- MOVE_DIR / RENAME_DIR — перемещает или переименовывает папку (требуются FROM: и TO:).\n";
  prompt += "- Все пути относительны storage/. Запрещены .. и абсолютные пути.\n";
  prompt += "- Корневой сегмент пути должен быть одним из разрешённых: patches, protocols, scenarios, misc, memory, sessions, projects, core.\n";
  prompt += "- Папка core/ защищена: её нельзя удалять, переименовывать или перемещать целиком. Но внутри core/ можно создавать подпапки.\n";
  prompt += "- Для опасных операций с папками (RMDIR с FORCE, массовое перемещение) — сначала предложи, жди подтверждения владельца.\n\n";
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
