from datetime import datetime, timedelta

NOW = datetime.utcnow()

TOPICS = {
    "default": [
        {
            "id": "1",
            "caption": "The housing crisis is pushing millennials out of major cities at an alarming rate. Here's what's really happening behind the scenes.",
            "creator": "@urbanreport",
            "creatorAvatar": "https://picsum.photos/seed/urban/100/100",
            "thumbnail": "https://picsum.photos/seed/housing1/400/600",
            "videoUrl": "https://www.tiktok.com/@urbanreport/video/1",
            "views": 2450000,
            "likes": 182000,
            "comments": 12400,
            "shares": 8900,
            "duration": 45,
            "publishedAt": (NOW - timedelta(hours=2)).isoformat() + "Z"
        },
        {
            "id": "2",
            "caption": "Breaking down why rent prices are skyrocketing in 2024 and what experts say you should do about it.",
            "creator": "@economydaily",
            "creatorAvatar": "https://picsum.photos/seed/econ/100/100",
            "thumbnail": "https://picsum.photos/seed/housing2/400/600",
            "videoUrl": "https://www.tiktok.com/@economydaily/video/2",
            "views": 1870000,
            "likes": 143000,
            "comments": 9800,
            "shares": 5600,
            "duration": 52,
            "publishedAt": (NOW - timedelta(hours=5)).isoformat() + "Z"
        },
        {
            "id": "3",
            "caption": "I tried living on a $15 minimum wage in San Francisco for a week. The results will shock you.",
            "creator": "@realtalkmedia",
            "creatorAvatar": "https://picsum.photos/seed/realtalk/100/100",
            "thumbnail": "https://picsum.photos/seed/housing3/400/600",
            "videoUrl": "https://www.tiktok.com/@realtalkmedia/video/3",
            "views": 3200000,
            "likes": 275000,
            "comments": 18200,
            "shares": 12400,
            "duration": 60,
            "publishedAt": (NOW - timedelta(hours=8)).isoformat() + "Z"
        },
        {
            "id": "4",
            "caption": "First time home buyer? Here are 5 hidden costs nobody tells you about until it's too late.",
            "creator": "@financebro",
            "creatorAvatar": "https://picsum.photos/seed/finance/100/100",
            "thumbnail": "https://picsum.photos/seed/housing4/400/600",
            "videoUrl": "https://www.tiktok.com/@financebro/video/4",
            "views": 980000,
            "likes": 87600,
            "comments": 5400,
            "shares": 3200,
            "duration": 38,
            "publishedAt": (NOW - timedelta(hours=12)).isoformat() + "Z"
        },
        {
            "id": "5",
            "caption": "This city just built affordable housing in 30 days using 3D printing technology. The future is here.",
            "creator": "@techbuilder",
            "creatorAvatar": "https://picsum.photos/seed/techb/100/100",
            "thumbnail": "https://picsum.photos/seed/housing5/400/600",
            "videoUrl": "https://www.tiktok.com/@techbuilder/video/5",
            "views": 4100000,
            "likes": 389000,
            "comments": 21500,
            "shares": 18700,
            "duration": 55,
            "publishedAt": (NOW - timedelta(days=1)).isoformat() + "Z"
        },
        {
            "id": "6",
            "caption": "Landlord tried to raise my rent by 40%. Here's the legal loophole that saved me thousands.",
            "creator": "@tenantrights",
            "creatorAvatar": "https://picsum.photos/seed/tenant/100/100",
            "thumbnail": "https://picsum.photos/seed/housing6/400/600",
            "videoUrl": "https://www.tiktok.com/@tenantrights/video/6",
            "views": 5600000,
            "likes": 512000,
            "comments": 34200,
            "shares": 25600,
            "duration": 72,
            "publishedAt": (NOW - timedelta(days=2)).isoformat() + "Z"
        },
        {
            "id": "7",
            "caption": "Why Gen Z is choosing van life over a mortgage. Deep dive into the new American dream.",
            "creator": "@wanderlens",
            "creatorAvatar": "https://picsum.photos/seed/wander/100/100",
            "thumbnail": "https://picsum.photos/seed/housing7/400/600",
            "videoUrl": "https://www.tiktok.com/@wanderlens/video/7",
            "views": 1890000,
            "likes": 154000,
            "comments": 11200,
            "shares": 7800,
            "duration": 48,
            "publishedAt": (NOW - timedelta(days=3)).isoformat() + "Z"
        },
        {
            "id": "8",
            "caption": "Real estate agents don't want you to know this about the housing market crash prediction.",
            "creator": "@truthinvestor",
            "creatorAvatar": "https://picsum.photos/seed/truth/100/100",
            "thumbnail": "https://picsum.photos/seed/housing8/400/600",
            "videoUrl": "https://www.tiktok.com/@truthinvestor/video/8",
            "views": 2750000,
            "likes": 231000,
            "comments": 16800,
            "shares": 10300,
            "duration": 41,
            "publishedAt": (NOW - timedelta(days=4)).isoformat() + "Z"
        }
    ]
}

def get_videos_for_topic(topic):
    base = TOPICS.get("default", []).copy()
    for v in base:
        v = v.copy()
        seed = hash(topic + v["id"]) % 1000
        v["thumbnail"] = f"https://picsum.photos/seed/{seed}/400/600"
        v["views"] = max(50000, v["views"] + (seed * 1000))
        v["likes"] = max(3000, v["likes"] + (seed * 100))
        v["id"] = f"{topic.replace(' ', '')}-{v['id']}"
    return base
