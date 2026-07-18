import os
import io
import struct
import time
import json
import queue
import asyncio
import threading
from dotenv import load_dotenv
from pydantic import BaseModel
from typing import Optional, List
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import socketio
from groq import Groq

load_dotenv()

groq = Groq(api_key=os.getenv("GROQ_API_KEY"))
LLM_MODEL = os.getenv("LLM_MODEL", "llama-3.3-70b-versatile")
WHISPER_MODEL = os.getenv("WHISPER_MODEL", "whisper-large-v3-turbo")

LLM_MODELS = [
    "llama-3.3-70b-versatile",
    "llama-3.1-8b-instant",
    "openai/gpt-oss-120b",
    "openai/gpt-oss-20b",
]

STT_MODELS = [
    "whisper-large-v3-turbo",
    "whisper-large-v3",
]

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

sio = socketio.AsyncServer(async_mode="asgi", cors_allowed_origins=[])
socket_app = socketio.ASGIApp(sio, app)

clients = {}


class TranscriptRequest(BaseModel):
    text: str


class LLMQueryRequest(BaseModel):
    prompt: str
    notes: Optional[str] = ""
    transcription: Optional[str] = ""
    history: Optional[List[dict]] = []


class LLMEditNotesRequest(BaseModel):
    instruction: str
    current_notes: str
    transcription: Optional[str] = ""
    # NEW: pass prior turns so the assistant can hold a real back-and-forth
    history: Optional[List[dict]] = []


class SettingsRequest(BaseModel):
    api_key: str
    llm_model: str
    whisper_model: Optional[str] = "whisper-large-v3-turbo"


def pcm_to_wav(pcm_data: bytes, sample_rate: int = 16000) -> bytes:
    num_channels = 1
    bits_per_sample = 16
    data_size = len(pcm_data)
    header_size = 44
    total_size = header_size + data_size

    buf = io.BytesIO()
    buf.write(b"RIFF")
    buf.write(struct.pack("<I", total_size - 8))
    buf.write(b"WAVE")
    buf.write(b"fmt ")
    buf.write(struct.pack("<I", 16))
    buf.write(struct.pack("<H", 1))
    buf.write(struct.pack("<H", num_channels))
    buf.write(struct.pack("<I", sample_rate))
    buf.write(struct.pack("<I", sample_rate * num_channels * bits_per_sample // 8))
    buf.write(struct.pack("<H", num_channels * bits_per_sample // 8))
    buf.write(struct.pack("<H", bits_per_sample))
    buf.write(b"data")
    buf.write(struct.pack("<I", data_size))
    buf.write(pcm_data)
    return buf.getvalue()


class ClientData:
    def __init__(self, sid, conn, config, loop):
        self.sid = sid
        self.conn = conn
        self.loop = loop
        self.audio_buffer = bytearray()
        self.buffer_lock = threading.Lock()
        self.is_recording = False
        self.config = config
        self.transcription_thread = None

    def start_transcription(self):
        self.is_recording = True
        self.transcription_thread = threading.Thread(target=self._transcribe_loop)
        self.transcription_thread.start()

    def stop_transcription(self):
        self.is_recording = False

    def add_audio_data(self, data):
        with self.buffer_lock:
            self.audio_buffer.extend(data)

    def _get_and_clear_buffer(self):
        with self.buffer_lock:
            data = bytes(self.audio_buffer)
            self.audio_buffer = bytearray()
            return data

    def _emit(self, event, data):
        asyncio.run_coroutine_threadsafe(self.conn.emit(event, data), self.loop)

    def _transcribe_loop(self):
        while self.is_recording:
            time.sleep(3)
            audio_data = self._get_and_clear_buffer()
            if len(audio_data) < 8000:
                continue

            try:
                wav_data = pcm_to_wav(audio_data)
                audio_file = io.BytesIO(wav_data)
                audio_file.name = "audio.wav"

                transcription = groq.audio.transcriptions.create(
                    file=audio_file,
                    model=WHISPER_MODEL,
                    response_format="text",
                    language=self.config.get("audio", {}).get("languageCode", "en")[:2],
                )

                text = transcription.strip() if transcription else ""
                if len(text) > 5:
                    self._emit("speechData", {"data": text, "isFinal": True})
            except Exception as e:
                print(f"Groq transcription error: {e}")


@sio.on("connect")
async def connect(sid, environ):
    print(f"Client connected: {sid}")


@sio.on("disconnect")
async def disconnect(sid):
    print(f"Client disconnected: {sid}")
    if sid in clients:
        clients[sid].stop_transcription()
        del clients[sid]


@sio.on("startGoogleCloudStream")
async def start_stream(sid, config):
    print(f"Starting Groq transcription for client: {sid}")
    loop = asyncio.get_running_loop()
    clients[sid] = ClientData(sid, sio, config, loop)
    clients[sid].start_transcription()


@sio.on("binaryAudioData")
async def receive_audio_data(sid, data):
    if sid in clients:
        clients[sid].add_audio_data(data)


@sio.on("endGoogleCloudStream")
async def end_stream(sid):
    print(f"Stopping transcription for client: {sid}")
    if sid in clients:
        clients[sid].stop_transcription()


def query_llm(
    prompt: str,
    notes: str = "",
    transcription: str = "",
    history: Optional[List[dict]] = None,
    max_tokens: int = 800,
) -> str:
    context_parts = []
    if transcription:
        context_parts.append(
            f"Current transcription (lecture/meeting audio):\n{transcription}"
        )
    if notes:
        context_parts.append(f"User's notes:\n{notes}")

    context = ""
    if context_parts:
        context = "Context:\n" + "\n\n".join(context_parts) + "\n\n"

    messages = [
        {
            "role": "system",
            "content": (
                "You are an AI assistant that helps with note-taking, transcription analysis, "
                "and explanation. You have access to the user's notes and the live transcription "
                "of their lecture or meeting. Answer helpfully and concisely."
            ),
        }
    ]

    if context:
        messages.append({"role": "system", "content": context})

    if history:
        for msg in history[-10:]:
            messages.append(msg)

    messages.append({"role": "user", "content": prompt})

    try:
        response = groq.chat.completions.create(
            model=LLM_MODEL,
            messages=messages,
            max_tokens=max_tokens,
            temperature=0.7,
        )
        return response.choices[0].message.content
    except Exception as e:
        return f"Error: {str(e)}"


# ---------------------------------------------------------------------------
# Notes assistant: tool-calling based intent routing (replaces keyword guess)
# ---------------------------------------------------------------------------
#
# Instead of sniffing the instruction text for words like "explain" or "quiz"
# to decide whether to edit notes or answer a question, we let the model
# itself choose by calling one of two tools. This is far more reliable than
# keyword matching (e.g. "add a section explaining the recursion part" used
# to get misrouted as a pure question because it contains "explaining"), and
# it means the model's own understanding of the request drives the branch,
# not a brittle heuristic.
#
# We also thread conversation history through, so follow-ups like
# "actually make that shorter" or "no, I meant the second bullet" have the
# context of what was just discussed, instead of every call starting cold.

NOTES_TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "edit_notes",
            "description": (
                "Rewrite the user's notes to apply the requested change. Use this whenever "
                "the user wants their notes added to, trimmed, reorganized, reformatted, "
                "corrected, or otherwise modified."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "updated_notes": {
                        "type": "string",
                        "description": (
                            "The complete, updated notes in HTML (use <h2>/<h3>, <ul>/<li>, "
                            "<b>, <i>, <pre><code> for code). Return the FULL notes, not a diff."
                        ),
                    },
                    "summary_of_changes": {
                        "type": "string",
                        "description": "1-2 sentence, specific summary of what changed and why.",
                    },
                },
                "required": ["updated_notes", "summary_of_changes"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "answer_question",
            "description": (
                "Reply conversationally without changing the notes. Use this for questions, "
                "explanations, quizzes, clarifications, or anything that isn't a request to "
                "modify the notes."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "answer": {
                        "type": "string",
                        "description": "HTML-formatted answer (<b>, <ul><li>, <h3> as needed).",
                    },
                },
                "required": ["answer"],
            },
        },
    },
]


def edit_notes_with_llm(
    instruction: str,
    current_notes: str,
    transcription: str = "",
    history: Optional[List[dict]] = None,
) -> dict:
    context = f"\nTranscription for reference:\n{transcription}\n" if transcription else ""

    system_prompt = (
        "You are NotesGPT, an assistant that both edits a user's running notes and answers "
        "questions about them, within one ongoing conversation. You must always call exactly "
        "one of the two available tools:\n"
        "- Call edit_notes when the user is asking you to change the notes in any way.\n"
        "- Call answer_question for everything else (questions, explanations, quizzes, chat).\n\n"
        "Use the full conversation history to understand follow-ups (e.g. 'shorter', 'no, the "
        "other section', 'add an example there') — resolve pronouns and vague references "
        "against what was just discussed, don't ask the user to repeat themselves.\n\n"
        "When editing notes: base them strictly on the provided notes/transcription plus the "
        "user's instruction, don't invent outside facts, and keep formatting consistent "
        "(HTML with <h2>/<h3>, <ul><li>, <b>, <i>, <pre><code> for code/commands).\n"
        "When answering: be direct and specific to what was actually asked; don't pad with "
        "boilerplate like 'Notes updated' since notes were not touched."
    )

    messages = [{"role": "system", "content": system_prompt}]

    if history:
        # keep enough turns for real context without blowing the context window
        messages.extend(history[-12:])

    user_content = f"Current notes:\n{current_notes}\n{context}\nInstruction: {instruction}"
    messages.append({"role": "user", "content": user_content})

    try:
        response = groq.chat.completions.create(
            model=LLM_MODEL,
            messages=messages,
            tools=NOTES_TOOLS,
            tool_choice="required",
            max_tokens=3000,
            temperature=0.5,
        )
    except Exception as e:
        return {
            "notes": current_notes,
            "explanation": f"Sorry, I hit an error: {str(e)}",
            "is_question": False,
        }

    message = response.choices[0].message
    tool_calls = message.tool_calls or []

    if not tool_calls:
        # Model ignored tool_choice (rare) — fall back to treating raw content as an answer
        return {
            "notes": current_notes,
            "explanation": message.content or "I didn't quite catch that — could you rephrase?",
            "is_question": True,
        }

    call = tool_calls[0]
    try:
        args = json.loads(call.function.arguments)
    except (json.JSONDecodeError, TypeError):
        args = {}

    if call.function.name == "edit_notes":
        updated_notes = args.get("updated_notes") or current_notes
        explanation = args.get("summary_of_changes") or "Notes updated."
        return {"notes": updated_notes, "explanation": explanation, "is_question": False}

    # answer_question (or anything unrecognized falls back to Q&A behavior)
    answer = args.get("answer") or "I'm not sure how to respond to that — could you rephrase?"
    return {"notes": current_notes, "explanation": answer, "is_question": True}


@app.post("/llm/edit-notes")
async def llm_edit_notes(request: LLMEditNotesRequest):
    try:
        edited = edit_notes_with_llm(
            instruction=request.instruction,
            current_notes=request.current_notes,
            transcription=request.transcription,
            history=request.history,
        )

        return {
            "status": "success",
            "notes": edited.get("notes", request.current_notes),
            "explanation": edited.get("explanation", ""),
            "is_question": edited.get("is_question", False),
        }
    except Exception as e:
        return {
            "status": "error",
            "notes": request.current_notes,
            "explanation": "",
            "error": str(e),
            "is_question": False,
        }


@app.post("/summary")
async def summarize(request: TranscriptRequest):
    try:
        if len(request.text.strip()) < 50:
            return {
                "status": "too_short",
                "message": "Transcription too short to summarize.",
                "summary": "Transcription is too short to generate a summary.",
                "can_summarize": False,
            }

        result = query_llm(
            f"Summarize the following text into concise bullet-point notes covering main topics, key points, and conclusions:\n\n{request.text[:4000]}"
        )

        return {
            "status": "success",
            "summary": result,
            "message": result,
            "can_summarize": True,
        }
    except Exception as e:
        return {
            "status": "error",
            "message": str(e),
            "summary": "An error occurred while generating the summary.",
            "can_summarize": False,
        }


@app.post("/llm/chat")
async def llm_chat(request: LLMQueryRequest):
    try:
        response = query_llm(
            prompt=request.prompt,
            notes=request.notes,
            transcription=request.transcription,
            history=request.history,
        )
        return {"status": "success", "response": response}
    except Exception as e:
        return {"status": "error", "response": f"Error: {str(e)}"}


@app.post("/settings")
async def update_settings(request: SettingsRequest):
    global groq, LLM_MODEL, WHISPER_MODEL
    try:
        groq = Groq(api_key=request.api_key)
        if request.llm_model in LLM_MODELS:
            LLM_MODEL = request.llm_model
        if request.whisper_model in STT_MODELS:
            WHISPER_MODEL = request.whisper_model
        return {
            "status": "success",
            "llm_model": LLM_MODEL,
            "whisper_model": WHISPER_MODEL,
        }
    except Exception as e:
        return {"status": "error", "error": str(e)}


@app.get("/settings")
async def get_settings():
    return {
        "llm_model": LLM_MODEL,
        "available_llm_models": LLM_MODELS,
        "whisper_model": WHISPER_MODEL,
        "available_stt_models": STT_MODELS,
        "has_api_key": groq.api_key is not None,
    }


@app.get("/health")
async def health_check():
    return {"status": "healthy"}


def main():
    import uvicorn

    uvicorn.run(socket_app, host="0.0.0.0", port=10000)


if __name__ == "__main__":
    main()
