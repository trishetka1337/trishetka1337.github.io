#!/usr/bin/env python3
"""
Собирает живые данные для сайта и кладёт их в data/*.json.

Запускается в GitHub Actions по расписанию. Все ключи и адреса серверов
берутся из переменных окружения, поэтому в репозиторий они не попадают.

Переменные:
  GH_USER          ник на GitHub (обязательно)
  GITHUB_TOKEN     токен Actions, нужен для графа контрибуций
  LASTFM_USER      ник на last.fm (необязательно)
  LASTFM_KEY       ключ API last.fm (необязательно)
  SKIP_REPOS       имена репозиториев через запятую, которые не показывать
  INFRA_TARGETS    JSON-список серверов (необязательно), например:
                   [{"name":"gramsrv","host":"1.2.3.4","port":443,"role":"telegram"}]
"""

import json
import os
import socket
import ssl
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone, date, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
DATA.mkdir(exist_ok=True)

GH_USER = os.environ.get("GH_USER", "").strip()
GH_TOKEN = os.environ.get("GITHUB_TOKEN", "").strip()
LASTFM_USER = os.environ.get("LASTFM_USER", "").strip()
LASTFM_KEY = os.environ.get("LASTFM_KEY", "").strip()
INFRA_RAW = os.environ.get("INFRA_TARGETS", "").strip()

# Репозитории, которые не должны попадать в ленту: черновики, мусор, эксперименты.
SKIP_REPOS = {n.strip() for n in os.environ.get("SKIP_REPOS", "").split(",") if n.strip()}

UA = "villcreat-site-collector"


def http_json(url, headers=None, data=None, timeout=20):
    req = urllib.request.Request(url, data=data, method="POST" if data else "GET")
    req.add_header("User-Agent", UA)
    req.add_header("Accept", "application/json")
    for k, v in (headers or {}).items():
        req.add_header(k, v)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read().decode("utf-8"))


def write(name, payload):
    path = DATA / name
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"  -> {path.relative_to(ROOT)}")


# ----------------------------------------------------------------- github

CONTRIB_QUERY = """
query($login: String!, $from: DateTime!) {
  user(login: $login) {
    followers { totalCount }
    contributionsCollection(from: $from) {
      contributionCalendar {
        totalContributions
        weeks { contributionDays { date contributionCount } }
      }
    }
  }
}
"""


def gh_calendar():
    """Граф контрибуций за год. Без токена недоступен, вернём пустоту."""
    if not GH_TOKEN:
        print("  нет GITHUB_TOKEN, граф контрибуций пропущен")
        return [], None, None

    frm = (datetime.now(timezone.utc) - timedelta(days=364)).replace(
        hour=0, minute=0, second=0, microsecond=0
    )
    body = json.dumps(
        {"query": CONTRIB_QUERY, "variables": {"login": GH_USER, "from": frm.isoformat()}}
    ).encode()

    try:
        res = http_json(
            "https://api.github.com/graphql",
            headers={"Authorization": f"bearer {GH_TOKEN}", "Content-Type": "application/json"},
            data=body,
        )
        user = res["data"]["user"]
        cal = user["contributionsCollection"]["contributionCalendar"]
        days = [
            {"date": d["date"], "count": d["contributionCount"]}
            for w in cal["weeks"]
            for d in w["contributionDays"]
        ]
        return days, cal["totalContributions"], user["followers"]["totalCount"]
    except Exception as e:
        print(f"  граф контрибуций не собрался: {e}")
        return [], None, None


def current_streak(days):
    """Сколько дней подряд есть активность, считая от сегодня или вчера."""
    by_date = {d["date"]: d["count"] for d in days}
    today = date.today()
    # Сегодня может ещё не быть коммитов, это не обрывает серию.
    start = today if by_date.get(today.isoformat(), 0) > 0 else today - timedelta(days=1)
    streak = 0
    cur = start
    while by_date.get(cur.isoformat(), 0) > 0:
        streak += 1
        cur -= timedelta(days=1)
    return streak


def gh_repos():
    """Репозитории, самые свежие сверху."""
    try:
        raw = http_json(
            f"https://api.github.com/users/{GH_USER}/repos?sort=updated&per_page=30",
            headers={"Authorization": f"bearer {GH_TOKEN}"} if GH_TOKEN else None,
        )
    except Exception as e:
        print(f"  репозитории не собрались: {e}")
        return []

    collected = [
        {
            "name": r["name"],
            "description": r.get("description"),
            "language": r.get("language"),
            "stars": r.get("stargazers_count", 0),
            "url": r["html_url"],
            "updated_at": r.get("updated_at"),
        }
        for r in raw
        if not r.get("fork") and not r.get("archived") and r["name"] not in SKIP_REPOS
    ]

    # Сортируем по времени последнего изменения: страница показывает свежее.
    collected.sort(key=lambda r: r.get("updated_at") or "", reverse=True)
    print(f"  репозиториев собрано: {len(collected)}")
    return collected[:12]


def gh_commits():
    """Последние пуши из публичной ленты событий."""
    try:
        events = http_json(
            f"https://api.github.com/users/{GH_USER}/events/public?per_page=100",
            headers={"Authorization": f"bearer {GH_TOKEN}"} if GH_TOKEN else None,
        )
    except Exception as e:
        print(f"  события не собрались: {e}")
        return []

    out = []
    for ev in events:
        if ev.get("type") != "PushEvent":
            continue
        repo = ev["repo"]["name"]
        for c in reversed(ev["payload"].get("commits", [])):
            if not c.get("distinct", True):
                continue
            out.append({
                "repo": repo.split("/")[-1],
                "message": c["message"].split("\n")[0][:110],
                "sha": c["sha"][:7],
                "url": f"https://github.com/{repo}/commit/{c['sha']}",
                "date": ev["created_at"],
            })
            if len(out) >= 8:
                return out
    return out


def collect_github():
    if not GH_USER:
        print("нет GH_USER, github пропускаем")
        return
    print("github:")
    calendar, total, followers = gh_calendar()

    profile = {}
    try:
        profile = http_json(f"https://api.github.com/users/{GH_USER}")
    except Exception as e:
        print(f"  профиль не собрался: {e}")

    write("github.json", {
        "user": GH_USER,
        "followers": followers if followers is not None else profile.get("followers"),
        "public_repos": profile.get("public_repos"),
        "contributions": total,
        "streak": current_streak(calendar) if calendar else None,
        "calendar": calendar,
        "commits": gh_commits(),
        "repos": gh_repos(),
    })


# ----------------------------------------------------------------- last.fm

def collect_music():
    if not (LASTFM_USER and LASTFM_KEY):
        print("нет ключей last.fm, музыку пропускаем")
        return
    print("last.fm:")
    q = urllib.parse.urlencode({
        "method": "user.getrecenttracks",
        "user": LASTFM_USER,
        "api_key": LASTFM_KEY,
        "format": "json",
        "limit": 10,
    })
    try:
        res = http_json(f"https://ws.audioscrobbler.com/2.0/?{q}")
        tracks = res["recenttracks"]["track"]
    except Exception as e:
        print(f"  не собралось: {e}")
        return

    def art(t):
        images = t.get("image") or []
        return images[-1].get("#text") if images else None

    def when(t):
        ts = t.get("date", {}).get("uts")
        return datetime.fromtimestamp(int(ts), timezone.utc).isoformat() if ts else None

    first = tracks[0]
    write("music.json", {
        "now": {
            "name": first["name"],
            "artist": first["artist"]["#text"],
            "art": art(first),
            "playing": first.get("@attr", {}).get("nowplaying") == "true",
        },
        "recent": [
            {"name": t["name"], "artist": t["artist"]["#text"], "date": when(t)}
            for t in tracks[1:7]
        ],
    })


# -------------------------------------------------------------- спутники

# Кого показываем в блоке «над головой». Номера каталога NORAD.
SATELLITES = [
    (25544, "МКС", "станции"),
    (48274, "Тяньгун", "станции"),

    (20580, "Hubble", "телескопы"),

    (33591, "NOAA-19", "погода"),
    (28654, "NOAA-18", "погода"),
    (25338, "NOAA-15", "погода"),
    (40069, "Метеор-М2", "погода"),

    (25994, "Terra", "съёмка Земли"),
    (27424, "Aqua", "съёмка Земли"),
    (49260, "Landsat-9", "съёмка Земли"),
    (39084, "Landsat-8", "съёмка Земли"),
    (40697, "Sentinel-2A", "съёмка Земли"),
    (42063, "Sentinel-2B", "съёмка Земли"),

    (5, "Vanguard 1", "ветеран"),  # запущен в 1958, старейший объект на орбите
]

# Сколько аппаратов Starlink подмешать. Берём из группового списка Celestrak:
# конкретные номера быстро устаревают, аппараты сходят с орбиты.
STARLINK_COUNT = 6


def fetch_tle_text(url, max_bytes=None):
    """Текст с Celestrak. max_bytes читает только начало потока."""
    req = urllib.request.Request(url)
    req.add_header("User-Agent", UA)
    with urllib.request.urlopen(req, timeout=30) as r:
        raw = r.read(max_bytes) if max_bytes else r.read()
    return raw.decode("utf-8", "replace")


def fetch_tle(catnr):
    """Две строки орбитальных элементов по номеру каталога."""
    text = fetch_tle_text(f"https://celestrak.org/NORAD/elements/gp.php?CATNR={catnr}&FORMAT=tle")
    lines = [ln.strip() for ln in text.splitlines() if ln.strip()]
    # На неизвестный номер приходит текстовая заглушка, а не элементы.
    if len(lines) < 3 or not lines[1].startswith("1 ") or not lines[2].startswith("2 "):
        raise ValueError(f"нет элементов: {lines[:1]}")
    return lines[1], lines[2]


def fetch_starlink(count):
    """
    Несколько аппаратов Starlink.

    Берём supplemental-ленту: обычный GROUP=starlink отдаёт данные не чаще
    раза в два часа на адрес и отвечает 403, а наш workflow ходит чаще.
    Читаем только начало потока: весь файл весит под два мегабайта, а нам
    нужно несколько аппаратов.
    """
    text = fetch_tle_text(
        "https://celestrak.org/NORAD/elements/supplemental/sup-gp.php?FILE=starlink&FORMAT=tle",
        max_bytes=256 * count,
    )
    lines = [ln.strip() for ln in text.splitlines() if ln.strip()]
    # Последняя строка могла оборваться на середине — она не нужна.
    if lines and not lines[-1].startswith(("1 ", "2 ")):
        lines.pop()

    out = []
    # Файл идёт тройками: имя, строка 1, строка 2.
    for i in range(0, len(lines) - 2, 3):
        name, l1, l2 = lines[i], lines[i + 1], lines[i + 2]
        if not l1.startswith("1 ") or not l2.startswith("2 "):
            continue
        # Номер каталога стоит во второй колонке первой строки.
        try:
            catnr = int(l1[2:7])
        except ValueError:
            continue
        out.append({"id": catnr, "name": name.title(), "group": "связь", "tle1": l1, "tle2": l2})
        if len(out) >= count:
            break
    return out


def collect_satellites():
    print("спутники:")
    sats = []
    for catnr, name, group in SATELLITES:
        try:
            tle1, tle2 = fetch_tle(catnr)
        except Exception as e:
            print(f"  {name}: {e}")
            continue
        sats.append({"id": catnr, "name": name, "group": group, "tle1": tle1, "tle2": tle2})
        print(f"  {name}: ок")

    try:
        starlink = fetch_starlink(STARLINK_COUNT)
        sats.extend(starlink)
        print(f"  Starlink: {len(starlink)} шт")
    except Exception as e:
        print(f"  Starlink: {e}")

    if not sats:
        print("  ничего не собралось, файл не трогаем")
        return

    write("satellites.json", {
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "sats": sats,
    })


# --------------------------------------------------------------- серверы

def probe(host, port, timeout=4.0):
    """TCP-коннект. Возвращает время отклика в мс или None."""
    started = time.perf_counter()
    try:
        with socket.create_connection((host, port), timeout=timeout):
            return int((time.perf_counter() - started) * 1000)
    except OSError:
        return None


def collect_infra():
    if not INFRA_RAW:
        print("нет INFRA_TARGETS, инфраструктуру пропускаем")
        return
    print("серверы:")
    try:
        targets = json.loads(INFRA_RAW)
    except json.JSONDecodeError as e:
        print(f"  INFRA_TARGETS не разобрался: {e}")
        return

    nodes = []
    for t in targets:
        ms = probe(t["host"], int(t.get("port", 443)))
        nodes.append({
            "name": t.get("name", t["host"]),
            "role": t.get("role", ""),
            "up": ms is not None,
            "ms": ms,
        })
        print(f"  {nodes[-1]['name']}: {'up ' + str(ms) + ' ms' if ms else 'down'}")

    # Адреса наружу не отдаём, только имена и статусы.
    write("infra.json", {
        "checked_at": datetime.now(timezone.utc).isoformat(),
        "nodes": nodes,
    })


# ------------------------------------------------------------------ main

if __name__ == "__main__":
    collect_github()
    collect_music()
    collect_satellites()
    collect_infra()
    write("meta.json", {"built_at": datetime.now(timezone.utc).isoformat()})
    print("готово")
