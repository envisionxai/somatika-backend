const express = require("express");
const router = express.Router();
const { runArchitect } = require("../services/architectEngine");

router.post("/", async (req, res) => {
  try {
    const { message } = req.body;
    if (!message) {
      return res.status(400).json({ success: false, error: "Message is required" });
    }
    const { reply, savedFiles } = await runArchitect(message);
    return res.json({
      success: true,
      data: { reply, type: "architect", savedFiles: savedFiles.length > 0 ? savedFiles : undefined }
    });
  } catch (error) {
    console.error("Architect route error:", error);
    return res.status(500).json({ success: false, error: "Architect error: " + error.message });
  }
});

module.exports = router;
