#!/usr/bin/env python3
"""
Собирает блог из posts/*.md на двух языках.

Имя файла: <дата>-<имя>.<язык>.md, например
    posts/2026-09-10-perevyoz-servera.ru.md
    posts/2026-09-10-perevyoz-servera.en.md
Файл без языка в имени считается русским.

На выходе:
    blog.html, blog/<имя>.html, feed.xml        — русские
    blog.en.html, blog/<имя>.en.html, feed.en.xml — английские

Страницы статические: заметка читается без JavaScript. Небольшой скрипт
на странице только переносит гостя на его язык, если такая версия есть.

Запуск: python scripts/blog.py
"""

import html
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from markdown_mini import render, plain  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
POSTS_DIR = ROOT / "posts"
OUT_DIR = ROOT / "blog"

# Адрес нужен только для ленты: в RSS обязаны быть полные ссылки.
SITE_URL = "https://trishetka1337.github.io"

LANGS = ("ru", "en")

STR = {
    "ru": {
        "site_title": "villcreat",
        "site_desc": "Заметки о своих серверах, коде и прочей самодеятельности.",
        "blog": "блог",
        "home": "главная",
        "wall": "стена",
        "all_posts": "← все заметки",
        "empty": "Пока пусто. Первая заметка появится здесь.",
        "no_translation": "только на русском",
        "months": ["января", "февраля", "марта", "апреля", "мая", "июня",
                   "июля", "августа", "сентября", "октября", "ноября", "декабря"],
    },
    "en": {
        "site_title": "villcreat",
        "site_desc": "Notes about my servers, code and other homemade things.",
        "blog": "blog",
        "home": "home",
        "wall": "wall",
        "all_posts": "← all posts",
        "empty": "Nothing here yet. The first post will show up here.",
        "no_translation": "russian only",
        "months": ["January", "February", "March", "April", "May", "June",
                   "July", "August", "September", "October", "November", "December"],
    },
}


def parse_post(path):
    """Читает пост с заголовком в начале файла, отделённым тройкой дефисов."""
    raw = path.read_text(encoding="utf-8")
    meta, body = {}, raw

    if raw.startswith("---"):
        end = raw.find("\n---", 3)
        if end != -1:
            head = raw[3:end].strip()
            body = raw[end + 4:].lstrip("\n")
            for line in head.split("\n"):
                if ":" in line:
                    k, v = line.split(":", 1)
                    meta[k.strip().lower()] = v.strip()

    if meta.get("draft", "").lower() in ("1", "true", "yes", "да"):
        return None

    stem = path.stem
    # Язык берётся из имени файла: privet.en -> en, без суффикса -> ru.
    lang = "ru"
    m = re.match(r"(.+)\.(ru|en)$", stem)
    if m:
        stem, lang = m.group(1), m.group(2)

    date = meta.get("date", "")
    if not date:
        m = re.match(r"(\d{4}-\d{2}-\d{2})", stem)
        date = m.group(1) if m else ""

    slug = meta.get("slug") or re.sub(r"^\d{4}-\d{2}-\d{2}-", "", stem)

    return {
        "slug": slug,
        "lang": lang,
        "title": meta.get("title") or slug,
        "date": date,
        "tags": [t.strip() for t in meta.get("tags", "").split(",") if t.strip()],
        "summary": meta.get("summary") or plain(body),
        "body": body,
    }


def human_date(iso, lang):
    try:
        d = datetime.strptime(iso, "%Y-%m-%d")
    except ValueError:
        return iso
    month = STR[lang]["months"][d.month - 1]
    return f"{d.day} {month} {d.year}" if lang == "ru" else f"{month} {d.day}, {d.year}"


def rfc822(iso):
    try:
        d = datetime.strptime(iso, "%Y-%m-%d").replace(tzinfo=timezone.utc)
    except ValueError:
        d = datetime.now(timezone.utc)
    return d.strftime("%a, %d %b %Y %H:%M:%S +0000")


def page_name(kind, slug, lang):
    """Пути одинаковы для обоих языков, у английского добавляется .en."""
    suffix = "" if lang == "ru" else ".en"
    if kind == "post":
        return f"{slug}{suffix}.html"
    if kind == "index":
        return f"blog{suffix}.html"
    return f"feed{suffix}.xml"


def head(title, description, lang, rel, alt_href):
    s = STR[lang]
    other = "en" if lang == "ru" else "ru"

    # Кнопка ведёт на перевод, если он есть, иначе на список на другом языке.
    lang_buttons = ""
    for code in LANGS:
        if code == lang:
            lang_buttons += f'<span class="lang lang--on">{code}</span>'
        else:
            href = alt_href or f'{rel}{page_name("index", "", code)}'
            lang_buttons += f'<a class="lang" href="{href}" data-lang="{code}">{code}</a>'

    # Гостя переносим на его язык, только если перевод этой же страницы есть.
    switch = ""
    if alt_href:
        switch = f"""
<script>
(function () {{
  try {{
    var want = localStorage.getItem('lang');
    if (want === '{other}') location.replace('{alt_href}');
  }} catch (e) {{}}
}})();
</script>"""

    return f"""<!doctype html>
<html lang="{lang}" data-theme="dark">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{html.escape(title)}</title>
<meta name="description" content="{html.escape(description)}">
<meta property="og:title" content="{html.escape(title)}">
<meta property="og:description" content="{html.escape(description)}">
<meta property="og:type" content="article">
<link rel="icon" type="image/jpeg" href="{rel}assets/img/icon.jpg">
<link rel="alternate" type="application/rss+xml" title="{html.escape(s['site_title'])}" href="{rel}{page_name('feed', '', lang)}">
{f'<link rel="alternate" hreflang="{other}" href="{alt_href}">' if alt_href else ''}
<link rel="stylesheet" href="{rel}assets/css/style.css">
</head>
<body>{switch}

<div class="grain" aria-hidden="true"></div>

<header class="topbar">
  <a class="brand" href="{rel}">
    <img class="brand-mark" src="{rel}assets/img/icon.jpg" alt="" width="24" height="24">
    <span class="brand-name">villcreat</span>
  </a>
  <nav class="topnav">
    <a href="{rel}">{s['home']}</a>
    <a href="{rel}{page_name('index', '', lang)}">{s['blog']}</a>
    <a href="{rel}wall.html">{s['wall']}</a>
    <a href="{rel}{page_name('feed', '', lang)}">rss</a>
  </nav>
  <span class="online" id="online" hidden></span>
  <div class="langs">{lang_buttons}</div>
  <button class="theme-switch" id="theme-toggle" type="button" role="switch"
          aria-checked="false" aria-label="theme">
    <span class="theme-knob" aria-hidden="true"></span>
    <span class="theme-ico theme-ico--sun" aria-hidden="true">&#9728;</span>
    <span class="theme-ico theme-ico--moon" aria-hidden="true">&#9790;</span>
  </button>
</header>
"""


FOOT_TPL = """
<footer class="footer">
  <div class="footer-meta"><span>villcreat</span></div>
</footer>

<script>
// Тема и язык живут в тех же ключах, что и на главной, чтобы выбор не терялся.
(function () {
  var root = document.documentElement;
  var btn = document.getElementById('theme-toggle');
  var theme = localStorage.getItem('theme') ||
    (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
  function apply() {
    root.dataset.theme = theme;
    btn.setAttribute('aria-checked', String(theme === 'light'));
  }
  apply();
  btn.addEventListener('click', function () {
    theme = theme === 'dark' ? 'light' : 'dark';
    localStorage.setItem('theme', theme);
    apply();
  });

  document.querySelectorAll('.langs a[data-lang]').forEach(function (a) {
    a.addEventListener('click', function () {
      try { localStorage.setItem('lang', a.dataset.lang); } catch (e) {}
    });
  });
})();
</script>
<script type="module" src="{rel}assets/js/online.js"></script>
</body>
</html>"""


def tags_html(tags):
    if not tags:
        return ""
    items = "".join(f'<span class="tag">{html.escape(t)}</span>' for t in tags)
    return f'<div class="tags">{items}</div>'


def build_post(post, has_translation):
    lang = post["lang"]
    s = STR[lang]
    alt = f'{page_name("post", post["slug"], "en" if lang == "ru" else "ru")}' if has_translation else ""

    body = render(post["body"])
    note = "" if has_translation else f'<span class="tag tag--muted">{s["no_translation"]}</span>'

    page = head(f'{post["title"]} — {s["site_title"]}', post["summary"], lang, "../", alt)
    page += f"""
<main class="prose">
  <a class="back" href="../{page_name('index', '', lang)}">{s['all_posts']}</a>
  <article>
    <header class="post-head">
      <time class="post-date" datetime="{html.escape(post['date'])}">{human_date(post['date'], lang)}</time>
      <h1 class="post-title">{html.escape(post['title'])}</h1>
      <div class="tags">{tags_html(post['tags'])[len('<div class="tags">'):-len('</div>')] if post['tags'] else ''}{note}</div>
    </header>
    {body}
  </article>
  <a class="back back--bottom" href="../{page_name('index', '', lang)}">{s['all_posts']}</a>
</main>
"""
    page += FOOT_TPL.replace("{rel}", "../")
    (OUT_DIR / page_name("post", post["slug"], lang)).write_text(page, encoding="utf-8")


def build_index(posts, lang):
    s = STR[lang]

    if posts:
        cards = "\n".join(
            f"""    <li><a class="post-card" href="blog/{page_name('post', p['slug'], lang)}">
      <time class="post-card-date" datetime="{html.escape(p['date'])}">{human_date(p['date'], lang)}</time>
      <h2 class="post-card-title">{html.escape(p['title'])}</h2>
      <p class="post-card-sum">{html.escape(p['summary'])}</p>
      {tags_html(p['tags'])}
    </a></li>"""
            for p in posts
        )
        listing = f'<ul class="post-list">\n{cards}\n  </ul>'
    else:
        listing = f'<p class="empty">{s["empty"]}</p>'

    other = "en" if lang == "ru" else "ru"
    page = head(f'{s["blog"]} — {s["site_title"]}', s["site_desc"], lang, "",
                page_name("index", "", other))
    page += f"""
<main class="prose prose--wide">
  <header class="blog-head">
    <h1 class="post-title">{s['blog']}</h1>
    <p class="blog-sub">{html.escape(s['site_desc'])}
      <a href="{page_name('feed', '', lang)}">RSS</a></p>
  </header>
  {listing}
</main>
"""
    page += FOOT_TPL.replace("{rel}", "")
    (ROOT / page_name("index", "", lang)).write_text(page, encoding="utf-8")


def build_feed(posts, lang):
    s = STR[lang]
    items = "\n".join(
        f"""    <item>
      <title>{html.escape(p['title'])}</title>
      <link>{SITE_URL}/blog/{page_name('post', p['slug'], lang)}</link>
      <guid isPermaLink="true">{SITE_URL}/blog/{page_name('post', p['slug'], lang)}</guid>
      <pubDate>{rfc822(p['date'])}</pubDate>
      <description>{html.escape(p['summary'])}</description>
    </item>"""
        for p in posts[:20]
    )

    feed = f"""<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>{html.escape(s['site_title'])}</title>
    <link>{SITE_URL}/{page_name('index', '', lang)}</link>
    <description>{html.escape(s['site_desc'])}</description>
    <language>{lang}</language>
    <atom:link href="{SITE_URL}/{page_name('feed', '', lang)}" rel="self" type="application/rss+xml"/>
{items}
  </channel>
</rss>
"""
    (ROOT / page_name("feed", "", lang)).write_text(feed, encoding="utf-8")


def main():
    POSTS_DIR.mkdir(exist_ok=True)
    OUT_DIR.mkdir(exist_ok=True)

    by_lang = {code: [] for code in LANGS}
    slugs = {code: set() for code in LANGS}

    for path in sorted(POSTS_DIR.glob("*.md")):
        post = parse_post(path)
        if not post:
            print(f"  черновик пропущен: {path.name}")
            continue
        if post["lang"] not in LANGS:
            continue
        by_lang[post["lang"]].append(post)
        slugs[post["lang"]].add(post["slug"])

    for code in LANGS:
        posts = sorted(by_lang[code], key=lambda p: p["date"], reverse=True)
        other = "en" if code == "ru" else "ru"

        for post in posts:
            build_post(post, post["slug"] in slugs[other])
        build_index(posts, code)
        build_feed(posts, code)

        translated = sum(1 for p in posts if p["slug"] in slugs[other])
        print(f"  {code}: {len(posts)} заметок, из них с переводом {translated}")


if __name__ == "__main__":
    print("блог:")
    main()
    print("готово")
