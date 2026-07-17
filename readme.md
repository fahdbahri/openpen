# OpenPen

AI-powered lecture/meeting assistant with live transcription, smart notes, and chat, all in an overlay window.

## Features

- **Live transcription** via Groq Whisper (mic only)
- **AI Chat** with full lecture context (Summarize, Explain, Quiz, Key Points)
- **Rich notes editor** (Bold / Italic)
- **PDF export** — transcription, notes, and chat history
- **Always-on-top overlay** — thin 32px bar, dropdown panels
- Fast Python backend (Groq LLM + Whisper)

## Quick Start

**Prerequisites:** [Docker](https://docs.docker.com/engine/install/), [Git](https://git-scm.com/), and [Bun](https://bun.sh/) (for Electron on the host).

```bash
# 1. Clone
git clone <repo-url> && cd openpen

# 2. Set your Groq API key. Visit https://groq.com to get a free api key.
echo "GROQ_API_KEY=gsk_..." > src/backend/.env

# 3. Start backend + Vite dev server
docker compose up -d

# 4. Launch Electron overlay (on host, needs Bun)
cd src/frontend && bun install && bun electron .
```

The overlay appears top-right. Start recording with the mic button.

## Project Structure

```
openpen/
├── docker-compose.yml
├── src/
│   ├── backend/           # Python FastAPI server (Groq STT + LLM)
│   │   ├── main.py
│   │   ├── Dockerfile
│   │   ├── pyproject.toml
│   │   └── .env
│   └── frontend/          # React + Electron overlay
│       ├── src/
│       │   ├── components/
│       │   │   └── AudioRecorder.jsx   # Main bar + panels
│       │   └── TranscribeUtilities.js  # Socket.IO mic streaming
│       ├── electron/
│       │   ├── main.cjs    # Electron window config
│       │   └── preload.cjs # IPC bridge
│       ├── package.json
│       └── Dockerfile
```

## Tech Stack

- **Frontend:** React, Vite, Tailwind CSS, Socket.IO client, jsPDF, Lucide icons
- **Desktop:** Electron (transparent, frameless, always-on-top)
- **Backend:** Python, FastAPI, Groq (Whisper + Llama), Socket.IO, Uvicorn
- **Infra:** Docker / Docker Compose
