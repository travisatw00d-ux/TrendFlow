import time
import os
import json
import re
import atexit
import threading
from datetime import datetime, timezone
from flask import Flask, request, jsonify, Response, send_from_directory
from flask_cors import CORS
from mock_data import get_videos_for_topic

app = Flask(__name__)
CORS(app, origins=["http://localhost:3000"])

APIFY_TOKEN = os.getenv("APIFY_API_TOKEN")
LLM_PROVIDER = os.getenv("LLM_PROVIDER", "lmstudio")
LM_STUDIO_BASE_URL = os.getenv("LM_STUDIO_BASE_URL", "http://localhost:1234")
OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "llama3.2")

# TikTokApi lazy initializer
_tiktok_available = False
_tiktok_lock = threading.Lock()

def ensure_tiktok():
    global _tiktok_available
    if _tiktok_available:
        return True
    with _tiktok_lock:
        if _tiktok_available:
            return True
        try:
            import tiktok_scraper
            tiktok_scraper.start(headless=False)
            _tiktok_available = tiktok_scraper.is_available()
            if _tiktok_available:
                atexit.register(tiktok_scraper.stop)
                print("TikTokApi scraper started")
            return _tiktok_available
        except Exception as e:
            print(f"TikTokApi init failed: {e}")
            return False


# Cache manager (depends on TikTokApi)
_cache_manager = None

def _rank_unscored(topic, prompt):
    cache = ensure_cache()
    if not cache:
        return
    videos = cache.get_cached(topic, limit=None)
    if not videos:
        return
    to_rank = [v for v in videos if v.get("aiScore") is None]
    if not to_rank:
        return
    print(f"[auto-rank] ranking {len(to_rank)}/{len(videos)} unscored for '{topic}'")
    scores = {}
    batch_size = 5
    for start in range(0, len(to_rank), batch_size):
        batch = to_rank[start:start + batch_size]
        lines = []
        for j, v in enumerate(batch):
            cap = (v.get("caption") or "")[:300]
            summ = (v.get("summary") or "")[:300]
            lines.append(f"{j+1}. Caption: {cap}\n   Summary: {summ}")
        system = (
            f"Rank these TikTok videos by relevance. Criteria: \"{prompt}\"\n"
            "For EACH video, first write a one-sentence explanation of why it does or "
            "doesn't match the criteria, THEN give a score 1-10. "
            "Be harsh — most videos are unrelated and should score 1-3. "
            "Return ONLY a JSON array of objects, one per video, in order:\n"
            '[{"score": 1, "reason": "..."}, {"score": 3, "reason": "..."}]'
        )
        try:
            content = _call_llm_raw(system, "\n\n".join(lines), max_tokens=2000)
            batch_results = _extract_array(content)
            if batch_results and len(batch_results) == len(batch):
                for j, v in enumerate(batch):
                    item = batch_results[j]
                    if isinstance(item, dict):
                        try:
                            scores[v["id"]] = max(1, min(10, int(item.get("score", 1))))
                        except (ValueError, TypeError):
                            pass
                    else:
                        try:
                            scores[v["id"]] = max(1, min(10, int(item)))
                        except (ValueError, TypeError):
                            pass
        except Exception as e:
            print(f"[auto-rank] batch failed: {e}")
    if scores:
        cache.batch_apply_scores(topic, scores)
        print(f"[auto-rank] done — scored {len(scores)} videos for '{topic}'")

def ensure_cache():
    global _cache_manager
    if _cache_manager is not None:
        return _cache_manager
    if not ensure_tiktok():
        return None
    from cache_manager import CacheManager
    import tiktok_scraper
    _cache_manager = CacheManager(tiktok_scraper, auto_rank_cb=_rank_unscored)
    _cache_manager.start()
    print("Cache worker started")
    return _cache_manager


def apply_engagement(videos):
    for v in videos:
        v["engagementScore"] = calculate_engagement(v)
    return videos


def calculate_engagement(video):
    views = video["views"]
    likes = video["likes"]
    if views == 0:
        return 0
    raw = (likes / views) * 100
    return min(100, round(raw * 10, 1))


def check_llm():
    try:
        import requests
        if LLM_PROVIDER == "ollama":
            r = requests.get(f"{OLLAMA_BASE_URL}/api/tags", timeout=5)
        else:
            r = requests.get(f"{LM_STUDIO_BASE_URL}/v1/models", timeout=5)
        return r.ok
    except Exception:
        return False


LLM_SYSTEM_PROMPT = (
    "You are an AI assistant for a creator analytics dashboard. "
    "Given a TikTok video caption, provide:\n"
    "1. A 2-3 sentence summary of what the video is about.\n"
    "2. 3-5 talking points that capture key themes, arguments, or hooks.\n"
    "Respond ONLY with valid JSON. Do not include any text outside the JSON object. "
    'Use keys "summary" (string) and "talkingPoints" (array of strings).'
)


def extract_json(text):
    match = re.search(r"\{.*\}", text, re.DOTALL)
    if match:
        return json.loads(match.group())
    raise ValueError("No JSON object found in response")


def _call_llm_raw(system, user, max_tokens=1000):
    import requests
    if LLM_PROVIDER == "ollama":
        resp = requests.post(f"{OLLAMA_BASE_URL}/api/chat", json={
            "model": OLLAMA_MODEL,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            "stream": False,
        }, timeout=180)
        resp.raise_for_status()
        return resp.json().get("message", {}).get("content", "")
    resp = requests.post(f"{LM_STUDIO_BASE_URL}/v1/chat/completions", json={
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        "temperature": 0.3,
        "max_tokens": max_tokens,
    }, timeout=180)
    resp.raise_for_status()
    return resp.json()["choices"][0]["message"]["content"]


def _extract_array(text):
    start = text.find("[")
    end = text.rfind("]")
    if start != -1 and end != -1:
        return json.loads(text[start:end+1])
    raise ValueError("No JSON array found in response")


@app.route("/api/health")
def health():
    return jsonify({
        "status": "ok",
        "llm_provider": LLM_PROVIDER,
        "llm_connected": check_llm(),
    })


@app.route("/api/trending")
def trending():
    topic = request.args.get("topic", "").strip().lower()
    source = request.args.get("source", "").strip().lower()
    limit = request.args.get("limit", type=int, default=500)
    offset = request.args.get("offset", type=int, default=0)

    if not topic:
        return jsonify({"error": "topic parameter is required"}), 400

    # Check cache first
    cache = ensure_cache()
    if cache:
        cached = cache.get_cached(topic, limit=limit, offset=offset)
        if cached is not None:
            return jsonify({
                "videos": apply_engagement(cached),
                "source": "cached",
                "limit": limit,
                "offset": offset,
            })

    # Try TikTokApi (free, Playwright-based)
    if _tiktok_available:
        try:
            import tiktok_scraper
            videos = tiktok_scraper.search_topic_deep(topic)
            if not videos:
                videos = tiktok_scraper.fetch_trending(count=20)
            if videos:
                # If topic is being cached, store result
                if cache:
                    cache.update_now(topic, videos)
                return jsonify({"videos": apply_engagement(videos), "source": "tiktok_api"})
        except Exception as e:
            print(f"TikTokApi failed: {e}")

    use_apify = source == "apify" or (source != "mock" and APIFY_TOKEN)

    if use_apify and APIFY_TOKEN:
        try:
            import requests
            response = requests.post(
                "https://api.apify.com/v2/acts/apify~tiktok-scraper/run-sync-get-dataset-items",
                params={"token": APIFY_TOKEN},
                json={"searchResults": topic, "maxResults": 12},
                timeout=60,
            )
            response.raise_for_status()
            items = response.json()
            videos = []
            for item in items:
                video_id = str(item.get("id", ""))
                video_meta = item.get("videoMeta", {}) or {}
                author_meta = item.get("authorMeta", {}) or {}
                create_time = item.get("createTime")

                videos.append({
                    "id": video_id,
                    "caption": item.get("text", ""),
                    "creator": author_meta.get("name", ""),
                    "creatorAvatar": author_meta.get("avatar", ""),
                    "thumbnail": video_meta.get("cover", video_meta.get("thumb", "")),
                    "videoUrl": item.get("videoUrl", ""),
                    "webVideoUrl": item.get("webVideoUrl", item.get("videoUrl", "")),
                    "views": item.get("playCount", 0),
                    "likes": item.get("diggCount", 0),
                    "comments": item.get("commentCount", 0),
                    "shares": item.get("shareCount", 0),
                    "duration": video_meta.get("duration", 0),
                    "publishedAt": (
                        datetime.fromtimestamp(create_time, tz=timezone.utc).isoformat()
                        if create_time else None
                    ),
                })
            return jsonify({"videos": apply_engagement(videos), "source": "apify"})
        except Exception as e:
            return jsonify({"error": f"Apify request failed: {str(e)}"}), 500

    time.sleep(0.5)
    videos = get_videos_for_topic(topic)

    return jsonify({"videos": apply_engagement(videos), "source": "mock"})


@app.route("/api/summarize", methods=["POST"])
def summarize():
    data = request.get_json()
    if not data or "caption" not in data:
        return jsonify({"error": "caption is required"}), 400

    caption = data["caption"]

    if not check_llm():
        provider_name = "LM Studio" if LLM_PROVIDER != "ollama" else "Ollama"
        return jsonify({
            "summary": f"AI summary will appear here once {provider_name} is running.",
            "talkingPoints": [
                f"Open {provider_name} and start the local server.",
                f"Load a model and ensure the API is running.",
                f"Then refresh this page.",
            ],
        })

    try:
        import requests

        if LLM_PROVIDER == "ollama":
            response = requests.post(
                f"{OLLAMA_BASE_URL}/api/chat",
                json={
                    "model": OLLAMA_MODEL,
                    "messages": [
                        {"role": "system", "content": LLM_SYSTEM_PROMPT},
                        {"role": "user", "content": f"Caption: {caption}"},
                    ],
                    "stream": False,
                    "format": "json",
                },
                timeout=60,
            )
            response.raise_for_status()
            result = response.json()
            content = result.get("message", {}).get("content", "{}")
        else:
            response = requests.post(
                f"{LM_STUDIO_BASE_URL}/v1/chat/completions",
                json={
                    "messages": [
                        {"role": "system", "content": LLM_SYSTEM_PROMPT},
                        {"role": "user", "content": f"Caption: {caption}"},
                    ],
                    "temperature": 0.7,
                    "max_tokens": 500,
                },
                timeout=120,
            )
            response.raise_for_status()
            result = response.json()
            content = result.get("choices", [{}])[0].get("message", {}).get("content", "{}")

        parsed = extract_json(content)
        return jsonify({
            "summary": parsed.get("summary", ""),
            "talkingPoints": parsed.get("talkingPoints", []),
        })
    except Exception as e:
        return jsonify({
            "summary": "AI generation failed. Check that your local LLM server is running.",
            "talkingPoints": [f"Error: {str(e)}"],
        }), 500


@app.route("/api/rank", methods=["POST"])
def start_rank():
    data = request.get_json()
    topic = (data.get("topic") or "").strip().lower()
    prompt = (data.get("prompt") or "").strip()

    if not topic or not prompt:
        return jsonify({"error": "topic and prompt are required"}), 400
    if not check_llm():
        return jsonify({"error": "LLM not available (start LM Studio)"}), 503

    cache = ensure_cache()
    if not cache:
        return jsonify({"error": "cache not available"}), 503

    videos = cache.get_cached(topic, limit=None)
    if not videos:
        return jsonify({"error": f"no cached videos for '{topic}'"}), 404

    job_id = f"rank_{datetime.now(timezone.utc).strftime('%H%M%S')}_{os.urandom(2).hex()}"
    job = {
        "job_id": job_id,
        "topic": topic,
        "prompt": prompt,
        "stage": "starting",
        "progress": 0,
        "total": len(videos),
        "done": False,
        "error": None,
        "result": None,
    }
    _rank_jobs[job_id] = job
    t = threading.Thread(target=_do_rank, args=(job_id, topic, prompt, videos), daemon=True)
    t.start()
    return jsonify({"job_id": job_id})


_rank_jobs = {}


def _do_rank(job_id, topic, prompt, videos):
    job = _rank_jobs.get(job_id)
    cache = ensure_cache()
    total = len(videos)
    try:
        # Store the rank prompt
        if cache:
            cache.set_rank_prompt(topic, prompt)

        # Step 1: batch-summarize uns summarized videos
        to_summarize = [(i, v) for i, v in enumerate(videos) if not v.get("summary")]
        if to_summarize:
            job["stage"] = "summarizing"
            job["progress"] = 0
            batch_size = 8
            total_summary_batches = (len(to_summarize) + batch_size - 1) // batch_size
            for batch_idx, start in enumerate(range(0, len(to_summarize), batch_size)):
                batch = to_summarize[start:start + batch_size]
                captions = [v.get("caption", "")[:600] for _, v in batch]
                lines = [f"{j+1}. {c}" for j, c in enumerate(captions)]
                try:
                    content = _call_llm_raw(
                        "You summarize TikTok captions. Return ONLY a JSON array of 1-2 sentence summaries.",
                        "\n".join(lines), max_tokens=2000,
                    )
                    summaries = _extract_array(content)
                    if summaries and len(summaries) == len(batch):
                        for (idx, _), s in zip(batch, summaries):
                            videos[idx]["summary"] = s if isinstance(s, str) else str(s or "")
                except Exception as e:
                    print(f"[rank] summarize batch failed: {e}")
                job["progress"] = batch_idx + 1
                job["total"] = total_summary_batches

            updates = [{"id": v["id"], "summary": v.get("summary", "")} for v in videos if v.get("summary")]
            if updates:
                cache.batch_update_meta(topic, updates)

        # Step 2: rank all videos
        job["stage"] = "ranking"
        batch_size = 5
        total_rank_batches = (total + batch_size - 1) // batch_size
        all_scores = {}

        for batch_idx, start in enumerate(range(0, total, batch_size)):
            batch = videos[start:start + batch_size]
            lines = []
            for j, v in enumerate(batch):
                cap = (v.get("caption") or "")[:250]
                summ = (v.get("summary") or "")[:250]
                lines.append(f"{j+1}. Caption: {cap}\n   Summary: {summ}")

            system = (
                f"Rank these TikTok videos by relevance. Criteria: \"{prompt}\"\n"
                "For EACH video, first write a one-sentence explanation of why it does or "
                "doesn't match the criteria, THEN give a score 1-10. "
                "Be harsh — most videos are unrelated and should score 1-3. "
                "Return ONLY a JSON array of objects, one per video, in order:\n"
                '[{"score": 1, "reason": "..."}, {"score": 3, "reason": "..."}]'
            )
            try:
                content = _call_llm_raw(system, "\n\n".join(lines), max_tokens=2000)
                batch_results = _extract_array(content)
                if batch_results and len(batch_results) == len(batch):
                    for j, v in enumerate(batch):
                        item = batch_results[j]
                        if isinstance(item, dict):
                            try:
                                all_scores[v["id"]] = max(1, min(10, int(item.get("score", 1))))
                            except (ValueError, TypeError):
                                all_scores[v["id"]] = 1
                        else:
                            try:
                                all_scores[v["id"]] = max(1, min(10, int(item)))
                            except (ValueError, TypeError):
                                all_scores[v["id"]] = 1
                else:
                    for v in batch:
                        all_scores[v["id"]] = 1
            except Exception as e:
                print(f"[rank] rank batch failed: {e}")
                for v in batch:
                    all_scores[v["id"]] = 1
            job["progress"] = batch_idx + 1
            job["total"] = total_rank_batches

        for v in videos:
            v["aiScore"] = all_scores.get(v["id"], 1)
        sorted_videos = sorted(videos, key=lambda v: v["aiScore"], reverse=True)
        # persist scores in cache
        if cache:
            cache.batch_apply_scores(topic, all_scores)
        job["result"] = {"videos": sorted_videos, "source": "ranked"}
        job["done"] = True
        job["stage"] = "done"
        print(f"[rank] done — {total} videos, scores {min(all_scores.values())}-{max(all_scores.values())}")
    except Exception as e:
        print(f"[rank] job failed: {e}")
        job["error"] = str(e)
        job["done"] = True


@app.route("/api/rank/status/<job_id>")
def rank_status(job_id):
    job = _rank_jobs.get(job_id)
    if not job:
        return jsonify({"error": "job not found"}), 404
    # clean old jobs periodically
    now = datetime.now(timezone.utc).timestamp()
    stale = [k for k, v in _rank_jobs.items() if v.get("done") and "ts" in v and (now - v["ts"]) > 600]
    for k in stale:
        _rank_jobs.pop(k, None)
    if job.get("done"):
        job["ts"] = now
    return jsonify({
        "job_id": job["job_id"],
        "stage": job["stage"],
        "progress": job["progress"],
        "total": job["total"],
        "done": job["done"],
        "error": job["error"],
        "result": job["result"],
    })


@app.route("/api/cache/add", methods=["POST"])
def cache_add():
    data = request.get_json()
    topic = data.get("topic", "").strip() if data else ""
    if not topic:
        return jsonify({"error": "topic is required"}), 400
    cache = ensure_cache()
    if not cache:
        return jsonify({"error": "TikTokApi not available"}), 503
    ok = cache.add_topic(topic)
    return jsonify({"status": "ok" if ok else "error", "topic": topic})


@app.route("/api/cache/remove", methods=["POST"])
def cache_remove():
    data = request.get_json()
    topic = data.get("topic", "").strip() if data else ""
    if not topic:
        return jsonify({"error": "topic is required"}), 400
    cache = ensure_cache()
    if cache:
        cache.remove_topic(topic)
    return jsonify({"status": "ok", "topic": topic})


@app.route("/api/topic-config", methods=["GET", "POST"])
def handle_topic_config():
    cache = ensure_cache()
    if not cache:
        return jsonify({"error": "cache not available"}), 503
    if request.method == "GET":
        topic = request.args.get("topic", "").strip().lower()
        if not topic:
            return jsonify({"error": "topic required"}), 400
        return jsonify({"config": cache.get_topic_config(topic), "topic": topic})
    data = request.get_json()
    topic = (data.get("topic") or "").strip().lower()
    config = data.get("config", {})
    if not topic:
        return jsonify({"error": "topic required"}), 400
    cache.set_topic_config(topic, config)
    return jsonify({"status": "ok", "topic": topic})


@app.route("/api/embed-player/<video_id>")
def embed_player(video_id):
    return f"""<!DOCTYPE html>
<html><head><meta name="viewport" content="width=device-width,initial-scale=1">
<style>*{{margin:0;padding:0;box-sizing:border-box}}body{{background:#000;overflow:hidden}}
.frame{{width:100vw;height:100vh}}iframe{{width:100%;height:100%;border:0}}</style>
</head><body><div class="frame"><iframe src="https://www.tiktok.com/embed/v2/{video_id}"
allow="autoplay; fullscreen" allowfullscreen></iframe></div></body></html>"""


@app.route("/api/cache/status")
def cache_status():
    cache = ensure_cache()
    if not cache:
        return jsonify({"topics": [], "last_updated": {}, "errors": {}, "refresh_interval": 120})
    return jsonify(cache.get_status())


@app.route("/api/download-video", methods=["POST"])
def download_video():
    data = request.get_json()
    if not data:
        return jsonify({"error": "JSON body required"}), 400

    video_id = data.get("videoId", "")
    video_info = data.get("videoInfo")
    if not video_id and not video_info:
        return jsonify({"error": "videoId or videoInfo required"}), 400

    if not _tiktok_available:
        return jsonify({"error": "TikTokApi not available"}), 503

    try:
        import tiktok_scraper
        payload = video_info if video_info else video_id
        out = tiktok_scraper.download_video(payload, output_dir="downloads")
        if out and os.path.exists(out):
            fsize = os.path.getsize(out)
            fname = os.path.basename(out)
            return jsonify({
                "status": "ok",
                "file": fname,
                "path": out,
                "size_bytes": fsize,
                "url": f"/api/serve-video/{fname}",
            })
        return jsonify({"error": "Download failed (all methods exhausted)"}), 500
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/serve-video/<filename>")
def serve_video(filename):
    safe = os.path.basename(filename)
    dl = request.args.get("download")
    if dl == "1":
        return send_from_directory("downloads", safe, mimetype="video/mp4", as_attachment=True, download_name=safe)
    return send_from_directory("downloads", safe, mimetype="video/mp4")


if __name__ == "__main__":
    port = int(os.getenv("PORT", 5000))
    app.run(host="0.0.0.0", port=port, debug=True)
