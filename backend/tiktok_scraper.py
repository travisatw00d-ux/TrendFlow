import asyncio
import logging
import os
import random
import threading
from datetime import datetime, timezone
from TikTokApi import TikTokApi

logger = logging.getLogger(__name__)

_api = None
_api_lock = threading.Lock()
_event_loop = None
_event_loop_thread = None
_event_loop_ready = threading.Event()
_worker_lock = threading.Lock()

def _start_loop():
    global _event_loop
    _event_loop = asyncio.new_event_loop()
    asyncio.set_event_loop(_event_loop)
    _event_loop_ready.set()
    _event_loop.run_forever()

def _ensure_loop():
    global _event_loop_thread
    if _event_loop is not None:
        return
    _event_loop_thread = threading.Thread(target=_start_loop, daemon=True)
    _event_loop_thread.start()
    _event_loop_ready.wait()

def _run_async(coro, timeout=None):
    _ensure_loop()
    future = asyncio.run_coroutine_threadsafe(coro, _event_loop)
    return future.result(timeout=timeout)

def _convert_video(video) -> dict:
    d = video.as_dict
    author = d.get("author", {})
    stats = d.get("stats", {})
    video_data = d.get("video", {})

    create_time = video.create_time
    if isinstance(create_time, datetime):
        published = create_time.isoformat()
    elif create_time:
        published = datetime.fromtimestamp(create_time, tz=timezone.utc).isoformat()
    else:
        published = datetime.now(timezone.utc).isoformat()

    views = stats.get("playCount", 0)
    likes = stats.get("diggCount", 0)
    comments = stats.get("commentCount", 0)
    shares = stats.get("shareCount", 0)

    return {
        "id": video.id,
        "creator": author.get("uniqueId", ""),
        "caption": d.get("desc", ""),
        "thumbnail": video_data.get("cover", ""),
        "videoUrl": f"https://www.tiktok.com/@{author.get('uniqueId', '')}/video/{video.id}",
        "webVideoUrl": video_data.get("playAddr", ""),
        "views": views,
        "likes": likes,
        "comments": comments,
        "shares": shares,
        "duration": video_data.get("duration", 0),
        "publishedAt": published,
        "source": "tiktok_api",
    }

def is_available() -> bool:
    global _api
    return _api is not None and len(_api.sessions) > 0

def start(headless=False, num_sessions=1):
    global _api
    with _api_lock:
        if _api is not None:
            return
        _api = TikTokApi()
        _run_async(_api.create_sessions(
            num_sessions=num_sessions,
            headless=headless,
            sleep_after=3,
            override_browser_args=["--mute-audio"],
        ))
        logger.info("TikTokApi sessions created")

def restart(headless=False):
    global _api
    with _api_lock:
        if _api is not None:
            try:
                _run_async(_api.close_sessions())
            except Exception:
                pass
            _api = None
        _api = TikTokApi()
        _run_async(_api.create_sessions(
            num_sessions=1,
            headless=headless,
            sleep_after=3,
            override_browser_args=["--mute-audio"],
        ))
        logger.info("TikTokApi restarted")

def stop():
    global _api, _event_loop
    with _api_lock:
        if _api is not None:
            _run_async(_api.close_sessions())
            _api = None
            logger.info("TikTokApi closed")
        if _event_loop is not None and not _event_loop.is_closed():
            _event_loop.call_soon_threadsafe(_event_loop.stop)
            _event_loop = None

def fetch_trending(count=20) -> list[dict]:
    global _api
    with _worker_lock:
        if _api is None:
            raise RuntimeError("TikTokApi not started")
        videos = []
        async def _fetch():
            async for video in _api.trending.videos(count=count):
                try:
                    videos.append(_convert_video(video))
                except Exception as e:
                    logger.warning(f"Failed to convert trending video {video.id}: {e}")
        _run_async(_fetch())
        return videos

def search_videos(keyword: str, count=20) -> list[dict]:
    global _api
    with _worker_lock:
        if _api is None:
            raise RuntimeError("TikTokApi not started")
        videos = []
        async def _search():
            try:
                async for result in _api.search.search_type(keyword, "item", count=count):
                    try:
                        videos.append(_convert_video(result))
                    except Exception as e:
                        logger.warning(f"Failed to convert search result: {e}")
            except Exception as e:
                logger.warning(f"TikTok search failed: {e}")
        _run_async(_search())
        return videos

def fresh_session_search_deep(topic: str, count_per_query=30, max_variants=15, mode="informational", extra_modifiers=None) -> list[dict]:
    all_videos = []
    seen = set()
    variants = _shuffled_variants(topic, count=max_variants, mode=mode, extra_modifiers=extra_modifiers)
    keywords = _topic_keywords(topic)
    try:
        api = TikTokApi()
        _run_async(api.create_sessions(num_sessions=1, headless=False, sleep_after=3, override_browser_args=["--mute-audio"]), timeout=30)
        for variant in variants:
            try:
                async def _search_one(kw):
                    results = []
                    async for r in api.search.search_type(kw, "item", count=count_per_query):
                        results.append(r)
                    return results
                results = _run_async(_search_one(variant), timeout=20)
                for result in results:
                    try:
                        v = _convert_video(result)
                        vid = v.get("id")
                        if vid and vid not in seen:
                            if (variant == topic or _is_relevant(v, keywords)) and _is_likely_english(v.get("caption", "")):
                                seen.add(vid)
                                all_videos.append(v)
                    except Exception as e:
                        logger.warning(f"Fresh search convert fail: {e}")
            except Exception as e:
                logger.warning(f"Fresh search variant '{variant}' failed: {e}")
    except Exception as e:
        logger.warning(f"Fresh session search failed: {e}")
    finally:
        try:
            _run_async(api.close_sessions(), timeout=10)
        except Exception:
            pass
    logger.info(f"Fresh session deep search '{topic}': {len(all_videos)} unique videos from {len(variants)} variants")
    return all_videos

def _is_likely_english(text):
    if not text:
        return True
    non_latin_ranges = [
        (0x0400, 0x04FF),  # Cyrillic
        (0x0500, 0x052F),  # Cyrillic Supplement
        (0x4E00, 0x9FFF),  # CJK Unified
        (0x3040, 0x309F),  # Hiragana
        (0x30A0, 0x30FF),  # Katakana
        (0xAC00, 0xD7AF),  # Hangul
        (0x0600, 0x06FF),  # Arabic
        (0x0900, 0x097F),  # Devanagari
        (0x0E00, 0x0E7F),  # Thai
        (0x0370, 0x03FF),  # Greek
        (0x0590, 0x05FF),  # Hebrew
    ]
    total = 0
    non_latin = 0
    for ch in text:
        cp = ord(ch)
        if cp > 127:
            total += 1
            for lo, hi in non_latin_ranges:
                if lo <= cp <= hi:
                    non_latin += 1
                    break
    if total == 0:
        return True
    return non_latin / total < 0.3

def _topic_keywords(topic):
    words = set(w.lower() for w in topic.split() if len(w) > 2)
    words.add(topic.lower())
    return words

MODIFIER_PRESETS = {
    "informational": [
        "news", "today", "2026", "explained", "problem", "update",
        "latest", "breaking", "discussion", "analysis", "guide",
        "overview", "coverage", "report", "summary", "deep dive",
        "commentary", "explainer", "insight",
    ],
    "reaction": [
        "rant", "reaction", "freaking out", "emotional", "crying",
        "meltdown", "shouting", "angry", "drama", "complaint",
        "losing it", "going off", "upset", "furious", "breakdown",
        "screaming", "rage", "shocked", "speechless",
    ],
    "viral": [
        "viral", "trending", "shocking", "popular", "must watch",
        "going viral", "trending now", "hot", "buzz", "talk about",
        "clip", "moment", "highlights", "recap",
    ],
    "mixed": [
        "news", "trending", "reaction", "viral", "today", "explained",
        "rant", "shocking", "discussion", "emotional", "update",
        "hot", "debate", "drama", "analysis", "breakdown",
    ],
}

def _get_modifiers(mode="informational", extra_modifiers=None):
    mods = list(MODIFIER_PRESETS.get(mode, MODIFIER_PRESETS["informational"]))
    if extra_modifiers:
        for m in extra_modifiers:
            m = m.strip().lower()
            if m and m not in mods:
                mods.append(m)
    return mods

def _shuffled_variants(topic, count=15, mode="informational", extra_modifiers=None):
    words = topic.split()
    pool = [topic]
    for w in words:
        if len(w) > 2 and w not in pool:
            pool.append(w)
    m = _get_modifiers(mode, extra_modifiers)
    random.shuffle(m)
    for mod in m:
        v = f"{topic} {mod}"
        if v not in pool:
            pool.append(v)
        if len(pool) >= count * 3:
            break
    for w in words:
        if len(w) > 2:
            for mod in m:
                v = f"{w} {mod}"
                if v not in pool:
                    pool.append(v)
                if len(pool) >= count * 4:
                    break
        if len(pool) >= count * 4:
            break
    if len(words) > 2:
        for i in range(len(words) - 1):
            sub = " ".join(words[i:i+2])
            if sub not in pool and len(sub) > 3:
                pool.append(sub)
    random.shuffle(pool)
    result = [topic]
    for v in pool:
        if v != topic and v not in result:
            result.append(v)
    return result[:count]

def _is_relevant(video, keywords):
    caption = (video.get("caption") or "").lower()
    return any(kw in caption for kw in keywords)

def _keyword_variants(topic, max_variants=20):
    words = topic.split()
    variants = [topic]

    # Each individual word
    for w in words:
        if w not in variants and len(w) > 2:
            variants.append(w)

    # Topic + modifiers
    modifiers = ["news", "today", "2026", "explained", "problem", "update"]
    for m in modifiers:
        v = f"{topic} {m}"
        if v not in variants:
            variants.append(v)
            if len(variants) >= max_variants:
                return variants

    # Word + modifiers
    for w in words:
        if len(w) > 2:
            for m in modifiers:
                v = f"{w} {m}"
                if v not in variants:
                    variants.append(v)
                    if len(variants) >= max_variants:
                        return variants

    # Multi-word substrings
    if len(words) > 2:
        for i in range(len(words) - 1):
            sub = " ".join(words[i:i+2])
            if sub not in variants and len(sub) > 3:
                variants.append(sub)
                if len(variants) >= max_variants:
                    return variants

    return variants

def search_topic_deep(topic: str, count_per_query=30, max_variants=20, mode="informational", extra_modifiers=None) -> list[dict]:
    all_videos = []
    seen = set()
    variants = _shuffled_variants(topic, count=max_variants, mode=mode, extra_modifiers=extra_modifiers)
    keywords = _topic_keywords(topic)
    for variant in variants:
        try:
            results = search_videos(variant, count=count_per_query)
            if results:
                for v in results:
                    vid = v.get("id")
                    if vid and vid not in seen:
                        if (variant == topic or _is_relevant(v, keywords)) and _is_likely_english(v.get("caption", "")):
                            seen.add(vid)
                            all_videos.append(v)
        except Exception as e:
            logger.warning(f"Deep search variant '{variant}' failed: {e}")
    logger.info(f"Deep search '{topic}': {len(all_videos)} unique videos from {len(variants)} variants")
    return all_videos


def _extract_video_id(video_or_id):
    if isinstance(video_or_id, dict):
        return video_or_id.get("id", "")
    return str(video_or_id)

def _extract_tiktok_url(video_or_id):
    vid = _extract_video_id(video_or_id)
    return f"https://www.tiktok.com/@user/video/{vid}"

def _download_with_ytdlp(url, output_path):
    try:
        import yt_dlp
        ydl_opts = {
            "outtmpl": output_path.replace("%(ext)s", "%(ext)s").rsplit(".", 1)[0] + ".%(ext)s",
            "format": "best",
            "quiet": True,
            "no_warnings": True,
        }
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=True)
            actual = ydl.prepare_filename(info)
            # If yt-dlp used a different extension, rename
            if actual and os.path.exists(actual) and actual != output_path:
                if os.path.exists(output_path):
                    os.remove(output_path)
                os.rename(actual, output_path)
            return os.path.getsize(output_path) if os.path.exists(output_path) else 0
    except ImportError:
        logger.warning("yt-dlp not installed — install with: pip install yt-dlp")
        return 0
    except Exception as e:
        logger.warning(f"yt-dlp download failed: {e}")
        return 0


async def _download_video_async(api, cdn_url, output_path):
    """Download a video INSIDE TikTokApi's Playwright browser.

    TikTok CDN URLs are cryptographically signed per-browser-session.
    Only the *exact browser instance* that made the original search
    can download them. This function uses the page's `fetch()` (which
    carries the right cookies, TLS state, and Origin header) and
    captures the response at the Playwright protocol level — bypassing
    both CORS and evaluate() serialization limits.
    """
    page = api.sessions[0].page
    video_bytes = []

    async def _on_response(response):
        if response.url == cdn_url:
            try:
                body = await response.body()
                if len(body) > 50000:
                    video_bytes.append(body)
            except Exception:
                pass

    page.on("response", _on_response)

    # fetch from inside the browser — same session, same TLS, right Origin
    await page.evaluate(f"""
        fetch('{cdn_url}', {{credentials: 'include', mode: 'cors'}})
            .catch(() => {{}})  /* ignore CORS errors — Playwright sees the wire */
    """)

    for _ in range(60):
        if video_bytes:
            break
        await asyncio.sleep(0.5)

    page.remove_listener("response", _on_response)

    if video_bytes:
        os.makedirs(os.path.dirname(output_path) or ".", exist_ok=True)
        with open(output_path, "wb") as f:
            f.write(video_bytes[0])
        return len(video_bytes[0])
    return 0


def download_video(video_or_id, output_dir="downloads", use_ytdlp_fallback=True):
    """Download a TikTok video using the existing Playwright browser session.

    Parameters
    ----------
    video_or_id : dict or str
        Video dict (from search results) or a video ID string.
    output_dir : str
        Directory to save the downloaded file.
    use_ytdlp_fallback : bool
        If True, try yt-dlp if the Playwright capture fails.

    Returns
    -------
    str or None
        Path to the downloaded file, or None on failure.
    """
    global _api
    if _api is None or not _api.sessions:
        raise RuntimeError("TikTokApi not started or no sessions available")

    vid = _extract_video_id(video_or_id)
    if not vid:
        raise ValueError("Could not extract video ID")

    cdn_url = None
    tiktok_url = None
    if isinstance(video_or_id, dict):
        cdn_url = video_or_id.get("webVideoUrl") or video_or_id.get("videoUrl")
        tiktok_url = video_or_id.get("videoUrl") or _extract_tiktok_url(vid)
    if not cdn_url:
        tiktok_url = _extract_tiktok_url(vid)

    output_path = os.path.join(output_dir, f"{vid}.mp4")

    if cdn_url:
        size = _run_async(_download_video_async(_api, cdn_url, output_path), timeout=60)
        if size > 0:
            return output_path

    if tiktok_url:
        size = _run_async(
            _download_video_page_async(_api, tiktok_url, output_path), timeout=60
        )
        if size > 0:
            return output_path

    if use_ytdlp_fallback:
        size = _download_with_ytdlp(
            tiktok_url or _extract_tiktok_url(vid), output_path
        )
        if size > 0:
            return output_path

    return None


async def _download_video_page_async(api, tiktok_url, output_path):
    """Open the video page in a new tab and capture the first CDN video response."""
    context = api.sessions[0].context
    page = await context.new_page()
    video_bytes = []

    async def _on_response(response):
        ct = response.headers.get("content-type", "")
        if "video" in ct or "mp4" in ct or "octet-stream" in ct:
            if any(d in response.url for d in ("tiktokcdn", "tikcdn", "bytecdn")):
                try:
                    body = await response.body()
                    if len(body) > 50000:
                        video_bytes.append(body)
                except Exception:
                    pass

    page.on("response", _on_response)

    try:
        await page.goto(tiktok_url, wait_until="commit", timeout=20000)
    except Exception:
        pass

    for _ in range(60):
        if video_bytes:
            break
        await asyncio.sleep(0.5)

    await page.close()

    if video_bytes:
        os.makedirs(os.path.dirname(output_path) or ".", exist_ok=True)
        with open(output_path, "wb") as f:
            f.write(video_bytes[0])
        return len(video_bytes[0])
    return 0
