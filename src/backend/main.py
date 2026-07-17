import os
import io
import struct
import time
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


def pcm_to_wav(pcm_data: bytes, sample_rate: int = 16000) -> bytes:
    num_channels = 1
    bits_per_sample = 16
    data_size = len(pcm_data)
    header_size = 44
    total_size = header_size + data_size

    buf = io.BytesIO()
    buf.write(b'RIFF')
    buf.write(struct.pack('<I', total_size - 8))
    buf.write(b'WAVE')
    buf.write(b'fmt ')
    buf.write(struct.pack('<I', 16))
    buf.write(struct.pack('<H', 1))
    buf.write(struct.pack('<H', num_channels))
    buf.write(struct.pack('<I', sample_rate))
    buf.write(struct.pack('<I', sample_rate * num_channels * bits_per_sample // 8))
    buf.write(struct.pack('<H', num_channels * bits_per_sample // 8))
    buf.write(struct.pack('<H', bits_per_sample))
    buf.write(b'data')
    buf.write(struct.pack('<I', data_size))
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
        asyncio.run_coroutine_threadsafe(
            self.conn.emit(event, data), self.loop
        )

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


def query_llm(prompt: str, notes: str = "", transcription: str = "", history: Optional[List[dict]] = None) -> str:
    context_parts = []
    if transcription:
        context_parts.append(f"Current transcription (lecture/meeting audio):\n{transcription}")
    if notes:
        context_parts.append(f"User's notes:\n{notes}")

    context = ""
    if context_parts:
        context = "Context:\n" + "\n\n".join(context_parts) + "\n\n"

    messages = [{
        "role": "system",
        "content": (
            "You are an AI assistant that helps with note-taking, transcription analysis, "
            "and explanation. You have access to the user's notes and the live transcription "
            "of their lecture or meeting. Answer helpfully and concisely."
        )
    }]

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
            max_tokens=800,
            temperature=0.7,
        )
        return response.choices[0].message.content
    except Exception as e:
        return f"Error: {str(e)}"


def edit_notes_with_llm(instruction: str, current_notes: str, transcription: str = "") -> str:
    prompt = f"""Edit the user's notes based on their instruction.

Current notes:
{current_notes}

Instruction: {instruction}

Return the edited or updated notes. Preserve content that should not change. Only return the notes."""

    return query_llm(prompt, notes=current_notes, transcription=transcription)


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


@app.post("/llm/edit-notes")
async def llm_edit_notes(request: LLMEditNotesRequest):
    try:
        edited = edit_notes_with_llm(
            instruction=request.instruction,
            current_notes=request.current_notes,
            transcription=request.transcription,
        )
        return {"status": "success", "notes": edited}
    except Exception as e:
        return {
            "status": "error",
            "notes": request.current_notes,
            "error": str(e),
        }


@app.get("/health")
async def health_check():
    return {"status": "healthy"}


def main():
    import uvicorn
    uvicorn.run(socket_app, host="0.0.0.0", port=10000)


if __name__ == "__main__":
    main()
