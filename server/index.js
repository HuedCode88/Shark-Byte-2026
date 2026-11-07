import express from "express";
import multer from "multer";
import { Readable } from "node:stream";

import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../Jarvis/.env") });

const app = express();
app.use(express.json({ limit: "50kb" }));
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
});

const KEY = process.env.ELEVENLABS_API_KEY;
const VOICE_ID = process.env.ELEVENLABS_VOICE_ID;

// Text -> speech (streams MP3 back)
app.post("/api/tts", async (req, res) => {
  const text = String(req.body?.text ?? "").slice(0, 1000); // cap length = cap cost
  if (!text.trim()) return res.status(400).json({ error: "No text" });

  const r = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}/stream?output_format=mp3_44100_128`,
    {
      method: "POST",
      headers: { "xi-api-key": KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ text, model_id: "eleven_flash_v2_5" }), // low-latency model
    }
  );

  if (!r.ok) return res.status(r.status).json({ error: await r.text() });
  res.setHeader("Content-Type", "audio/mpeg");
  Readable.fromWeb(r.body).pipe(res);
});

// Speech -> text
app.post("/api/stt", upload.single("audio"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No audio" });

  const form = new FormData();
  form.append("model_id", "scribe_v1"); // check docs for the newest Scribe model
  form.append(
    "file",
    new Blob([req.file.buffer], { type: req.file.mimetype }),
    "audio.webm"
  );

  const r = await fetch("https://api.elevenlabs.io/v1/speech-to-text", {
    method: "POST",
    headers: { "xi-api-key": KEY },
    body: form,
  });

  const data = await r.json();
  if (!r.ok) return res.status(r.status).json({ error: data });
  res.json({ text: (data.text ?? "").trim() });
});

app.listen(3001, () => console.log("API on :3001"));