import express from "express";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(express.json({ limit: "1mb" }));
app.use(cors({ origin: true }));

const PORT = process.env.PORT || 4000;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const MODEL = process.env.GEMINI_MODEL || "gemini-3.6-flash";

if (!GEMINI_API_KEY) {
  console.warn("[vantage] Warning: GEMINI_API_KEY is not set. /api/analyze will fail until it is.");
}

// --- tiny in-memory rate limiter: 5 requests / 10 minutes per IP ---
// A real deployment with multiple server instances would need a shared
// store (Redis) instead of an in-memory Map — same lesson as the
// original CareerPilot project's rate limiting.
const buckets = new Map();
const WINDOW_MS = 10 * 60 * 1000;
const MAX_REQUESTS = 5;

function rateLimit(req, res, next) {
  const ip = req.ip;
  const now = Date.now();
  const bucket = buckets.get(ip) || [];
  const recent = bucket.filter((t) => now - t < WINDOW_MS);
  if (recent.length >= MAX_REQUESTS) {
    return res.status(429).json({ error: "Too many requests. Try again in a few minutes." });
  }
  recent.push(now);
  buckets.set(ip, recent);
  next();
}

app.get("/api/health", (req, res) => res.json({ ok: true }));

app.post("/api/analyze", rateLimit, async (req, res) => {
  try {
    const { jobDesc, resumeText } = req.body || {};

    if (!jobDesc || !resumeText || jobDesc.trim().length < 20 || resumeText.trim().length < 20) {
      return res.status(400).json({ error: "Both jobDesc and resumeText are required (min ~20 characters each)." });
    }
    if (!GEMINI_API_KEY) {
      return res.status(500).json({ error: "Server is missing GEMINI_API_KEY." });
    }

    const prompt = buildPrompt(jobDesc.trim(), resumeText.trim());

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: {
            maxOutputTokens: 1200,
            responseMimeType: "application/json",
          },
        }),
      }
    );

    if (!response.ok) {
      const detail = await response.text();
      console.error("[vantage] Gemini API error:", response.status, detail);
      return res.status(502).json({ error: "The AI service returned an error." });
    }

    const data = await response.json();
    const text = (data.candidates?.[0]?.content?.parts || []).map((p) => p.text || "").join("");
    const clean = text.replace(/```json/gi, "").replace(/```/g, "").trim();

    let parsed;
    try {
      parsed = JSON.parse(clean);
    } catch {
      const match = clean.match(/\{[\s\S]*\}/);
      if (!match) return res.status(502).json({ error: "Could not parse the AI response." });
      parsed = JSON.parse(match[0]);
    }

    res.json(parsed);
  } catch (err) {
    console.error("[vantage] /api/analyze failed:", err);
    res.status(500).json({ error: "Unexpected server error." });
  }
});

function buildPrompt(jobDesc, resumeText) {
  return `You are a career analyst. Compare the RESUME to the JOB DESCRIPTION and return ONLY a valid JSON object, no markdown fences, no commentary outside the JSON, matching exactly this shape:
{
 "matchScore": number (0-100 overall fit),
 "matchSummary": string (max 22 words, specific and plain),
 "topStrengths": [string, string, string] (short phrases grounded in the resume),
 "skillGaps": [{"skill": string, "why": string (max 10 words)}] (exactly 3 items, most important first),
 "roadmap": [{"week": number, "focus": string (max 6 words), "tasks": [string, string] (max 12 words each)}] (exactly 4 items, weeks 1 to 4, addressing the skill gaps),
 "resumeImprovements": [string, string, string, string] (specific, actionable, max 14 words each),
 "interviewQuestions": {"technical": [string,string,string,string] (max 16 words each), "behavioral": [string,string,string] (max 16 words each)},
 "futureScope": string (max 38 words, on demand and trends for this type of role)
}
Be concise and specific to the actual text given. Output nothing but the JSON object.

JOB DESCRIPTION:
"""${jobDesc}"""

RESUME:
"""${resumeText}"""`;
}

app.listen(PORT, () => {
  console.log(`[vantage] backend listening on http://localhost:${PORT}`);
});
