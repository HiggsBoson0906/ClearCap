// src/index.js
const express = require("express");
const http = require("http");
const cors = require("cors");
const axios = require("axios");
const multer = require("multer");
const upload = multer(); // memory storage
const { Server } = require("socket.io");
require("dotenv").config();

// Config
const PORT = process.env.PORT || 5000;
const NLP_BASE_URL = process.env.NLP_BASE_URL || "http://127.0.0.1:8000";

const app = express();
const server = http.createServer(app);
const EMOTION_COLORS = {
    neutral: "#333333",
    happy: "#FFD54F",   // warm yellow
    anger: "#EF5350",   // red
    sad: "#42A5F5",     // blue
    fear: "#AB47BC",    // purple
};

function mapGlossToClips(glossArr) {
    if (!Array.isArray(glossArr)) return [];
    // For now, just turn each gloss token into a fake clip id
    return glossArr.map((token) => `clip_${token}`);
}


// Middlewares
app.use(
    cors({
        origin: "*",
    })
);
app.use(express.json());

// In-memory session store
// sessionId -> { language, mode, createdAt }
const sessions = new Map();

// Health check
app.get("/api/health", (req, res) => {
    res.json({ status: "ok", service: "node-backend" });
});

/**
 * POST /api/session
 * Create a captioning session
 */
app.post("/api/session", (req, res) => {
    const { language, mode } = req.body || {};

    const sessionId =
        "sess_" +
        Date.now().toString(36) +
        "_" +
        Math.random().toString(36).slice(2, 8);

    sessions.set(sessionId, {
        language: language || "en-IN",
        mode: mode || "text",
        createdAt: Date.now(),
    });

    // For socket.io, client will connect to http://localhost:PORT
    const wsUrl = `http://localhost:${PORT}`;

    res.json({
        sessionId,
        wsUrl,
    });
});
/**
 * Stub: Here you will later call a real ASR provider.
 * For now, it just returns a dummy transcript.
 */
async function transcribeAudio(buffer) {
    // TODO: replace with actual ASR API call (Whisper, Deepgram, etc.)
    console.log("Received audio buffer of length:", buffer.length);

    // For MVP, return a hard-coded text so you see pipeline working
    return "This is a dummy transcript from the ASR stub.";
}

/**
 * POST /api/asr/transcribe
 * Accepts audio, returns { text }
 */
app.post("/api/asr/transcribe", upload.single("audio"), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: "No audio file uploaded" });
        }

        const audioBuffer = req.file.buffer;

        const text = await transcribeAudio(audioBuffer);

        return res.json({ text });
    } catch (err) {
        console.error("Error in /api/asr/transcribe:", err.message);
        return res.status(500).json({ error: "ASR failed" });
    }
});


/**
 * POST /api/test-nlp
 * Test route: Node -> NLP service -> back
 * This is what we'll hit from Postman to verify integration.
 */
app.post("/api/test-nlp", async (req, res) => {
    const { text, sourceLang } = req.body || {};

    if (!text) {
        return res.status(400).json({ error: "Field 'text' is required" });
    }

    try {
        const response = await axios.post(`${NLP_BASE_URL}/process`, {
            text,
            sourceLang: sourceLang || "en-IN",
        });

        return res.json({
            ok: true,
            nlpResponse: response.data,
        });
    } catch (err) {
        console.error("Error calling NLP service:", err.message);
        if (err.response) {
            console.error("NLP status:", err.response.status);
            console.error("NLP data:", err.response.data);
        }
        return res.status(500).json({
            ok: false,
            error: "Failed to contact NLP service",
        });
    }
});

// ----- WebSocket (socket.io) setup -----
const io = new Server(server, {
    cors: {
        origin: "*",
    },
});

io.on("connection", (socket) => {
    console.log("Client connected:", socket.id);

    // Client can send final "transcripts" here (pretend it's ASR output)
    socket.on("transcript_final", async (payload) => {
        try {
            const { text, sessionId } = payload || {};

            if (!text) {
                console.warn("Received transcript without text");
                return;
            }

            const session = sessions.get(sessionId);
            const sourceLang = session?.language || "en-IN";

            console.log(
                `Received transcript for session ${sessionId}:`,
                text.slice(0, 80)
            );

            // Call NLP microservice
            const nlpRes = await axios.post(`${NLP_BASE_URL}/process`, {
                text,
                sourceLang,
            });

            const data = nlpRes.data;

            // Prepare caption_final message
            const color =
                EMOTION_COLORS[data.emotion] || EMOTION_COLORS["neutral"];

            const message = {
                type: "caption_final",
                sessionId,
                original: text,
                simplified: data.simplified,
                language: data.language,
                emotion: data.emotion,
                color,
                isl: {
                    gloss: data.islGloss,
                    clipIds: mapGlossToClips(data.islGloss),
                },
            };


            // Emit back only to this client for now
            socket.emit("caption_final", message);
        } catch (err) {
            console.error("Error handling transcript_final:", err.message);
        }
    });

    socket.on("disconnect", () => {
        console.log("Client disconnected:", socket.id);
    });
});

server.listen(PORT, () => {
    console.log(`Node backend running on http://localhost:${PORT}`);
    console.log(`NLP service base URL: ${NLP_BASE_URL}`);
});
