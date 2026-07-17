import { useState, useRef, useEffect } from 'react';

export function LLMPanel({ messages, onSendMessage, onSummarize, transcription, notes }) {
  const [input, setInput] = useState("");
  const scrollRef = useRef(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = () => {
    if (!input.trim()) return;
    onSendMessage(input);
    setInput("");
  };

  return (
    <div className="glass rounded-lg flex flex-col flex-1 min-h-0">
      <div className="flex items-center justify-between px-3 pt-2 pb-1">
        <span className="text-[10px] font-semibold uppercase tracking-widest text-white/40">Assistant</span>
        <button
          className="text-[9px] px-1.5 py-0.5 rounded bg-indigo-500/15 text-indigo-300/70 hover:bg-indigo-500/25 transition-colors disabled:opacity-30"
          onClick={onSummarize}
          disabled={!transcription.length}
        >
          Summarize
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-3 space-y-1.5 text-[11px]" ref={scrollRef}>
        {messages.length === 0 ? (
          <div className="text-white/20 italic space-y-1">
            <p>LLM has context of your notes and the transcription.</p>
            <p className="text-[10px]">Try: "Summarize", "Explain this", "Add X to notes"</p>
          </div>
        ) : (
          messages.map((msg, i) => (
            <div key={i} className={`leading-relaxed ${msg.role === 'user' ? 'text-indigo-300/80' : 'text-white/70'}`}>
              <span className="text-[8px] uppercase tracking-wider opacity-40 block">
                {msg.role === 'user' ? 'You' : 'Assistant'}
              </span>
              <div className="whitespace-pre-wrap">{msg.content}</div>
            </div>
          ))
        )}
      </div>

      <div className="px-3 pb-2 pt-1.5 border-t border-white/5">
        <div className="flex gap-1.5">
          <input
            className="flex-1 glass-input rounded px-2 py-1.5 text-[11px]"
            placeholder="Ask the LLM..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
          />
          <button
            className="px-2.5 py-1.5 rounded text-[11px] font-medium bg-indigo-500/20 text-indigo-300 hover:bg-indigo-500/30 transition-colors disabled:opacity-30"
            onClick={handleSend}
            disabled={!input.trim()}
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
