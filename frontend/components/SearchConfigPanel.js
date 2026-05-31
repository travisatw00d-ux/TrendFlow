import { useState } from "react";

const MODES = [
  { key: "informational", label: "Informational", desc: "News, analysis, guides" },
  { key: "reaction", label: "Reaction/Rant", desc: "Emotional, rants, drama" },
  { key: "viral", label: "Viral", desc: "Trending, popular clips" },
  { key: "mixed", label: "Mixed", desc: "Balanced mix of all types" },
];

export default function SearchConfigPanel({ config, topic, onSave, onClose }) {
  const [mode, setMode] = useState(config.mode || "informational");
  const [extras, setExtras] = useState(
    Array.isArray(config.extra_modifiers) ? config.extra_modifiers.join(", ") : ""
  );
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    const parsed = extras
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter((s) => s.length > 0);
    try {
      await onSave({ mode, extra_modifiers: parsed });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 pb-4">
      <div className="bg-gray-900 border border-gray-700 rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold text-gray-300 uppercase tracking-wider">
            Search Mode — {topic}
          </h3>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300 text-xs">Close</button>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {MODES.map((m) => (
            <button
              key={m.key}
              onClick={() => setMode(m.key)}
              className={`text-xs text-left px-3 py-2 rounded-lg border transition-all ${
                mode === m.key
                  ? "bg-purple-900/40 border-purple-600 text-purple-200"
                  : "bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-600"
              }`}
            >
              <div className="font-medium">{m.label}</div>
              <div className="text-[10px] opacity-70 mt-0.5">{m.desc}</div>
            </button>
          ))}
        </div>
        <div>
          <label className="text-[10px] text-gray-500 uppercase tracking-wider block mb-1">
            Extra keywords (comma-separated)
          </label>
          <input
            value={extras}
            onChange={(e) => setExtras(e.target.value)}
            placeholder="e.g. inflation, budget, recession"
            className="w-full text-xs px-3 py-1.5 rounded-lg bg-gray-800 border border-gray-700 text-gray-200 placeholder-gray-500 focus:outline-none focus:border-purple-500/50"
          />
        </div>
        <div className="flex justify-end">
          <button
            onClick={handleSave}
            disabled={saving}
            className="text-xs px-4 py-1.5 rounded-lg bg-purple-600 text-white hover:bg-purple-500 disabled:opacity-40 transition-all"
          >
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
