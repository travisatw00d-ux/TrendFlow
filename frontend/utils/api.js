const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";

export async function fetchTrending(topic, limit = 500, offset = 0) {
  const res = await fetch(`${API_BASE}/api/trending?topic=${encodeURIComponent(topic)}&limit=${limit}&offset=${offset}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Request failed with status ${res.status}`);
  }
  return res.json();
}

export async function fetchSummary(caption) {
  const res = await fetch(`${API_BASE}/api/summarize`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ caption }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Request failed with status ${res.status}`);
  }
  return res.json();
}

export async function addCacheTopic(topic) {
  const res = await fetch(`${API_BASE}/api/cache/add`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ topic }),
  });
  return res.json();
}

export async function removeCacheTopic(topic) {
  const res = await fetch(`${API_BASE}/api/cache/remove`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ topic }),
  });
  return res.json();
}

export async function fetchCacheStatus() {
  const res = await fetch(`${API_BASE}/api/cache/status`);
  return res.json();
}

export async function rankVideos(topic, prompt) {
  const res = await fetch(`${API_BASE}/api/rank`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ topic, prompt }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Rank failed: ${res.status}`);
  }
  const { job_id } = await res.json();
  return job_id;
}

export async function pollRankStatus(job_id) {
  const res = await fetch(`${API_BASE}/api/rank/status/${job_id}`);
  if (!res.ok) throw new Error("status fetch failed");
  return res.json();
}

export async function getTopicConfig(topic) {
  const res = await fetch(`${API_BASE}/api/topic-config?topic=${encodeURIComponent(topic)}`);
  return res.json();
}

export async function updateTopicConfig(topic, config) {
  const res = await fetch(`${API_BASE}/api/topic-config`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ topic, config }),
  });
  return res.json();
}

export async function downloadVideo(video) {
  const payload = {
    videoId: video.id,
    videoInfo: video,
  };
  const res = await fetch(`${API_BASE}/api/download-video`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Download failed: ${res.status}`);
  }
  return res.json();
}
