#!/usr/bin/env python3
"""
Собирает блог из posts/*.md.

Каждый пост становится отдельной страницей blog/<slug>.html, плюс
собираются список blog.html и лента feed.xml. Всё статическое: страница
поста открывается и читается даже с выключенным JavaScript.

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
SITE_URL = "https://villcreat.github.io"
SITE_TITLE = "villcreat"
SITE_DESC = "Заметки о своих серверах, коде и прочей самодеятельности."

MONTHS = ["января", "февраля", "марта", "апреля", "мая", "июня",
          "июля", "августа", "сентября", "октября", "ноября", "декабря"]


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

    slug = meta.get("slug") or path.stem
    # Дату можно не писать в заголовке: возьмём из имени файла 2026-09-06-...
    date = meta.get("date", "")
    if not date:
        m = re.match(r"(\d{4}-\d{2}-\d{2})", path.stem)
        date = m.group(1) if m else ""
        slug = re.sub(r"^\d{4}-\d{2}-\d{2}-", "", slug)
    else:
        slug = re.sub(r"^\d{4}-\d{2}-\d{2}-", "", slug)

    if meta.get("draft", "").lower() in ("1", "true", "yes", "да"):
        return None

    return {
        "slug": slug,
        "title": meta.get("title") or slug,
        "date": date,
        "tags": [t.strip() for t in meta.get("tags", "").split(",") if t.strip()],
        "summary": meta.get("summary") or plain(body),
        "body": body,
    }


def human_date(iso):
    try:
        d = datetime.strptime(iso, "%Y-%m-%d")
    except ValueError:
        return iso
    return f"{d.day} {MONTHS[d.month - 1]} {d.year}"


def rfc822(iso):
    try:
        d = datetime.strptime(iso, "%Y-%m-%d").replace(tzinfo=timezone.utc)
    except ValueError:
        d = datetime.now(timezone.utc)
    return d.strftime("%a, %d %b %Y %H:%M:%S +0000")


def head(title, description, rel):
    """Общая шапка страниц блога. rel — путь до корня сайта."""
    return f"""<!doctype html>
<html lang="ru" data-theme="dark">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{html.escape(title)}</title>
<meta name="description" content="{html.escape(description)}">
<meta property="og:title" content="{html.escape(title)}">
<meta property="og:description" content="{html.escape(description)}">
<meta property="og:type" content="article">
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><text y='26' font-size='26'>&#127756;</text></svg>">
<link rel="alternate" type="application/rss+xml" title="{html.escape(SITE_TITLE)}" href="{rel}feed.xml">
<link rel="stylesheet" href="{rel}assets/css/style.css">
</head>
<body>

<div class="grain" aria-hidden="true"></div>

<header class="topbar">
  <a class="brand" href="{rel}">
    <span class="brand-mark" aria-hidden="true"></span>
    <span class="brand-name">villcreat</span>
  </a>
  <nav class="topnav">
    <a href="{rel}">главная</a>
    <a href="{rel}blog.html">блог</a>
    <a href="{rel}feed.xml">rss</a>
  </nav>
  <button class="theme-toggle" id="theme-toggle" type="button" aria-label="Сменить тему">
    <span class="theme-dot" aria-hidden="true"></span>
    <span id="theme-label">dark</span>
  </button>
</header>
"""


FOOT = """
<footer class="footer">
  <div class="footer-meta"><span>villcreat</span></div>
</footer>

<script>
// Тема живёт в том же ключе, что и на главной, чтобы выбор не терялся.
(function () {
  var root = document.documentElement;
  var btn = document.getElementById('theme-toggle');
  var label = document.getElementById('theme-label');
  var theme = localStorage.getItem('theme') ||
    (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
  function apply() { root.dataset.theme = theme; label.textContent = theme; }
  apply();
  btn.addEventListener('click', function () {
    theme = theme === 'dark' ? 'light' : 'dark';
    localStorage.setItem('theme', theme);
    apply();
  });
})();
</script>
</body>
</html>
"""


def tags_html(tags):
    if not tags:
        return ""
    items = "".join(f'<span class="tag">{html.escape(t)}</span>' for t in tags)
    return f'<div class="tags">{items}</div>'


def build_post(post):
    body = render(post["body"])
    page = head(f'{post["title"]} — {SITE_TITLE}', post["summary"], "../")
    page += f"""
<main class="prose">
  <a class="back" href="../blog.html">← все заметки</a>
  <article>
    <header class="post-head">
      <time class="post-date" datetime="{html.escape(post["date"])}">{human_date(post["date"])}</time>
      <h1 class="post-title">{html.escape(post["title"])}</h1>
      {tags_html(post["tags"])}
    </header>
    {body}
  </article>
  <a class="back back--bottom" href="../blog.html">← все заметки</a>
</main>
"""
    page += FOOT
    (OUT_DIR / f'{post["slug"]}.html').write_text(page, encoding="utf-8")


def build_index(posts):
    if posts:
        cards = "\n".join(
            f"""    <li><a class="post-card" href="blog/{p['slug']}.html">
      <time class="post-card-date" datetime="{html.escape(p['date'])}">{human_date(p['date'])}</time>
      <h2 class="post-card-title">{html.escape(p['title'])}</h2>
      <p class="post-card-sum">{html.escape(p['summary'])}</p>
      {tags_html(p['tags'])}
    </a></li>"""
            for p in posts
        )
        listing = f'<ul class="post-list">\n{cards}\n  </ul>'
    else:
        listing = '<p class="empty">Пока пусто. Первая заметка появится здесь.</p>'

    page = head(f"Блог — {SITE_TITLE}", SITE_DESC, "")
    page += f"""
<main class="prose prose--wide">
  <header class="blog-head">
    <h1 class="post-title">блог</h1>
    <p class="blog-sub">{html.escape(SITE_DESC)} <a href="feed.xml">RSS</a></p>
  </header>
  {listing}
</main>
"""
    page += FOOT
    (ROOT / "blog.html").write_text(page, encoding="utf-8")


def build_feed(posts):
    items = "\n".join(
        f"""    <item>
      <title>{html.escape(p['title'])}</title>
      <link>{SITE_URL}/blog/{p['slug']}.html</link>
      <guid isPermaLink="true">{SITE_URL}/blog/{p['slug']}.html</guid>
      <pubDate>{rfc822(p['date'])}</pubDate>
      <description>{html.escape(p['summary'])}</description>
    </item>"""
        for p in posts[:20]
    )

    feed = f"""<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>{html.escape(SITE_TITLE)}</title>
    <link>{SITE_URL}/blog.html</link>
    <description>{html.escape(SITE_DESC)}</description>
    <language>ru</language>
    <atom:link href="{SITE_URL}/feed.xml" rel="self" type="application/rss+xml"/>
{items}
  </channel>
</rss>
"""
    (ROOT / "feed.xml").write_text(feed, encoding="utf-8")


def main():
    POSTS_DIR.mkdir(exist_ok=True)
    OUT_DIR.mkdir(exist_ok=True)

    posts = []
    for path in sorted(POSTS_DIR.glob("*.md")):
        post = parse_post(path)
        if post:
            posts.append(post)
            print(f"  {post['date']} {post['title']}")
        else:
            print(f"  черновик пропущен: {path.name}")

    posts.sort(key=lambda p: p["date"], reverse=True)

    for post in posts:
        build_post(post)
    build_index(posts)
    build_feed(posts)

    print(f"готово: {len(posts)} заметок, blog.html и feed.xml")


if __name__ == "__main__":
    print("блог:")
    main()
