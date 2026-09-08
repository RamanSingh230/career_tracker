# Vantage — AI Career Readiness Report

A small full-stack app: paste a job description and your resume, get back a
match score, a 4-week study roadmap, resume improvement tips, likely
interview questions, and the role's future outlook — all generated live by
Gemini.

This is a deliberately simplified version of a larger AI career-prep project:
one page, one AI call, one clear flow, but the *same architecture pattern* —
frontend never touches the AI key, backend owns auth-free but rate-limited
access to the model, structured JSON in/out.

```
Browser (index.html)
   |  POST /api/analyze  { jobDesc, resumeText }
   v
Express backend (server.js)
   |  holds GEMINI_API_KEY, rate-limits by IP
   v
Gemini (Google AI API)
   |  returns strict JSON (score, gaps, roadmap, questions, outlook)
   v
Backend forwards JSON -> Browser renders it
```

## Project structure

```
vantage/
  backend/
    server.js        Express server, single POST /api/analyze route
    package.json
    .env.example      Copy to .env and add your key
  frontend/
    index.html         Self-contained UI (no build step, no framework)
  README.md
```

## Run it locally

1. **Backend**
   ```bash
   cd backend
   npm install
   cp .env.example .env
   # edit .env and paste your free key from https://aistudio.google.com/app/apikey
   npm start
   ```
   This starts the API on `http://localhost:4000`.

2. **Frontend**
   Just open `frontend/index.html` in a browser — or serve it so it's on
   the same origin as the backend (simplest for local dev):
   ```bash
   # from the frontend/ folder
   npx serve .
   ```
   If frontend and backend run on different ports/origins locally, either:
   - add a proxy (e.g. Vite dev server `proxy` config), or
   - set `API_BASE` near the top of the `<script>` block in `index.html`
     to `http://localhost:4000`.

## Deploying it for real (so you have a live link)

- **Backend** → any Node host with env vars: Render, Railway, Fly.io.
  Set `GEMINI_API_KEY` there. Never commit `.env`.
- **Frontend** → any static host: GitHub Pages, Vercel, Netlify.
  Set `API_BASE` in `index.html` to your deployed backend's URL before
  pushing.

That gives you two URLs, exactly like a normal full-stack deployment: a
static frontend and a small API.

## Why it's built this way (for the interview)

- **The frontend never calls Gemini directly.** The API key lives only on
  the backend. This is the same reasoning as the original CareerPilot
  project: keys must stay server-side.
- **Structured JSON output**, not free text. The prompt specifies an exact
  JSON shape, and Gemini's `responseMimeType: "application/json"` mode
  is used so the backend can reliably parse it and the frontend can
  render it without fragile text scraping.
- **Rate limiting.** A simple per-IP in-memory limiter (5 requests / 10
  minutes) stops one user from burning through API quota. In a real
  multi-server deployment this would move to a shared store like Redis —
  worth saying out loud if asked "how would this scale?"
- **No database.** Deliberately left out to keep the project small and
  explainable in a few minutes. If asked "how would you extend it?": add a
  `Report` model (MongoDB/Postgres) and a `POST /api/reports` to save past
  analyses per logged-in user — same shape as the bigger project, just not
  built here to keep the scope defensible.

## Honest framing

If asked whether you built this from scratch: this is a new, self-contained
project you can say you designed and built yourself — the architecture,
prompt design, and UI are your own work, distinct from the larger cloned
project you studied separately.
