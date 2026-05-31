const FILTERS = [
  { key: "all", label: "All" },
  { key: "ranked", label: "Ranked" },
  { key: "newest", label: "Newest" },
  { key: "most_viewed", label: "Most Viewed" },
  { key: "rising", label: "Quickly Rising" },
];

export default function FilterBar({ active, onChange, disabled }) {
  return (
    <div className="flex items-center gap-1 flex-wrap">
      {FILTERS.map((f) => (
        <button
          key={f.key}
          onClick={() => onChange(f.key)}
          disabled={disabled}
          className={`px-3.5 py-1.5 text-sm font-medium rounded-lg transition-all ${
            active === f.key
              ? "bg-purple-600 text-white shadow-sm"
              : "text-gray-400 hover:text-gray-200 hover:bg-gray-800"
          } disabled:opacity-40`}
        >
          {f.label}
        </button>
      ))}
    </div>
  );
}
