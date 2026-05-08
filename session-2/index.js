import 'dotenv/config'
import express, { text } from 'express'
import multer from 'multer'
import fs from 'fs/promises'
import { GoogleGenAI } from '@google/genai'

const app = express();
const upload = multer();
const PORT = 3000;
const genai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY});

const gemini_model = "gemini-3.1-flash-lite"
app.use(express.json());

app.listen(PORT, () => {
  console.log(`Server is running on PORT: ${PORT}`);
});
app.get('/status', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

app.post('/generate-text', async(req, res) => {
  const { prompt } = req.body;
  console.log(prompt)
  try {
    const response = await genai.models.generateContent({
      model: gemini_model,
      contents: prompt
    });
    res.status(200).json({result: response.text});
  }
  catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/generate-from-image', upload.single("image"), async(req, res) => {
  const { prompt } = req.body;
  const base64Image = req.file.buffer.toString('base64');
  try {
    const response = await genai.models.generateContent({
      model: gemini_model,
      contents: [
        {
          text: prompt ?? "Describe this image",
          type: "text"
        },
        {
          inlineData: {
            data: base64Image,
            mimeType: req.file.mimetype
          }
        }
      ]
    });
    res.status(200).json({result: response.text});
  }
  catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/generate-from-document', upload.single("document"), async(req, res) => {
  const { prompt } = req.body;
  const base64Document = req.file.buffer.toString('base64');
  try {
    const response = await genai.models.generateContent({
      model: gemini_model,
      contents: [
        {
          text: prompt ?? "Please summarize the document into an explainable state for a caveman",
          type: "text"
        },
        {
          inlineData: {
            data: base64Document,
            mimeType: req.file.mimetype
          }
        }
      ]
    });
    res.status(200).json({result: response.text});
  }
  catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/generate-from-audio', upload.single("audio"), async(req, res) => {
  const { prompt } = req.body;
  const base64Audio = req.file.buffer.toString('base64');
  try {
    const response = await genai.models.generateContent({
      model: gemini_model,
      contents: [
        {
          text: prompt ?? "Transcribe this audio",
          type: "text"
        },
        {
          inlineData: {
            data: base64Audio,
            mimeType: safeMimeType
          }
        }
      ]
    });
    res.status(200).json({result: response.text});
  }
  catch (error) {
    res.status(500).json({ error: error.message });
  }
});