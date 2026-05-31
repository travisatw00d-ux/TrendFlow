import EngagementBadge from "./EngagementBadge";

function formatCount(n) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return n.toString();
}

function timeAgo(dateStr) {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = Math.max(0, now - then);
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return mins + "m";
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return hrs + "h";
  const days = Math.floor(hrs / 24);
  if (days < 30) return days + "d";
  const months = Math.floor(days / 30);
  return months + "mo";
}

export default function VideoCard({ video, isSelected, onClick }) {
  const caption =
    video.caption.length > 80
      ? video.caption.slice(0, 80) + "..."
      : video.caption;

  return (
    <button
      onClick={onClick}
      className={`w-full text-left rounded-xl overflow-hidden border transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg ${
        isSelected
          ? "ring-2 ring-purple-500 border-purple-500 shadow-lg shadow-purple-500/10"
          : "border-gray-800 hover:border-gray-700"
      }`}
    >
      <div className="aspect-[16/10] bg-gray-800 relative overflow-hidden">
        <img
          src={video.thumbnail}
          alt={video.caption}
          className="w-full h-full object-cover"
          loading="lazy"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-gray-950/60 via-transparent to-transparent" />
        <div className="absolute bottom-1.5 left-1.5">
          <EngagementBadge score={video.engagementScore ?? 0} />
        </div>
        {video.aiScore != null && (
          <div className="absolute top-1.5 right-1.5 bg-purple-900/80 text-purple-200 text-[10px] font-semibold px-1.5 py-0.5 rounded-md border border-purple-700/50">
            {video.aiScore}/10
          </div>
        )}
      </div>

      <div className="p-2.5 space-y-1">
        <p className="text-xs text-gray-200 leading-snug line-clamp-1">
          {caption}
        </p>

        <p className="text-[11px] text-gray-400 truncate">{video.creator}</p>

        <div className="flex items-center gap-3 text-[11px] text-gray-500">
          <span className="flex items-center gap-1">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
            </svg>
            {formatCount(video.views)}
          </span>
          <span className="flex items-center gap-1">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
            </svg>
            {formatCount(video.likes)}
          </span>
          <span className="ml-auto text-[11px] text-gray-600">{timeAgo(video.publishedAt)}</span>
        </div>
      </div>
    </button>
  );
}
