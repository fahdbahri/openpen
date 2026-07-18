import { useState } from 'react';

export function NotesPanel({ notes, onNotesChange, onEditByLLM }) {
  const [editInstruction, setEditInstruction] = useState("");

  const handleEdit = () => {
    if (!editInstruction.trim()) return;
    onEditByLLM(editInstruction);
    setEditInstruction("");
  };

  return (
    <div className="p-3 flex flex-col gap-2" style={{ minHeight: '140px' }}>
      <textarea
        className="w-full flex-1 min-h-[100px] resize-none rounded-lg px-3 py-2 bg-white/25 backdrop-blur-md text-gray-800 placeholder-gray-500 text-xs focus:outline-none focus:ring-1 focus:ring-gray-400/60 border border-white/40 shadow-lg"
        placeholder="Write your notes here..."
        value={notes}
        onChange={(e) => onNotesChange(e.target.value)}
      />
      <div className="flex gap-2 items-center">
        <input
          className="flex-1 rounded-lg px-3 py-2 bg-white/25 backdrop-blur-md text-gray-800 placeholder-gray-500 text-xs focus:outline-none focus:ring-1 focus:ring-gray-400/60 border border-white/40 shadow-lg"
          placeholder="Ask LLM to edit notes..."
          value={editInstruction}
          onChange={(e) => setEditInstruction(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleEdit()}
        />
        <button
          onClick={handleEdit}
          disabled={!editInstruction.trim()}
          className="px-3 py-2 rounded-lg bg-gray-600/80 hover:bg-gray-700/80 border border-gray-500/60 text-xs text-white disabled:opacity-50 transition-colors"
        >
          Edit
        </button>
      </div>
    </div>
  );
}
