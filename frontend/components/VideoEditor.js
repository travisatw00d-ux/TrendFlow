import { useState, useRef, useMemo, useCallback } from "react";

function formatDuration(secs) {
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function getEmbedUrl(video) {
  if (video.id && !isNaN(video.id))
    return `https://www.tiktok.com/embed/v2/${video.id}`;
  const parts = video.videoUrl?.split("/video/") ?? [];
  if (parts.length === 2)
    return `https://www.tiktok.com/embed/v2/${parts[1]}`;
  return null;
}

export default function VideoEditor({ clips, onRemoveClip, onClear }) {
  const [currentClipIdx, setCurrentClipIdx] = useState(0);
  const [seek, setSeek] = useState(0);
  const [dragging, setDragging] = useState(false);
  const timelineRef = useRef(null);

  const totalDuration = useMemo(
    () => clips.reduce((s, c) => s + (c.duration || 10), 0),
    [clips]
  );

  // Calculate which clip is at a given seek position (0-1)
  const clipAtSeek = useMemo(() => {
    if (clips.length === 0) return 0;
    const target = seek * totalDuration;
    let accumulated = 0;
    for (let i = 0; i < clips.length; i++) {
      accumulated += clips[i].duration || 10;
      if (target < accumulated) return i;
    }
    return clips.length - 1;
  }, [seek, totalDuration, clips]);

  // Build clip segments with start/end ratios (0-1)
  const segments = useMemo(() => {
    let acc = 0;
    return clips.map((c) => {
      const dur = c.duration || 10;
      const start = acc / totalDuration;
      acc += dur;
      return { ...c, start, end: acc / totalDuration, dur };
    });
  }, [clips, totalDuration]);

  const handleTimelineClick = useCallback(
    (e) => {
      if (!timelineRef.current) return;
      const rect = timelineRef.current.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width;
      setSeek(Math.max(0, Math.min(1, x)));
    },
    []
  );

  const handleTimelineDrag = useCallback(
    (e) => {
      if (!dragging || !timelineRef.current) return;
      const rect = timelineRef.current.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width;
      setSeek(Math.max(0, Math.min(1, x)));
    },
    [dragging]
  );

  const currentClip = clips[currentClipIdx];
  const embedUrl = currentClip ? getEmbedUrl(currentClip) : null;
  const hasRecording = currentClip?.recordedBlobUrl;

  return (
    <div className="h-full flex flex-col bg-gray-950 border-t border-gray-800">
      {/* Preview area — shows current clip */}
      <div className="flex-1 flex items-center justify-center bg-gray-900 min-h-0 p-4">
        {clips.length === 0 ? (
          <p className="text-gray-500 text-sm">Add clips to start editing</p>
        ) : hasRecording ? (
          <div className="h-full max-h-full bg-black rounded-lg overflow-hidden">
            <video
              key={currentClipIdx}
              src={currentClip.recordedBlobUrl}
              className="h-full max-w-full object-contain"
              controls
              autoPlay
            />
          </div>
        ) : embedUrl ? (
          <div className="aspect-[9/16] h-full max-h-full bg-black rounded-lg overflow-hidden">
            <iframe
              key={currentClipIdx}
              src={embedUrl}
              className="w-full h-full"
              allow="autoplay; fullscreen"
              title="Preview"
            />
          </div>
        ) : null}
      </div>

      {/* Timeline bar */}
      <div className="px-4 py-3 space-y-3">
        {/* Clip thumbnails row */}
        <div className="flex gap-1 overflow-x-auto pb-1">
          {clips.map((clip, i) => {
            const isCurrent = i === currentClipIdx;
            return (
              <button
                key={clip.id + "_" + i}
                onClick={() => { setCurrentClipIdx(i); setSeek(0); }}
                className={`flex-shrink-0 w-16 rounded-lg overflow-hidden border-2 transition-all ${
                  isCurrent
                    ? "border-purple-500 ring-1 ring-purple-500/30"
                    : "border-gray-700 hover:border-gray-500"
                }`}
              >
                <img
                  src={clip.thumbnail}
                  alt=""
                  className="w-full aspect-[9/16] object-cover bg-gray-800"
                />
                <div className="text-[10px] text-gray-400 text-center py-0.5 bg-gray-900 truncate px-1">
                  {clip.creator}
                </div>
              </button>
            );
          })}
        </div>

        {/* Timeline track */}
        <div
          ref={timelineRef}
          className="relative h-8 bg-gray-800 rounded-lg cursor-pointer overflow-hidden"
          onMouseDown={(e) => {
            setDragging(true);
            handleTimelineClick(e);
          }}
          onMouseMove={handleTimelineDrag}
          onMouseUp={() => setDragging(false)}
          onMouseLeave={() => setDragging(false)}
        >
          {/* Clip segments */}
          {segments.map((seg, i) => (
            <div
              key={seg.id + "_seg_" + i}
              className="absolute top-0 h-full border-r border-gray-900/50 flex items-center justify-center text-[10px] text-white/70 overflow-hidden"
              style={{
                left: `${seg.start * 100}%`,
                width: `${(seg.end - seg.start) * 100}%`,
                backgroundColor: i === clipAtSeek ? "#7c3aed" : "#374151",
              }}
            >
              <span className="truncate px-1">{seg.creator}</span>
            </div>
          ))}

          {/* Playhead */}
          <div
            className="absolute top-0 w-0.5 h-full bg-white shadow-lg pointer-events-none z-10"
            style={{ left: `${seek * 100}%` }}
          />
        </div>

        {/* Time display + controls */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-400 font-mono">
              {formatDuration(seek * totalDuration)} / {formatDuration(totalDuration)}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {clips.length > 0 && (
              <button
                onClick={onClear}
                className="text-[10px] px-2 py-1 rounded bg-gray-800 text-gray-400 hover:text-red-400 transition-colors"
              >
                Clear All
              </button>
            )}
            {clips.map((_, i) => (
              <button
                key={i}
                onClick={() => onRemoveClip(i)}
                className="text-[10px] px-1.5 py-0.5 rounded bg-gray-800 text-gray-500 hover:text-red-400 hover:bg-gray-700 transition-colors"
              >
                x{i + 1}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
