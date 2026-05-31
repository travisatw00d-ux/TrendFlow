import { useState, useEffect, useRef } from "react";
import { fetchSummary, downloadVideo } from "@/utils/api";

function formatCount(n) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return n.toString();
}

function getEmbedUrl(video) {
  if (video.id && !isNaN(video.id)) {
    return `https://www.tiktok.com/embed/v2/${video.id}`;
  }
  const parts = video.videoUrl?.split("/video/") ?? [];
  if (parts.length === 2) {
    return `https://www.tiktok.com/embed/v2/${parts[1]}`;
  }
  return null;
}

export default function SelectedVideoPanel({ video, onClose, onAddToEditor, isRecording }) {
  const [playing, setPlaying] = useState(false);
  const [summary, setSummary] = useState(null);
  const [talkingPoints, setTalkingPoints] = useState(null);
  const [loadingAI, setLoadingAI] = useState(false);
  const [recordingStatus, setRecordingStatus] = useState(null);
  const recorderRef = useRef(null);

  useEffect(() => {
    if (!video) return;
    setPlaying(false);
    setSummary(null);
    setTalkingPoints(null);
    setLoadingAI(true);
    fetchSummary(video.caption)
      .then((data) => {
        setSummary(data.summary);
        setTalkingPoints(data.talkingPoints);
      })
      .catch(() => {
        setSummary("Could not generate summary.");
        setTalkingPoints([]);
      })
      .finally(() => setLoadingAI(false));
  }, [video?.id]);

  if (!video) return null;

  const embedUrl = getEmbedUrl(video);

  return (
    <div className="w-full lg:w-[32rem] bg-gray-900 border-l border-gray-800 overflow-y-auto lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] rounded-xl">
      <div className="p-4 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-100">Video Details</h2>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-gray-500 hover:text-gray-100 hover:bg-gray-800 transition-all"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {playing && embedUrl ? (
          <div className="aspect-[9/16] bg-black rounded-lg overflow-hidden">
            <iframe
              src={embedUrl}
              className="w-full h-full"
              allow="autoplay; fullscreen"
              allowFullScreen
              title="TikTok video"
            />
          </div>
        ) : (
          <button
            onClick={() => setPlaying(true)}
            className="aspect-[9/16] bg-gray-800 rounded-lg overflow-hidden relative group w-full cursor-pointer text-left"
          >
            <img
              src={video.thumbnail}
              alt={video.caption}
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-black/30 flex items-center justify-center group-hover:bg-black/40 transition-colors">
              <div className="w-14 h-14 bg-purple-600/90 rounded-full flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
                <svg className="w-6 h-6 text-white ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z" />
                </svg>
              </div>
            </div>
          </button>
        )}

        <div className="space-y-3">
          <p className="text-sm text-gray-200 leading-relaxed">{video.caption}</p>

          <a
            href={video.videoUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-sm text-blue-400 hover:text-blue-300 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
            {video.creator} &middot; Open on TikTok
          </a>
          {video.webVideoUrl && video.webVideoUrl !== video.videoUrl && (
            <a
              href={video.webVideoUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-xs text-gray-500 hover:text-gray-300 transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Direct video link
            </a>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="bg-gray-800 rounded-lg p-3 text-center">
            <p className="text-lg font-bold text-gray-100">{formatCount(video.views)}</p>
            <p className="text-xs text-gray-400">Views</p>
          </div>
          <div className="bg-gray-800 rounded-lg p-3 text-center">
            <p className="text-lg font-bold text-gray-100">{formatCount(video.likes)}</p>
            <p className="text-xs text-gray-400">Likes</p>
          </div>
          <div className="bg-gray-800 rounded-lg p-3 text-center">
            <p className="text-lg font-bold text-gray-100">{formatCount(video.comments)}</p>
            <p className="text-xs text-gray-400">Comments</p>
          </div>
          <div className="bg-gray-800 rounded-lg p-3 text-center">
            <p className="text-lg font-bold text-gray-100">{formatCount(video.shares)}</p>
            <p className="text-xs text-gray-400">Shares</p>
          </div>
        </div>

        <div className="space-y-1">
          <h3 className="text-sm font-medium text-gray-300">AI Summary</h3>
          <div className="bg-gray-800 rounded-lg p-4 text-sm border border-gray-700 min-h-[60px]">
            {loadingAI ? (
              <div className="flex items-center gap-2 text-gray-500">
                <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Generating...
              </div>
            ) : (
              <p className="text-gray-200 leading-relaxed">{summary}</p>
            )}
          </div>
        </div>

        <div className="space-y-1">
          <h3 className="text-sm font-medium text-gray-300">Talking Points</h3>
          <div className="bg-gray-800 rounded-lg p-4 text-sm border border-gray-700 min-h-[60px]">
            {loadingAI ? (
              <div className="flex items-center gap-2 text-gray-500">
                <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Generating...
              </div>
            ) : talkingPoints && talkingPoints.length > 0 ? (
              <ul className="space-y-1.5">
                {talkingPoints.map((point, i) => (
                  <li key={i} className="flex items-start gap-2 text-gray-300">
                    <span className="text-purple-400 mt-0.5 shrink-0">&bull;</span>
                    {point}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-gray-500 italic">No talking points available.</p>
            )}
          </div>
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => {
              const embedUrl = getEmbedUrl(video);
              if (!embedUrl) { window.open(video.videoUrl, "_blank"); return; }
              window.open(embedUrl, "_blank", "width=420,height=750,menubar=no,toolbar=no,location=no");
            }}
            className="flex-1 py-3 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-xl text-gray-300 hover:text-gray-100 font-medium transition-all flex items-center justify-center gap-2"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
            Open for Recording
          </button>

          <button
            onClick={async () => {
              try {
                const result = await downloadVideo(video);
                if (result.url) {
                  const a = document.createElement("a");
                  a.href = `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000"}${result.url}?download=1`;
                  a.download = `${video.creator}_${video.id}.mp4`;
                  document.body.appendChild(a);
                  a.click();
                  a.remove();
                }
              } catch (e) {
                alert("Download failed: " + e.message);
              }
            }}
            className="flex-1 py-3 bg-green-700 hover:bg-green-600 border border-green-600 rounded-xl text-white font-medium transition-all flex items-center justify-center gap-2"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Download MP4
          </button>
        </div>

        <button
          onClick={async () => {
            try {
              const result = await downloadVideo(video);
              if (result.url) {
                const resp = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000"}${result.url}?download=0`);
                const blob = await resp.blob();
                const blobUrl = URL.createObjectURL(blob);
                onAddToEditor({
                  ...video,
                  recordedBlobUrl: blobUrl,
                  recordedBlob: blob,
                  savedFile: `${video.creator}_${video.id}.mp4`,
                });
              }
            } catch (e) {
              // fallback: open recording popup
              setRecordingStatus("starting");
              const popupUrl = `http://localhost:5000/api/embed-player/${video.id}`;
              const popup = window.open(
                popupUrl,
                "trendflow-recording",
                `width=420,height=750,menubar=no,toolbar=no,location=no,status=no`
              );
              if (!popup) { setRecordingStatus(null); return; }
              await new Promise((r) => setTimeout(r, 2000));
              const stream = await navigator.mediaDevices.getDisplayMedia({
                video: true,
                audio: true,
              });
              const duration = Math.max((video.duration || 10), 5);
              const chunks = [];
              const recorder = new MediaRecorder(stream, {
                mimeType: MediaRecorder.isTypeSupported("video/webm;codecs=vp9")
                  ? "video/webm;codecs=vp9"
                  : "video/webm",
              });
              recorderRef.current = recorder;
              recorder.ondataavailable = (e) => {
                if (e.data.size > 0) chunks.push(e.data);
              };
              recorder.onstop = async () => {
                try { popup.close(); } catch {}
                const blob = new Blob(chunks, { type: "video/webm" });
                const blobUrl = URL.createObjectURL(blob);
                let savedPath = null;
                try {
                  const handle = await window.showSaveFilePicker({
                    suggestedName: `${video.creator}_${video.id || "tiktok"}.webm`,
                    types: [{ description: "Video", accept: { "video/webm": [".webm"] } }],
                  });
                  const writable = await handle.createWritable();
                  await writable.write(blob);
                  await writable.close();
                  savedPath = handle.name;
                } catch (saveErr) {}
                onAddToEditor({
                  ...video,
                  recordedBlobUrl: blobUrl,
                  recordedBlob: blob,
                  savedFile: savedPath,
                });
                stream.getTracks().forEach((t) => t.stop());
                setRecordingStatus(null);
                recorderRef.current = null;
              };
              recorder.start(100);
              setRecordingStatus("recording");
              setTimeout(() => {
                if (recorder.state === "recording") recorder.stop();
              }, duration * 1000 + 1000);
            }
          }}
          disabled={isRecording || !!recordingStatus}
          className={`w-full py-3 rounded-xl font-medium transition-all flex items-center justify-center gap-2 ${
            recordingStatus === "recording"
              ? "bg-red-600 text-white animate-pulse"
              : "bg-purple-600 hover:bg-purple-500 text-white"
          } disabled:opacity-40`}
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
          {recordingStatus === "starting" ? "Preparing..." : recordingStatus === "recording" ? "Recording..." : "Add to Editor"}
        </button>

      </div>
    </div>
  );
}
