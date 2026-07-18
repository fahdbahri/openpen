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

```bash
git clone <repo-url> && cd openpen
./start.sh
```

The script will:

1. Install **Bun** and **uv** if missing
2. Prompt for your Groq API key (get one free at https://console.groq.com)
3. Install all dependencies
4. Start the backend + frontend dev server
5. Launch the Electron overlay

The overlay appears top-right. Start recording with the mic button.

## Project Structure

```
openpen/
├── start.sh               # One-command launcher
├── src/
│   ├── backend/           # Python FastAPI server (Groq STT + LLM)
│   │   ├── main.py
│   │   ├── pyproject.toml
│   │   └── .env
│   └── frontend/          # React + Electron overlay
│       ├── src/
│       │   ├── components/
│       │   │   └── StatusBar.jsx   # Main bar + panels
│       │   └── TranscribeUtilities.js  # Socket.IO mic streaming
│       ├── electron/
│       │   ├── main.cjs    # Electron window config
│       │   └── preload.cjs # IPC bridge
│       └── package.json
```

## Tech Stack

- **Frontend:** React, Vite, Tailwind CSS, Socket.IO, jsPDF, Lucide
- **Desktop:** Electron (transparent, frameless, always-on-top)
- **Backend:** Python, FastAPI, Groq (Whisper + Llama), Socket.IO, Uvicorn
