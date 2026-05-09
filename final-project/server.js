import express from "express";
import dotenv from "dotenv";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { GoogleGenAI } from "@google/genai";

dotenv.config();

const app = express();
const PORT = 3001;

if (!process.env.GEMINI_API_KEY) {
  console.error("Missing GEMINI_API_KEY in .env");
  process.exit(1);
}

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const dataDir = path.resolve("data");
mkdirSync(dataDir, { recursive: true });

const db = new DatabaseSync(path.join(dataDir, "quackbot.sqlite"));
db.exec("PRAGMA foreign_keys = ON;");
db.exec(`
  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('user', 'model')),
    text TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
  );
`);

const upsertSessionStmt = db.prepare(`
  INSERT INTO sessions (id, created_at, updated_at)
  VALUES (?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  ON CONFLICT(id) DO UPDATE SET updated_at = CURRENT_TIMESTAMP
`);

const insertMessageStmt = db.prepare(`
  INSERT INTO messages (session_id, role, text)
  VALUES (?, ?, ?)
`);

const getMessagesStmt = db.prepare(`
  SELECT role, text, created_at
  FROM messages
  WHERE session_id = ?
  ORDER BY id ASC
`);

const clearMessagesStmt = db.prepare(`
  DELETE FROM messages
  WHERE session_id = ?
`);

const deleteSessionStmt = db.prepare(`
  DELETE FROM sessions
  WHERE id = ?
`);

const listSessionsStmt = db.prepare(`
  SELECT
    s.id,
    s.created_at,
    s.updated_at,
    COALESCE(
      (
        SELECT substr(trim(m.text), 1, 60)
        FROM messages m
        WHERE m.session_id = s.id AND m.role = 'user'
        ORDER BY m.id ASC
        LIMIT 1
      ),
      'New chat'
    ) AS title,
    COALESCE(
      (
        SELECT substr(trim(m.text), 1, 80)
        FROM messages m
        WHERE m.session_id = s.id
        ORDER BY m.id DESC
        LIMIT 1
      ),
      'No messages yet'
    ) AS preview,
    (
      SELECT COUNT(*)
      FROM messages m
      WHERE m.session_id = s.id
    ) AS message_count
  FROM sessions s
  ORDER BY datetime(s.updated_at) DESC, s.id DESC
`);

app.use(express.json());
app.use(express.static("public"));

const SYSTEM_INSTRUCTION =
  "You are QuackBot, a rubber duck debugger. Your job is NOT to write code for the user, but to ask short, guiding questions (max 2 sentences) to help them realize their own logic errors. Be slightly sarcastic but helpful. End occasionally with quack.";

function getResponseText(response) {
  if (typeof response?.text === "string" && response.text.trim()) {
    return response.text.trim();
  }

  const candidateText = response?.candidates?.[0]?.content?.parts
    ?.map((part) => part?.text || "")
    .join("")
    .trim();

  if (candidateText) return candidateText;

  return "Hmm, my duck brain stalled. Can you rephrase that? quack";
}

function getSessionId(value) {
  if (typeof value !== "string") return null;

  const sessionId = value.trim();
  return sessionId ? sessionId : null;
}

function touchSession(sessionId) {
  upsertSessionStmt.run(sessionId);
}

function getHistoryContents(sessionId) {
  const rows = getMessagesStmt.all(sessionId);
  return rows.map(({ role, text }) => ({
    role,
    parts: [{ text }],
  }));
}

app.get("/api/chat/sessions", (req, res) => {
  try {
    const sessions = listSessionsStmt.all();
    res.json({ sessions });
  } catch (error) {
    console.error("Error in GET /api/chat/sessions:", error);
    res.status(500).json({
      error: "Something went wrong while loading sessions.",
    });
  }
});

app.get("/api/chat/history", (req, res) => {
  try {
    const sessionId = getSessionId(req.query?.sessionId);

    if (!sessionId) {
      return res.status(400).json({ error: "sessionId is required." });
    }

    const messages = getMessagesStmt.all(sessionId);
    res.json({ messages });
  } catch (error) {
    console.error("Error in GET /api/chat/history:", error);
    res.status(500).json({
      error: "Something went wrong while loading chat history.",
    });
  }
});

app.post("/api/chat", async (req, res) => {
  try {
    const sessionId = getSessionId(req.body?.sessionId);
    const userMessage = req.body?.userMessage?.trim();

    if (!sessionId) {
      return res.status(400).json({ error: "sessionId is required." });
    }

    if (!userMessage) {
      return res.status(400).json({ error: "userMessage is required." });
    }

    touchSession(sessionId);

    const contents = [
      ...getHistoryContents(sessionId),
      {
        role: "user",
        parts: [{ text: userMessage }],
      },
    ];

    const response = await ai.models.generateContent({
      model: "gemini-3.1-flash-lite",
      contents,
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        maxOutputTokens: 100,
        temperature: 0.7,
      },
    });

    const botReply = getResponseText(response);

    insertMessageStmt.run(sessionId, "user", userMessage);
    insertMessageStmt.run(sessionId, "model", botReply);
    touchSession(sessionId);

    res.json({ reply: botReply });
  } catch (error) {
    console.error("Error in POST /api/chat:", error);
    res.status(500).json({
      error: "Something went wrong while talking to QuackBot.",
    });
  }
});

app.post("/api/chat/clear", (req, res) => {
  try {
    const sessionId = getSessionId(req.body?.sessionId);

    if (!sessionId) {
      return res.status(400).json({ error: "sessionId is required." });
    }

    clearMessagesStmt.run(sessionId);
    touchSession(sessionId);

    res.json({ message: "Chat history cleared." });
  } catch (error) {
    console.error("Error in POST /api/chat/clear:", error);
    res.status(500).json({
      error: "Something went wrong while clearing chat history.",
    });
  }
});

app.delete("/api/chat/session/:sessionId", (req, res) => {
  try {
    const sessionId = getSessionId(req.params?.sessionId);

    if (!sessionId) {
      return res.status(400).json({ error: "sessionId is required." });
    }

    const result = deleteSessionStmt.run(sessionId);

    if (!result.changes) {
      return res.status(404).json({ error: "Session not found." });
    }

    res.json({ message: "Chat deleted." });
  } catch (error) {
    console.error("Error in DELETE /api/chat/session/:sessionId:", error);
    res.status(500).json({
      error: "Something went wrong while deleting the chat.",
    });
  }
});

app.listen(PORT, () => {
  console.log(`QuackBot server running at http://localhost:${PORT}`);
});
