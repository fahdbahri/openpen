import { useState, useCallback, useRef, useEffect } from 'react';
import { Mic, MessageSquare, Notebook, X, SendHorizonal, FileDown, Settings } from "lucide-react";
import { jsPDF } from "jspdf";

export default function StatusBar() {
  const [transcription, setTranscription] = useState([]);
  const [interimText, setInterimText] = useState("");
  const [notes, setNotes] = useState("");
  const [notesKey, setNotesKey] = useState(0);
  const notesRef = useRef(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [activePanel, setActivePanel] = useState(null);
  const [askInput, setAskInput] = useState("");
  const [chatMessages, setChatMessages] = useState([]);
  const [chatLoading, setChatLoading] = useState(false);
  const [isBold, setIsBold] = useState(false);
  const [isItalic, setIsItalic] = useState(false);
  const [apiKey, setApiKey] = useState(localStorage.getItem('groq_api_key') || '');
  const [selectedModel, setSelectedModel] = useState(localStorage.getItem('groq_model') || 'llama-3.3-70b-versatile');
  const [selectedSTT, setSelectedSTT] = useState(localStorage.getItem('groq_stt_model') || 'whisper-large-v3-turbo');
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsMessage, setSettingsMessage] = useState('');
  const [availableModels, setAvailableModels] = useState([]);
  const [availableSTT, setAvailableSTT] = useState([]);
  const interimRef = useRef("");
  const sttRef = useRef(null);

  useEffect(() => {
    import("../TranscribeUtilities").then(m => { sttRef.current = m.default; });
  }, []);

  const handleData = (data, isFinal) => {
    if (isFinal) {
      interimRef.current = "";
      setInterimText("");
      setTranscription(o => [...o, data]);
    } else {
      interimRef.current = data;
      setInterimText(data);
    }
  };

  const onStart = () => {
    setIsRecording(true);
    sttRef.current?.initRecording(
      { source: "mic", audio: { encoding: "LINEAR16", sampleRateHertz: 16000, languageCode: "en-US" }, interimResults: true },
      handleData,
      e => console.error(e)
    );
  };

  const onStop = () => {
    setIsRecording(false);
    setInterimText("");
    sttRef.current?.stopRecording();
    if (interimRef.current) {
      setTranscription(o => [...o, interimRef.current]);
      interimRef.current = "";
    }
  };

  const saveSettings = () => {
    setSavingSettings(true);
    setSettingsMessage('');
    localStorage.setItem('groq_api_key', apiKey);
    localStorage.setItem('groq_model', selectedModel);
    localStorage.setItem('groq_stt_model', selectedSTT);
    fetch("http://0.0.0.0:10000/settings", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ api_key: apiKey, llm_model: selectedModel, whisper_model: selectedSTT }),
    }).then(r => r.json()).then(d => {
      setSettingsMessage(d.status === 'success' ? 'Saved!' : 'Saved locally');
    }).catch(() => setSettingsMessage('Saved locally'));
    setTimeout(() => setSavingSettings(false), 600);
  };

  useEffect(() => {
    fetch("http://0.0.0.0:10000/settings").then(r => r.json()).then(d => {
      if (d.available_llm_models) setAvailableModels(d.available_llm_models);
      if (d.available_stt_models) setAvailableSTT(d.available_stt_models);
    }).catch(() => { });
  }, []);

  const timerRef = useRef(null);
  const contentRef = useRef(null);
  const containerRef = useRef(null);
  const chatInputRef = useRef(null);

  useEffect(() => {
    if (isRecording) {
      timerRef.current = setInterval(() => setRecordingTime(t => t + 1), 1000);
    } else {
      clearInterval(timerRef.current);
      setRecordingTime(0);
    }
    return () => clearInterval(timerRef.current);
  }, [isRecording]);

  const formatTime = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

  useEffect(() => {
    if (!containerRef.current) return;
    const updateHeight = () => {
      if (!containerRef.current) return;
      const height = containerRef.current.scrollHeight;
      const width = containerRef.current.scrollWidth;
      window.electronAPI?.updateContentDimensions?.({ width, height });
    };
    const ro = new ResizeObserver(updateHeight);
    ro.observe(containerRef.current);
    updateHeight();
    const mo = new MutationObserver(updateHeight);
    mo.observe(containerRef.current, { childList: true, subtree: true, attributes: true, characterData: true });
    return () => { ro.disconnect(); mo.disconnect(); };
  }, [activePanel, chatMessages]);

  useEffect(() => {
    const el = notesRef.current;
    if (!el) return;
    const update = () => {
      setIsBold(document.queryCommandState('bold'));
      setIsItalic(document.queryCommandState('italic'));
    };
    el.addEventListener('mouseup', update);
    el.addEventListener('keyup', update);
    return () => { el.removeEventListener('mouseup', update); el.removeEventListener('keyup', update); };
  }, []);

  useEffect(() => {
    if (notesRef.current && activePanel === 'notes') {
      notesRef.current.innerHTML = notes || "";
    }
  }, [activePanel, notesKey]);

  const buildHistory = useCallback(() => {
    return chatMessages
      .slice(-16)
      .map(m => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content }));
  }, [chatMessages]);


  const handleLLMMessage = useCallback(async (message) => {
    if (!message.trim()) return;
    const userMsg = { role: "user", content: message };
    setChatMessages(p => [...p, userMsg]);
    setChatLoading(true);

    try {
      const r = await fetch("http://0.0.0.0:10000/llm/edit-notes", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          instruction: message,
          current_notes: notes,
          transcription: transcription.join(" "),
          history: buildHistory(),
        }),
      });
      const d = await r.json();

      if (d.status !== "success") {
        setChatMessages(p => [...p, { role: "assistant", content: d.error ? `Error: ${d.error}` : "Something went wrong." }]);
        return;
      }

      if (!d.is_question && d.notes) {
        setNotes(d.notes);
        setNotesKey(k => k + 1);
      }

      setChatMessages(p => [...p, { role: "assistant", content: d.explanation || "(no response text — check backend logs)" }]);
    } catch (e) {
      setChatMessages(p => [...p, { role: "assistant", content: `Error: ${e.message}` }]);
    } finally { setChatLoading(false); }
  }, [notes, transcription, buildHistory]);

  const handleAskSubmit = () => {
    if (!askInput.trim()) return;
    handleLLMMessage(askInput);
    setAskInput("");
    setActivePanel('chat');
  };

  const exportPDF = async () => {
    const defaultName = `openpen-notes-${Date.now()}.pdf`;

    let fileName = defaultName;
    if (window.electronAPI?.showSaveDialog) {
      const result = await window.electronAPI.showSaveDialog(defaultName);
      if (result.canceled) return;
      fileName = result.filePath;
    } else {
      const input = window.prompt("Save PDF as:", defaultName);
      if (!input) return;
      fileName = input.endsWith(".pdf") ? input : `${input}.pdf`;
    }

    const doc = new jsPDF();
    const dateStr = new Date().toLocaleString();
    let y = 20;

    const addHeading = (text, size = 14) => {
      if (y > 270) { doc.addPage(); y = 20; }
      doc.setFontSize(size);
      doc.text(text, 14, y);
      y += size * 0.3;
    };

    const addBody = (text, size = 9) => {
      doc.setFontSize(size);
      const lines = doc.splitTextToSize(text || "", 180);
      for (const line of lines) {
        if (y > 280) { doc.addPage(); y = 20; }
        doc.text(line, 14, y);
        y += size * 0.4;
      }
    };

    const addDivider = () => {
      if (y > 280) { doc.addPage(); y = 20; }
      doc.setDrawColor(200);
      doc.line(14, y, 196, y);
      y += 6;
    };

    doc.setFontSize(18);
    doc.text("OpenPen - Lecture Notes", 14, y);
    y += 10;
    doc.setFontSize(9);
    doc.text(`Generated: ${dateStr}`, 14, y);
    y += 8;

    addDivider();

    addHeading("Transcription", 12);
    addBody(transcription.join(" "));

    addDivider();

    addHeading("Notes", 12);
    addBody((notes || "No notes written.").replace(/<[^>]*>/g, ''));

    if (chatMessages.length > 0) {
      addDivider();
      addHeading("AI Assistant Chat", 12);
      for (const msg of chatMessages) {
        const prefix = msg.role === "user" ? "You: " : "AI: ";
        addBody(`${prefix}${msg.content.replace(/<[^>]*>/g, '')}`, 9);
        y += 2;
      }
    }

    doc.save(fileName);
  };


  const panels = {
    notes: {
      label: "Notes", icon: Notebook,
      content: (
        <div className="p-3 flex flex-col gap-3 overflow-y-auto" style={{ minHeight: '200px', maxHeight: '400px' }}>
          <div className="flex-1 flex flex-col gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-widest text-white/50">Your Notes</span>
            <div className="flex gap-1 mb-1">
              <button onMouseDown={e => { e.preventDefault(); document.execCommand('bold'); notesRef.current?.focus(); setIsBold(document.queryCommandState('bold')); }} className={`px-2 py-0.5 rounded text-[11px] font-bold transition-all ${isBold ? 'bg-white/30 text-white' : 'bg-black/40 hover:bg-white/20 text-white/70'}`}>B</button>
              <button onMouseDown={e => { e.preventDefault(); document.execCommand('italic'); notesRef.current?.focus(); setIsItalic(document.queryCommandState('italic')); }} className={`px-2 py-0.5 rounded text-[11px] italic transition-all ${isItalic ? 'bg-white/30 text-white' : 'bg-black/40 hover:bg-white/20 text-white/70'}`}>I</button>
            </div>
            <div
              key={notesKey}
              ref={notesRef}
              contentEditable
              suppressContentEditableWarning
              className="w-full min-h-[100px] max-h-[300px] overflow-y-auto outline-none rounded-lg px-3 py-2 bg-black/40 text-white text-xs border border-white/10 shadow-lg empty:before:text-white/30 empty:before:content-[attr(data-placeholder)]"
              data-placeholder="Type your notes here..."
              onInput={(e) => setNotes(e.currentTarget.innerHTML)}
              onKeyDown={(e) => { if (e.key === 'Tab') { e.preventDefault(); document.execCommand('insertHTML', false, '  '); } }}
            />
          </div>
          <div className="flex-1 flex flex-col gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-widest text-white/50">Live Transcription</span>
            <div className="overflow-y-auto max-h-24 rounded-lg bg-black/40 p-3 border border-white/10 shadow-lg">
              {transcription.length === 0 && !interimText ? (
                <p className="text-white/30 text-[11px] italic">Recording will appear here...</p>
              ) : (
                <div className="space-y-1">
                  {transcription.map((text, i) => (
                    <p key={i} className="text-[11px] text-white/80 leading-relaxed">{text}</p>
                  ))}
                  {interimText && <p className="text-[11px] text-white/40 italic">{interimText}</p>}
                </div>
              )}
            </div>
          </div>

        </div>
      )
    },
    chat: {
      label: "Assistant", icon: MessageSquare,
      content: (
        <div className="p-3 flex flex-col gap-3" style={{ minHeight: '140px' }}>
          <div className="flex-1 overflow-y-auto space-y-2 max-h-64 min-h-[100px]">
            {chatMessages.length === 0 ? (
              <div className="text-center text-white/30 text-[11px] pt-4">
                <MessageSquare size={24} className="mx-auto mb-2 opacity-40" />
                <p>Ask about the lecture or use quick actions below</p>
              </div>
            ) : (
              chatMessages.map((msg, i) => (
                <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[80%] px-3 py-1.5 rounded-xl text-xs shadow-md border ${msg.role === "user"
                    ? "bg-gray-700/80 text-gray-100 border-gray-600/40"
                    : "bg-black/40 text-white/80 border-white/10"
                    }`} style={{ wordBreak: "break-word", lineHeight: "1.4" }}>
                    {msg.role === "assistant" ? <span dangerouslySetInnerHTML={{ __html: msg.content }} /> : msg.content}
                  </div>
                </div>
              ))
            )}
            {chatLoading && (
              <div className="flex justify-start">
                <div className="bg-black/40 text-white/50 px-3 py-1.5 rounded-xl text-xs border border-white/10 shadow-md">
                  <span className="inline-flex items-center gap-1">
                    <span className="animate-pulse">●</span>
                    <span className="animate-pulse animation-delay-200">●</span>
                    <span className="animate-pulse animation-delay-400">●</span>
                    <span className="ml-1">Thinking...</span>
                  </span>
                </div>
              </div>
            )}
          </div>

          <form onSubmit={e => { e.preventDefault(); handleAskSubmit(); }} className="flex gap-2 items-center">
            <input ref={chatInputRef} className="flex-1 rounded-lg px-3 py-2 bg-black/40 text-white placeholder-white/30 text-xs focus:outline-none focus:ring-1 focus:ring-white/20 border border-white/10 shadow-lg" placeholder="Ask a question..." value={askInput} onChange={e => setAskInput(e.target.value)} disabled={chatLoading} />
            <button type="submit" disabled={chatLoading || !askInput.trim()} className="p-2 rounded-lg bg-gray-600/80 hover:bg-gray-700/80 border border-gray-500/60 disabled:opacity-50">
              <SendHorizonal size={14} className="text-white" />
            </button>
          </form>
        </div>
      )
    },
    settings: {
      label: "Settings", icon: Settings,
      content: (
        <div className="p-3 flex flex-col gap-3" style={{ minHeight: '140px' }}>
          <span className="text-[10px] font-semibold uppercase tracking-widest text-white/50">Groq API</span>
          <input
            className="w-full rounded-lg px-3 py-2 bg-black/40 text-white placeholder-white/30 text-xs border border-white/10 shadow-lg focus:outline-none focus:ring-1 focus:ring-white/20 font-mono"
            placeholder="gsk_..."
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            type="password"
          />
          <span className="text-[10px] font-semibold uppercase tracking-widest text-white/50">LLM Model</span>
          <select
            className="w-full rounded-lg px-3 py-2 bg-black/40 text-white text-xs border border-white/10 shadow-lg focus:outline-none focus:ring-1 focus:ring-white/20"
            value={selectedModel}
            onChange={(e) => setSelectedModel(e.target.value)}
          >
            {(availableModels.length === 0
              ? ["llama-3.3-70b-versatile", "llama-3.1-8b-instant", "openai/gpt-oss-120b", "openai/gpt-oss-20b"]
              : availableModels
            ).map(m => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
          <span className="text-[10px] font-semibold uppercase tracking-widest text-white/50">STT Model</span>
          <select
            className="w-full rounded-lg px-3 py-2 bg-black/40 text-white text-xs border border-white/10 shadow-lg focus:outline-none focus:ring-1 focus:ring-white/20"
            value={selectedSTT}
            onChange={(e) => setSelectedSTT(e.target.value)}
          >
            {(availableSTT.length === 0
              ? ["whisper-large-v3-turbo", "whisper-large-v3"]
              : availableSTT
            ).map(m => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
          <div className="flex items-center gap-2">
            <button
              onClick={saveSettings}
              disabled={savingSettings || !apiKey.trim()}
              className="px-4 py-1.5 rounded-lg bg-gray-600/80 hover:bg-gray-700/80 border border-gray-500/60 text-xs text-white disabled:opacity-50 transition-colors"
            >
              {savingSettings ? 'Saving...' : 'Apply'}
            </button>
            {settingsMessage && (
              <span className="text-[10px] text-green-400/80">{settingsMessage}</span>
            )}
          </div>
        </div>
      )
    }
  };

  return (
    <div ref={containerRef} className="select-none" style={{ position: "relative", width: "100%", pointerEvents: "auto" }}>
      <div className="bg-transparent w-full">
        <div className="px-2 py-1">
          <div className="w-fit">
            <div className="liquid-glass-bar draggable-area py-1 px-4 flex items-center justify-center gap-4">
              {/* Recording */}
              <div className="flex items-center gap-2">
                <button
                  onClick={isRecording ? onStop : onStart}
                  className={`transition-colors rounded-md px-2 py-1 text-[11px] leading-none flex items-center gap-1 ${isRecording ? 'bg-red-500/70 hover:bg-red-500/90 text-white' : 'bg-white/10 hover:bg-white/20 text-white/70'
                    }`}
                >
                  {isRecording ? <span className="animate-pulse">●</span> : <Mic size={12} />}
                  {isRecording ? ' Stop' : ' Record'}
                </button>
                {isRecording && (
                  <span className="text-[10px] text-red-400/90 font-mono">{formatTime(recordingTime)}</span>
                )}
              </div>

              <div className="h-4 w-px bg-white/20" />

              {/* Chat */}
              <button onClick={() => setActivePanel(activePanel === 'chat' ? null : 'chat')} className={`transition-colors rounded-md px-2 py-1 text-[11px] leading-none flex items-center gap-1 ${activePanel === 'chat' ? 'bg-white/20 text-white' : 'bg-white/10 hover:bg-white/20 text-white/70'}`}>
                <MessageSquare size={12} /> Chat
              </button>

              {/* Notes */}
              <button onClick={() => setActivePanel(activePanel === 'notes' ? null : 'notes')} className={`transition-colors rounded-md px-2 py-1 text-[11px] leading-none flex items-center gap-1 ${activePanel === 'notes' ? 'bg-white/20 text-white' : 'bg-white/10 hover:bg-white/20 text-white/70'}`}>
                <Notebook size={12} /> Notes
              </button>

              <div className="h-4 w-px bg-white/20" />

              {/* Export PDF */}
              <button onClick={exportPDF} className="bg-white/10 hover:bg-white/20 transition-colors rounded-md px-2 py-1 text-[11px] leading-none flex items-center gap-1 text-white/70" title="Export as PDF">
                <FileDown size={12} /> PDF
              </button>

              {/* Settings */}
              <button onClick={() => setActivePanel(activePanel === 'settings' ? null : 'settings')} className={`transition-colors rounded-md px-2 py-1 text-[11px] leading-none flex items-center gap-1 ${activePanel === 'settings' ? 'bg-white/20 text-white' : 'bg-white/10 hover:bg-white/20 text-white/70'}`}>
                <Settings size={12} /> Settings
              </button>

              {/* Quit */}
              <button onClick={() => window.electronAPI?.quitApp?.()} className="text-red-400/70 hover:text-red-400 transition-colors" title="Quit">
                <X size={14} />
              </button>
            </div>
          </div>

          {/* Dropdown Panels */}
          {activePanel && (
            <div ref={contentRef} className="mt-2 w-full mx-auto liquid-glass chat-container p-1">
              {panels[activePanel]?.content}
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
