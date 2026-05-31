import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import SearchBar from "@/components/SearchBar";
import FilterBar from "@/components/FilterBar";
import VideoGrid from "@/components/VideoGrid";
import SelectedVideoPanel from "@/components/SelectedVideoPanel";
import VideoEditor from "@/components/VideoEditor";
import { fetchTrending, addCacheTopic, removeCacheTopic, fetchCacheStatus, rankVideos, pollRankStatus, getTopicConfig, updateTopicConfig } from "@/utils/api";
import SearchConfigPanel from "@/components/SearchConfigPanel";

function sortVideos(videos, filter) {
  if (!videos) return [];
  let filtered = [...videos];
  if (filter === "ranked") {
    filtered = filtered.filter((v) => v.aiScore == null || v.aiScore >= 5);
  }
  const sorted = [...filtered];
  switch (filter) {
    case "newest":
      sorted.sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));
      break;
    case "most_viewed":
      sorted.sort((a, b) => b.views - a.views);
      break;
    case "rising":
      sorted.sort((a, b) => (b.engagementScore ?? 0) - (a.engagementScore ?? 0));
      break;
    case "ranked":
      sorted.sort((a, b) => (b.aiScore ?? 0) - (a.aiScore ?? 0));
      break;
  }
  return sorted;
}

export default function Home() {
  const [topic, setTopic] = useState("");
  const [videos, setVideos] = useState([]);
  const [selectedVideo, setSelectedVideo] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState("all");
  const [dataSource, setDataSource] = useState(null);
  const [cachedTopics, setCachedTopics] = useState([]);
  const [cacheCounts, setCacheCounts] = useState({});
  const [secondsSinceRefresh, setSecondsSinceRefresh] = useState(null);
  const [workerAlive, setWorkerAlive] = useState(false);
  const [addingToCache, setAddingToCache] = useState(false);
  const [rankPrompt, setRankPrompt] = useState("");
  const [isRanking, setIsRanking] = useState(false);
  const [isRanked, setIsRanked] = useState(false);
  const [rankProgress, setRankProgress] = useState(null);
  const [rankPrompts, setRankPrompts] = useState({});
  const [topicConfig, setTopicConfig] = useState(null);
  const [showConfig, setShowConfig] = useState(false);
  const [offset, setOffset] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [editorClips, setEditorClips] = useState([]);
  const [isRecording, setIsRecording] = useState(false);
  const [showEditor, setShowEditor] = useState(false);
  const lastCachedCount = useRef(0);

  const sortedVideos = useMemo(() => sortVideos(videos, filter), [videos, filter]);
  const hiddenRankedCount = useMemo(
    () => (filter === "ranked" ? videos.filter((v) => v.aiScore != null && v.aiScore < 5).length : 0),
    [videos, filter]
  );

  const isCached = cachedTopics.includes(topic);

  // Poll cache status every 5s, tick seconds counter every 1s
  useEffect(() => {
    const poll = async () => {
      try {
        const data = await fetchCacheStatus();
        setCachedTopics(data.topics || []);
        setCacheCounts(data.video_counts || {});
        setSecondsSinceRefresh(data.seconds_since_refresh ?? null);
        setWorkerAlive(data.worker_alive ?? false);
        const prompts = data.rank_prompts || {};
        setRankPrompts(prompts);
      } catch {}
    };
    poll();
    const id = setInterval(poll, 5000);
    const tick = setInterval(() => {
      setSecondsSinceRefresh((s) => (s !== null ? s + 1 : null));
    }, 1000);
    return () => { clearInterval(id); clearInterval(tick); };
  }, []);

  // Sync rank prompt with stored prompts when topic changes (not on every poll)
  useEffect(() => {
    if (topic && rankPrompts[topic]) {
      setRankPrompt(rankPrompts[topic]);
      setIsRanked(true);
    } else {
      setIsRanked(false);
    }
  }, [topic]);

  // Load topic config when topic changes
  useEffect(() => {
    if (!topic || !cachedTopics.includes(topic)) {
      setTopicConfig(null);
      return;
    }
    getTopicConfig(topic).then((data) => {
      setTopicConfig(data.config);
    }).catch(() => {});
  }, [topic, cachedTopics]);

  // Re-fetch when cache has data or when switching to ranked filter
  const lastFetchRef = useRef(0);
  useEffect(() => {
    if (!topic || !cachedTopics.includes(topic)) return;
    const count = cacheCounts[topic] ?? 0;
    const hasCache = count > 0;
    const hasNewVideos = count > lastCachedCount.current && lastCachedCount.current > 0;
    if (hasNewVideos || (hasCache && dataSource === "mock") || filter === "ranked") {
      const now = Date.now();
      if (now - lastFetchRef.current < 10000) return;
      lastFetchRef.current = now;
      fetchTrending(topic).then((data) => {
        if (data.videos.length > 0) {
          setVideos(data.videos);
          setSelectedVideo((prev) => data.videos.find((v) => v.id === prev?.id) || data.videos[0]);
          setDataSource(data.source);
        }
      }).catch(() => {});
    }
    if (hasNewVideos) lastCachedCount.current = count;
  }, [cacheCounts, topic, cachedTopics, filter, dataSource]);

  // Periodic score refresh: re-fetch every 30s when on ranked filter
  useEffect(() => {
    if (!topic || filter !== "ranked" || !rankPrompts[topic]) return;
    const id = setInterval(() => {
      fetchTrending(topic).then((data) => {
        if (data.videos.length > 0) setVideos(data.videos);
      }).catch(() => {});
    }, 30000);
    return () => clearInterval(id);
  }, [topic, filter, rankPrompts]);

  const handleSearch = async (searchTopic) => {
    const normalized = searchTopic.toLowerCase();
    setTopic(normalized);
    lastCachedCount.current = 0;
    setOffset(0);
    setLoading(true);
    setError(null);
    try {
      const data = await fetchTrending(normalized);
      setVideos(data.videos);
      setSelectedVideo(data.videos[0] || null);
      setFilter("all");
      setDataSource(data.source);
    } catch (err) {
      setError(err.message);
      setVideos([]);
      setSelectedVideo(null);
    } finally {
      setLoading(false);
    }
  };

  const handleAddToCache = async () => {
    if (!topic || isCached) return;
    setAddingToCache(true);
    try {
      await addCacheTopic(topic);
      setCachedTopics((prev) => [...prev, topic]);
      // Auto-refresh to show cached videos immediately
      setLoading(true);
      setError(null);
      try {
        const data = await fetchTrending(topic);
        setVideos(data.videos);
        setSelectedVideo(data.videos[0] || null);
        setFilter("all");
        setDataSource(data.source);
      } catch (err) {
        setError(err.message);
        setVideos([]);
        setSelectedVideo(null);
      }
      setLoading(false);
    } catch {}
    setAddingToCache(false);
  };

  const handleRemoveCache = async (t) => {
    try {
      await removeCacheTopic(t);
      setCachedTopics((prev) => prev.filter((x) => x !== t));
    } catch {}
  };

  const handleRefresh = () => {
    if (topic) handleSearch(topic);
  };

  const handleRank = async () => {
    if (!topic || !rankPrompt.trim() || isRanking) return;
    setIsRanking(true);
    setIsRanked(false);
    setRankProgress({ stage: "starting", progress: 0, total: 1 });
    setError(null);
    try {
      const jobId = await rankVideos(topic, rankPrompt.trim());
      const poll = async () => {
        const status = await pollRankStatus(jobId);
        if (status.error) { setError(status.error); setIsRanking(false); return; }
        setRankProgress({ stage: status.stage, progress: status.progress, total: status.total });
        if (status.done) {
          if (status.result) {
            setVideos(status.result.videos);
            setSelectedVideo(status.result.videos[0] || null);
            setFilter("ranked");
            setDataSource(status.result.source);
            setIsRanked(true);
          }
          setIsRanking(false);
          setRankProgress(null);
        } else {
          setTimeout(poll, 2000);
        }
      };
      setTimeout(poll, 1000);
    } catch (err) {
      setError(err.message);
      setIsRanking(false);
      setRankProgress(null);
    }
  };

  const hasMore = topic && cacheCounts[topic] > videos.length;

  const loadMore = async () => {
    if (!topic || loadingMore) return;
    setLoadingMore(true);
    const newOffset = offset + 500;
    try {
      const data = await fetchTrending(topic, 500, newOffset);
      setVideos((prev) => [...prev, ...data.videos]);
      setOffset(newOffset);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoadingMore(false);
    }
  };

  const handleAddToEditor = (clip) => {
    setIsRecording(false);
    setEditorClips((prev) => [...prev, { ...clip, addedAt: Date.now() }]);
  };

  const handleRemoveClip = (index) => {
    setEditorClips((prev) => prev.filter((_, i) => i !== index));
  };

  const handleClearEditor = () => {
    setEditorClips([]);
  };

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-gray-800 bg-gray-950/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-full mx-auto px-6 py-4 space-y-4">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-gradient-to-br from-purple-500 to-blue-500 rounded-lg flex items-center justify-center">
                <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                </svg>
              </div>
              <h1 className="text-xl font-bold text-gray-100">Trendflow</h1>
            </div>
            <span className="text-xs text-gray-500 bg-gray-800 px-2 py-0.5 rounded-full">MVP</span>
            {dataSource && (
              <span className={`text-xs px-2 py-0.5 rounded-full ${
                dataSource === "apify" || dataSource === "tiktok_api" || dataSource === "cached"
                  ? "bg-green-900/50 text-green-400 border border-green-700/50"
                  : "bg-yellow-900/50 text-yellow-400 border border-yellow-700/50"
              }`}>
                {dataSource === "apify" || dataSource === "tiktok_api" || dataSource === "cached" ? "Live" : "Mock"}
              </span>
            )}
            {cachedTopics.length > 0 && (
              <div className="relative group ml-auto">
                <span className="text-xs px-2 py-0.5 rounded-full bg-blue-900/50 text-blue-400 border border-blue-700/50 cursor-default">
                  {cachedTopics[0]} {cacheCounts[cachedTopics[0]] ?? "?"}v{secondsSinceRefresh !== null ? ` ${secondsSinceRefresh}s` : ""}{workerAlive ? "" : " ⏸"}
                  {cachedTopics.length > 1 ? ` (+${cachedTopics.length - 1})` : ""}
                </span>
                <div className="absolute right-0 top-full mt-1 bg-gray-900 border border-gray-700 rounded-lg p-2 shadow-xl hidden group-hover:block min-w-[200px] z-20">
                  {cachedTopics.map((t) => (
                    <div key={t} className="flex items-center justify-between gap-2 px-2 py-1 text-xs text-gray-300 hover:bg-gray-800 rounded">
                      <span className="truncate">{t}</span>
                      <span className="text-gray-500 shrink-0">{cacheCounts[t] ?? 0}</span>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleRemoveCache(t); }}
                        className="text-gray-500 hover:text-red-400 shrink-0 ml-1"
                      >
                        x
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {videos.length > 0 && (
              <span className="text-xs text-gray-500">{videos.length} videos</span>
            )}
            {hiddenRankedCount > 0 && (
              <span className="text-xs text-yellow-500/70 ml-1">
                ({hiddenRankedCount} hidden — switch filter to see)
              </span>
            )}
            {cacheCounts[topic] && cacheCounts[topic] > videos.length && (
              <span className="text-xs text-blue-400/70 ml-1">
                ({cacheCounts[topic]} cached)
              </span>
            )}
          </div>
          <SearchBar
            topic={topic}
            setTopic={setTopic}
            onSearch={handleSearch}
            onRefresh={handleRefresh}
            loading={loading}
            cachedTopics={cachedTopics}
            cacheCounts={cacheCounts}
          />
          <div className="flex items-center justify-between gap-3">
            <FilterBar active={filter} onChange={setFilter} disabled={videos.length === 0} />
            <div className="flex items-center gap-2 shrink-0">
              {topic && videos.length > 0 && (
                <>
                  <input
                    value={rankPrompt}
                    onChange={(e) => setRankPrompt(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleRank()}
                    placeholder="Rank by..."
                    className="w-40 text-xs px-2.5 py-1.5 rounded-lg bg-gray-800 border border-gray-700 text-gray-200 placeholder-gray-500 focus:outline-none focus:border-purple-500/50"
                  />
                  <button
                    onClick={handleRank}
                    disabled={isRanking || !rankPrompt.trim()}
                    className="text-xs px-3 py-1.5 rounded-lg border border-gray-700 bg-gray-800 text-gray-300 hover:bg-gray-700 hover:text-gray-100 disabled:opacity-40 transition-all"
                  >
                    {isRanking ? "..." : isRanked ? "Re-rank" : "Rank"}
                  </button>
                  {rankProgress && (
                    <div className="flex items-center gap-2">
                      <div className="w-20 h-1.5 bg-gray-700 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-purple-500 rounded-full transition-all duration-500"
                          style={{ width: `${Math.min(100, (rankProgress.progress / rankProgress.total) * 100)}%` }}
                        />
                      </div>
                      <span className="text-[10px] text-gray-500">{rankProgress.stage}</span>
                    </div>
                  )}
                </>
              )}
              {topic && videos.length > 0 && (
              <button
                onClick={isCached ? () => handleRemoveCache(topic) : handleAddToCache}
                disabled={loading || addingToCache}
                className={`text-xs px-3 py-1.5 rounded-lg border transition-all shrink-0 ${
                  isCached
                    ? "bg-blue-900/30 text-blue-400 border-blue-700/50 hover:bg-blue-900/50"
                    : "bg-gray-800 text-gray-300 border-gray-700 hover:bg-gray-700 hover:text-gray-100"
                } disabled:opacity-40`}
              >
                {addingToCache ? "Adding..." : isCached ? "Cached" : "Add to Cache"}
              </button>
              )}
              {topic && isCached && (
                <button
                  onClick={() => setShowConfig(!showConfig)}
                  className="text-xs px-2 py-1.5 rounded-lg border border-gray-700 bg-gray-800 text-gray-400 hover:text-gray-200 hover:bg-gray-700 transition-all"
                  title="Search settings"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
                  </svg>
                </button>
              )}
              <button
                onClick={() => setShowEditor(!showEditor)}
                className={`text-xs px-2 py-1.5 rounded-lg border transition-all ${
                  showEditor
                    ? "bg-purple-900/40 border-purple-600 text-purple-200"
                    : "border-gray-700 bg-gray-800 text-gray-400 hover:text-gray-200 hover:bg-gray-700"
                }`}
                title="Video Editor"
              >
                <span className="text-xs">{editorClips.length > 0 ? `Editor (${editorClips.length})` : "Editor"}</span>
              </button>
            </div>
          </div>
          {showConfig && topicConfig && (
            <SearchConfigPanel
              config={topicConfig}
              topic={topic}
              onSave={(cfg) => {
                updateTopicConfig(topic, cfg).then(() => {
                  setTopicConfig(cfg);
                  setShowConfig(false);
                }).catch((e) => setError(e.message));
              }}
              onClose={() => setShowConfig(false)}
            />
          )}
        </div>
      </header>

      <main className={`flex flex-col max-w-full mx-auto w-full px-6 ${showEditor ? "" : "flex-1"} ${showEditor ? "h-screen" : ""}`}>
        {error && (
          <div className="mb-6 p-4 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-sm">
            {error}
          </div>
        )}

        <div className={`flex flex-col lg:flex-row gap-6 ${showEditor ? "flex-1 min-h-0 overflow-y-auto pb-4" : ""}`}>
          <div className="flex-1 min-w-0">
            {loading ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 min-[1920px]:grid-cols-6 gap-3">
                {Array.from({ length: 12 }).map((_, i) => (
                  <div key={i} className="rounded-xl overflow-hidden border border-gray-800 animate-pulse">
                    <div className="aspect-[16/10] bg-gray-800" />
                    <div className="p-2.5 space-y-2">
                      <div className="h-3 bg-gray-800 rounded w-3/4" />
                      <div className="h-2.5 bg-gray-800 rounded w-1/2" />
                      <div className="h-2.5 bg-gray-800 rounded w-1/3" />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <VideoGrid
                videos={sortedVideos}
                selectedId={selectedVideo?.id}
                onSelect={setSelectedVideo}
              />
            )}
            {hasMore && !loading && (
              <div className="flex justify-center mt-4">
                <button
                  onClick={loadMore}
                  disabled={loadingMore}
                  className="text-xs px-6 py-2 rounded-lg border border-gray-700 bg-gray-800 text-gray-300 hover:bg-gray-700 hover:text-gray-100 disabled:opacity-40 transition-all"
                >
                  {loadingMore ? "Loading..." : `Load more (${videos.length}/${cacheCounts[topic]} loaded)`}
                </button>
              </div>
            )}
          </div>

          {selectedVideo && (
            <SelectedVideoPanel
              video={selectedVideo}
              onClose={() => setSelectedVideo(null)}
              onAddToEditor={handleAddToEditor}
              isRecording={isRecording}
            />
          )}
        </div>

        {showEditor && (
          <div className="flex-1 min-h-0 border-t border-gray-800 bg-gray-950 mt-2">
            <VideoEditor
              clips={editorClips}
              onRemoveClip={handleRemoveClip}
              onClear={handleClearEditor}
            />
          </div>
        )}
      </main>
    </div>
  );
}