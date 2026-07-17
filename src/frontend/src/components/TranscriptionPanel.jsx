import { useRef, useEffect } from 'react';

export function TranscriptionPanel({ transcription, interimText, isRecording }) {
  const scrollRef = useRef(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [transcription, interimText]);

  return (
    <div className="p-3" style={{ minHeight: '140px' }}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] font-semibold uppercase tracking-widest text-white/50">Live Transcription</span>
        {isRecording && (
          <span className="flex items-center gap-1 text-[9px] text-red-400/80">
            <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />
            REC
          </span>
        )}
      </div>
      <div className="overflow-y-auto max-h-48 min-h-[100px] rounded-lg bg-white/10 backdrop-blur-md p-3 glass-content border border-white/20 shadow-lg">
        {transcription.length === 0 && !interimText ? (
          <p className="text-white/30 text-[11px] italic">Transcription will appear here...</p>
        ) : (
          <div className="space-y-1">
            {transcription.map((text, i) => (
              <p key={i} className="text-[12px] text-white/80 leading-relaxed">{text}</p>
            ))}
            {interimText && (
              <p className="text-[12px] text-white/40 italic">{interimText}</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
