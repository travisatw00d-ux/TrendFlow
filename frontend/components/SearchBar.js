import { useState, useMemo, useRef, useEffect } from "react";

export default function SearchBar({ topic, setTopic, onSearch, onRefresh, loading, cachedTopics, cacheCounts }) {
  const [input, setInput] = useState(topic);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedIdx, setSelectedIdx] = useState(-1);
  const inputRef = useRef(null);
  const dropdownRef = useRef(null);

  const suggestions = useMemo(() => {
    if (!input.trim() || !cachedTopics) return [];
    const q = input.trim().toLowerCase();
    return cachedTopics
      .filter((t) => t.includes(q))
      .map((t) => ({ topic: t, count: cacheCounts?.[t] ?? 0 }));
  }, [input, cachedTopics, cacheCounts]);

  const handleSubmit = (e) => {
    e.preventDefault();
    const trimmed = input.trim();
    if (trimmed) {
      setTopic(trimmed);
      onSearch(trimmed);
      setShowSuggestions(false);
    }
  };

  const selectSuggestion = (t) => {
    setInput(t);
    setTopic(t);
    onSearch(t);
    setShowSuggestions(false);
    setSelectedIdx(-1);
  };

  useEffect(() => {
    const handleClick = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target) &&
          inputRef.current && !inputRef.current.contains(e.target)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  return (
    <form onSubmit={handleSubmit} className="flex items-center gap-3 w-full max-w-3xl mx-auto relative">
      <div className="relative flex-1">
        <svg
          className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500"
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            setShowSuggestions(true);
            setSelectedIdx(-1);
          }}
          onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
          onKeyDown={(e) => {
            if (!showSuggestions || suggestions.length === 0) return;
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setSelectedIdx((i) => Math.min(i + 1, suggestions.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setSelectedIdx((i) => Math.max(i - 1, 0));
            } else if (e.key === "Enter" && selectedIdx >= 0) {
              e.preventDefault();
              selectSuggestion(suggestions[selectedIdx].topic);
            } else if (e.key === "Escape") {
              setShowSuggestions(false);
              setSelectedIdx(-1);
            }
          }}
          placeholder="Search a topic (e.g. housing crisis)..."
          className="w-full pl-10 pr-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500 transition-all"
        />

        {showSuggestions && suggestions.length > 0 && (
          <div
            ref={dropdownRef}
            className="absolute top-full left-0 right-0 mt-1 bg-gray-900 border border-gray-700 rounded-xl shadow-xl z-50 overflow-hidden"
          >
            {suggestions.map((s, i) => (
              <button
                key={s.topic}
                type="button"
                onMouseDown={() => selectSuggestion(s.topic)}
                className={`w-full text-left px-4 py-2.5 flex items-center justify-between text-sm transition-all ${
                  i === selectedIdx
                    ? "bg-purple-900/40 text-purple-200"
                    : "text-gray-300 hover:bg-gray-800"
                }`}
              >
                <span className="truncate">{s.topic}</span>
                <span className="text-[10px] text-gray-500 shrink-0 ml-2">{s.count} videos</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <button
        type="submit"
        disabled={loading || !input.trim()}
        className="px-6 py-3 bg-purple-600 hover:bg-purple-500 disabled:bg-gray-700 disabled:text-gray-500 text-white font-medium rounded-xl transition-all"
      >
        {loading ? (
          <svg className="animate-spin w-5 h-5 mx-auto" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        ) : (
          "Search"
        )}
      </button>

      <button
        type="button"
        onClick={onRefresh}
        disabled={loading || !topic}
        className="p-3 bg-gray-800 border border-gray-700 rounded-xl text-gray-400 hover:text-gray-100 hover:border-gray-600 disabled:opacity-40 transition-all"
        title="Refresh"
      >
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
        </svg>
      </button>
    </form>
  );
}
