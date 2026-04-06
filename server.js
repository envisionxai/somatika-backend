require("dotenv").config();
const express = require("express");
const cors = require("cors");
const https = require("https");
const fs = require("fs");

const messageRoute = require("./routes/message");
const patchRoute = require("./routes/patch");
const fileRoute = require("./routes/file");
const architectRoute = require("./routes/architect");
const { init: initPatchManager, getStats: getPatchStats } = require("./engine/patchManager");
const { getStats: getDbStats } = require("./db/db");
const { getStats: getFileStats } = require("./engine/fileManager");

const app = express();
const PORT = process.env.PORT || 3000;
const USE_HTTPS = process.env.USE_HTTPS === "true";

// Инициализация Patch Manager (загрузка патчей из БД)
initPatchManager();

app.use(cors());
app.use(express.json());

// API Routes
app.use("/api/message", messageRoute);
app.use("/api/patch", patchRoute);
app.use("/api/file", fileRoute);
app.use("/api/architect", architectRoute);

// Stats endpoint
app.get("/api/stats", (req, res) => {
  res.json({
    success: true,
    data: {
      database: getDbStats(),
      patches: getPatchStats(),
      files: getFileStats()
    }
  });
});

// Health check
app.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Запуск сервера
if (USE_HTTPS) {
  const SSL_OPTIONS = {
    key: fs.readFileSync("/etc/letsencrypt/live/somatika.to/privkey.pem"),
    cert: fs.readFileSync("/etc/letsencrypt/live/somatika.to/fullchain.pem")
  };
  https.createServer(SSL_OPTIONS, app).listen(PORT, "0.0.0.0", () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`📡 Health check: https://localhost:${PORT}/health`);
  });
} else {
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`📡 Health check: http://localhost:${PORT}/health`);
  });
}
