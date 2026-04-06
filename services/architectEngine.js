const fs = require("fs");
const path = require("path");
const fetch = require("node-fetch");

const STORAGE_PATH = path.join(__dirname, "..", "storage");
const OPENAI_API_URL = "https://api.openai.com/v1/chat/completions";

function readFolder(folderName) {
  const folderPath = path.join(STORAGE_PATH, folderName);
  if (!fs.existsSync(folderPath)) return "";
  const files = fs.readdirSync(folderPath).filter(f => f.endsWith(".txt")).sort();
  return files.map(f => fs.readFileSync(path.join(folderPath, f), "utf-8")).join("\n\n");
}

function scanStorageStructure() {
  const folders = ["core", "protocols", "scenarios", "patches", "misc"];
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

function buildArchitectPrompt() {
  const core = readFolder("core");
  const protocols = readFolder("protocols");
  const scenarios = readFolder("scenarios");
  const patches = readFolder("patches");
  const storageStructure = scanStorageStructure();
  const structureText = Object.entries(storageStructure)
    .map(([folder, files]) => folder + "/\n" + files.map(f => "  - " + f).join("\n"))
    .join("\n\n");

  return "=== SYSTEM INFO ===\nServer: active\nMode: architect\nStorage structure:\n\n" + structureText + "\n\n=== SYSTEM FILES ===\n\n" + core + "\n\n" + protocols + "\n\n" + scenarios + "\n\n" + patches + "\n\n=== ROLE ===\nTy — Architector. Glavnyj upravljajushchij AI-modul sistemy.\nTy imeesh dostup ko vsem fajlam sistemy. Ty vidish strukturu storage.\nPo umolchaniju ty rabotaesh kak upravljajushchij centr: analiziruesh, upravljaesh, sozdajosh patchi.\nPo prjamoj komande vladeltsa mozhesh vremenno perejti v rezhim assistenta.\nPosle vypolnenija zadachi vozvrashaeshsja v rezhim Architekta.\n\nEsli nuzhno sozdat ili izmenit fajl — ispolzuj format:\n[MODE: FILE]\nNAME: imja_fajla\nCONTENT:\n...soderzhimoe...\n[END FILE]";
}

function parseFileFromReply(reply) {
  const fileRegex = /\[MODE:\s*(?:FILE|PATCH)\]\s*\n\s*NAME:\s*(.+)\s*\n\s*CONTENT:\s*\n([\s\S]*?)\[END\s*(?:FILE|PATCH)\]/gi;
  const files = [];
  let match;
  while ((match = fileRegex.exec(reply)) !== null) {
    files.push({ name: match[1].trim(), content: match[2].trim() });
  }
  return files;
}

async function runArchitect(userMessage) {
  const apiKey = process.env.OPENAI_API_KEY;
  const systemPrompt = buildArchitectPrompt();

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

  const filesToSave = parseFileFromReply(reply);
  const savedFiles = [];

  if (filesToSave.length > 0) {
    const { saveFile } = require("../engine/fileManager");
    for (const file of filesToSave) {
      try {
        const result = saveFile(file.name, file.content);
        savedFiles.push(result);
        console.log("Architect created file: " + file.name);
      } catch (err) {
        console.error("Architect file save error: " + file.name, err);
      }
    }
  }

  return { reply, savedFiles };
}

module.exports = { runArchitect };
