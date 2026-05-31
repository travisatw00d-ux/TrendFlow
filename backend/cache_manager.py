import json
import os
import sys
import threading
import time
from datetime import datetime, timezone
from dataclasses import dataclass
from typing import Optional

MAX_CACHE_SIZE = 500

@dataclass
class CacheEntry:
    videos: list
    last_updated: datetime
    last_error: Optional[str] = None

class CacheManager:
    def __init__(self, scraper, refresh_interval=120, topic_delay=10, cache_file="cache_data.json", auto_rank_cb=None):
        self.scraper = scraper
        self.refresh_interval = refresh_interval
        self.topic_delay = topic_delay
        self._auto_rank_cb = auto_rank_cb
        self._cache_file = os.path.join(os.path.dirname(__file__), cache_file)
        self._cache = {}
        self._topics = set()
        self._rank_prompts = {}
        self._topic_configs = {}
        self._lock = threading.Lock()
        self._running = False
        self._thread = None
        self._last_refreshed = None

    def _load(self):
        if not os.path.exists(self._cache_file):
            return
        try:
            with open(self._cache_file, "r") as f:
                data = json.load(f)
            for topic, entry in data.get("cache", {}).items():
                try:
                    lu = entry.get("last_updated")
                    self._cache[topic] = CacheEntry(
                        videos=entry.get("videos", []),
                        last_updated=datetime.fromisoformat(lu) if lu else datetime.now(timezone.utc),
                        last_error=entry.get("last_error"),
                    )
                except Exception as e:
                    sys.stderr.write(f"  [cache] Skipping corrupt entry '{topic}': {e}\n")
                    sys.stderr.flush()
            self._topics = set(data.get("topics", []))
            self._rank_prompts = data.get("rank_prompts", {})
            self._topic_configs = data.get("topic_configs", {})
            lr = data.get("last_refreshed")
            if lr:
                try:
                    self._last_refreshed = datetime.fromisoformat(lr)
                except Exception:
                    pass
            sys.stderr.write(f"  [cache] Loaded {len(self._cache)} topics from disk\n")
            sys.stderr.flush()
        except Exception as e:
            sys.stderr.write(f"  [cache] Failed to load cache file: {e}\n")
            sys.stderr.flush()

    def _save(self):
        # Safety: don't overwrite a good cache with an empty one
        if not self._topics and os.path.exists(self._cache_file):
            try:
                with open(self._cache_file, "r") as f:
                    old = json.load(f)
                if old.get("topics"):
                    sys.stderr.write("  [cache] Refusing to overwrite cache with empty topics — data intact\n")
                    sys.stderr.flush()
                    return
            except Exception:
                pass

        # Keep a backup of the previous save
        if os.path.exists(self._cache_file):
            bak = self._cache_file + ".bak"
            try:
                if not os.path.exists(bak):
                    import shutil
                    shutil.copy2(self._cache_file, bak)
            except Exception:
                pass

        data = {
            "cache": {},
            "topics": list(self._topics),
            "rank_prompts": self._rank_prompts,
            "topic_configs": self._topic_configs,
            "last_refreshed": self._last_refreshed.isoformat() if self._last_refreshed else None,
        }
        for topic, entry in self._cache.items():
            data["cache"][topic] = {
                "videos": entry.videos,
                "last_updated": entry.last_updated.isoformat(),
                "last_error": entry.last_error,
            }
        tmp = self._cache_file + ".tmp"
        try:
            with open(tmp, "w") as f:
                json.dump(data, f)
            os.replace(tmp, self._cache_file)
        except Exception as e:
            sys.stderr.write(f"  [cache] Failed to save cache: {e}\n")
            sys.stderr.flush()

    def start(self):
        if self._running:
            return
        self._load()
        self._running = True
        self._thread = threading.Thread(target=self._worker_loop, daemon=True)
        self._thread.start()
        sys.stderr.write(f"  [cache] Worker thread started (interval={self.refresh_interval}s)\n")
        sys.stderr.flush()

    def stop(self):
        self._running = False
        if self._thread:
            self._thread.join(timeout=5)
        self._save()

    def add_topic(self, topic):
        topic = topic.strip().lower()
        if not topic:
            return False
        with self._lock:
            if topic not in self._topics:
                self._topics.add(topic)
        self._fetch_and_cache(topic)
        return True

    def remove_topic(self, topic):
        with self._lock:
            self._topics.discard(topic.lower())
            self._cache.pop(topic.lower(), None)
        self._save()

    def get_cached(self, topic, limit=None, offset=0):
        with self._lock:
            entry = self._cache.get(topic.lower())
            if entry:
                vids = entry.videos
                if limit or offset:
                    return vids[offset:offset + limit] if limit else vids[offset:]
                return vids
            return None

    def get_status(self):
        with self._lock:
            topics = sorted(self._topics)
            last_updated = {}
            errors = {}
            counts = {}
            for t in topics:
                entry = self._cache.get(t)
                if entry:
                    last_updated[t] = entry.last_updated.isoformat()
                    counts[t] = len(entry.videos)
                    if entry.last_error:
                        errors[t] = entry.last_error
            now = datetime.now(timezone.utc)
            secs = None
            if self._last_refreshed is not None:
                secs = int((now - self._last_refreshed).total_seconds())
            return {
                "topics": topics,
                "last_updated": last_updated,
                "video_counts": counts,
                "errors": errors,
                "refresh_interval": self.refresh_interval,
                "seconds_since_refresh": secs,
                "worker_alive": self._thread is not None and self._thread.is_alive(),
                "rank_prompts": dict(self._rank_prompts),
                "topic_configs": dict(self._topic_configs),
            }

    def _merge_videos(self, new_videos, existing_videos=None):
        with self._lock:
            seen = set()
            merged = []
            for v in new_videos:
                vid = v.get("id")
                if vid and vid not in seen:
                    seen.add(vid)
                    merged.append(v)
            if existing_videos:
                for v in existing_videos:
                    vid = v.get("id")
                    if vid and vid not in seen:
                        seen.add(vid)
                        merged.append(v)
            merged.sort(key=lambda v: v.get("publishedAt", ""), reverse=True)
            return merged

    def _update_cache(self, topic, videos, error=None):
        with self._lock:
            existing = self._cache.get(topic)
            existing_vids = existing.videos if existing else None
        merged = self._merge_videos(videos, existing_vids)
        with self._lock:
            self._cache[topic] = CacheEntry(
                videos=merged,
                last_updated=datetime.now(timezone.utc),
                last_error=error,
            )
        self._save()

    def update_now(self, topic, videos):
        self._update_cache(topic.lower(), videos)
        self._last_refreshed = datetime.now(timezone.utc)

    def batch_update_meta(self, topic, updates):
        with self._lock:
            entry = self._cache.get(topic.lower())
            if not entry:
                return
            update_map = {u["id"]: u for u in updates}
            for v in entry.videos:
                if v["id"] in update_map:
                    v.update(update_map[v["id"]])
            self._save()

    def get_rank_prompt(self, topic):
        return self._rank_prompts.get(topic.lower())

    def set_rank_prompt(self, topic, prompt):
        with self._lock:
            self._rank_prompts[topic.lower()] = prompt
        self._save()

    def batch_apply_scores(self, topic, scores):
        with self._lock:
            entry = self._cache.get(topic.lower())
            if entry:
                for v in entry.videos:
                    if v["id"] in scores:
                        v["aiScore"] = scores[v["id"]]
                self._save()

    def get_topic_config(self, topic):
        return self._topic_configs.get(topic.lower(), {"mode": "informational", "extra_modifiers": []})

    def set_topic_config(self, topic, config):
        with self._lock:
            self._topic_configs[topic.lower()] = {"mode": "informational", "extra_modifiers": [], **config}
        self._save()

    def _auto_rank(self, topic):
        if not self._auto_rank_cb:
            return
        prompt = self._rank_prompts.get(topic.lower())
        if not prompt:
            return
        try:
            self._auto_rank_cb(topic, prompt)
        except Exception as e:
            sys.stderr.write(f"  [cache] auto-rank failed: {e}\n")
            sys.stderr.flush()

    def _fetch_and_cache(self, topic, fresh=False):
        import tiktok_scraper as ts
        config = self._topic_configs.get(topic.lower(), {})
        mode = config.get("mode", "informational")
        extras = config.get("extra_modifiers", [])
        for attempt in range(2):
            if fresh:
                # Fresh session: doesn't need persistent scraper
                sys.stderr.write(f"  [cache] Fresh-refresh '{topic}' (attempt {attempt+1})...\n")
                sys.stderr.flush()
                try:
                    all_videos = ts.fresh_session_search_deep(topic, max_variants=30, mode=mode, extra_modifiers=extras)
                    if all_videos:
                        self._update_cache(topic, all_videos)
                        self._last_refreshed = datetime.now(timezone.utc)
                        existing = self._cache.get(topic)
                        total = len(existing.videos) if existing else len(all_videos)
                        sys.stderr.write(f"  [cache] Fresh-refresh done — {total} total unique videos for '{topic}'\n")
                        sys.stderr.flush()
                        self._auto_rank(topic)
                        return True
                    else:
                        sys.stderr.write(f"  [cache] Fresh-refresh got 0 for '{topic}'\n")
                        sys.stderr.flush()
                        continue
                except Exception as e:
                    sys.stderr.write(f"  [cache] Fresh-refresh failed '{topic}': {e}\n")
                    sys.stderr.flush()
                    continue
            else:
                if not self.scraper.is_available():
                    sys.stderr.write(f"  [cache] scraper unavailable (attempt {attempt+1}), restarting...\n")
                    sys.stderr.flush()
                    try:
                        self.scraper.restart()
                    except Exception as e:
                        sys.stderr.write(f"  [cache] restart failed: {e}\n")
                        sys.stderr.flush()
                        if attempt == 0:
                            continue
                        return False
                    if not self.scraper.is_available():
                        sys.stderr.write(f"  [cache] restart did not help\n")
                        sys.stderr.flush()
                        if attempt == 0:
                            continue
                        return False

                try:
                    sys.stderr.write(f"  [cache] Refreshing '{topic}' (attempt {attempt+1})...\n")
                    sys.stderr.flush()

                    all_videos = self.scraper.search_topic_deep(topic, max_variants=20, mode=mode, extra_modifiers=extras)

                    if all_videos:
                        self._update_cache(topic, all_videos)
                        self._last_refreshed = datetime.now(timezone.utc)
                        existing = self._cache.get(topic)
                        total = len(existing.videos) if existing else len(all_videos)
                        sys.stderr.write(f"  [cache] Done — {total} total unique videos for '{topic}'\n")
                        sys.stderr.flush()
                        self._auto_rank(topic)
                        return True
                    else:
                        sys.stderr.write(f"  [cache] No videos for '{topic}'\n")
                        sys.stderr.flush()
                        self.scraper.restart()
                        continue
                except Exception as e:
                    sys.stderr.write(f"  [cache] Failed '{topic}': {e}\n")
                    sys.stderr.flush()
                    try:
                        self.scraper.restart()
                    except Exception:
                        pass
                    continue

        sys.stderr.write(f"  [cache] Giving up on '{topic}' after 2 attempts\n")
        sys.stderr.flush()
        self._last_refreshed = datetime.now(timezone.utc)
        return False

    def _worker_loop(self):
        while self._running:
            with self._lock:
                topics = list(self._topics)
            if topics:
                sys.stderr.write(f"  [cache] Worker cycle: refreshing {len(topics)} topic(s)\n")
                sys.stderr.flush()
            for topic in topics:
                if not self._running:
                    return
                self._fetch_and_cache(topic, fresh=True)
                time.sleep(self.topic_delay)
            time.sleep(self.refresh_interval)
