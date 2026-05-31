export default function EngagementBadge({ score = 0 }) {
  let color = "bg-red-500/20 text-red-400 border-red-500/30";
  if (score > 80) {
    color = "bg-green-500/20 text-green-400 border-green-500/30";
  } else if (score > 50) {
    color = "bg-yellow-500/20 text-yellow-400 border-yellow-500/30";
  }

  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full border ${color}`}>
      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
      </svg>
      {score}
    </span>
  );
}
