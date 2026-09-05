"""
Маленький рендерер Markdown без зависимостей.

Поддерживает то, что нужно для заметок: заголовки, абзацы, списки,
цитаты, блоки кода, таблицы не поддерживает. Весь текст экранируется,
поэтому сырой HTML в постах не сработает — это сделано намеренно.
"""

import html
import re

# ---------------------------------------------------------------- строчное

INLINE = [
    # Код идёт первым: внутри него разметка не работает.
    (re.compile(r"`([^`]+)`"), lambda m: f"<code>{m.group(1)}</code>"),
    (re.compile(r"!\[([^\]]*)\]\(([^)\s]+)\)"),
     lambda m: f'<img src="{m.group(2)}" alt="{m.group(1)}" loading="lazy">'),
    (re.compile(r"\[([^\]]+)\]\(([^)\s]+)\)"), lambda m: link(m.group(1), m.group(2))),
    (re.compile(r"\*\*([^*]+)\*\*"), lambda m: f"<strong>{m.group(1)}</strong>"),
    (re.compile(r"(?<!\w)\*([^*]+)\*(?!\w)"), lambda m: f"<em>{m.group(1)}</em>"),
    (re.compile(r"~~([^~]+)~~"), lambda m: f"<del>{m.group(1)}</del>"),
]


def link(text, href):
    # Чужие ссылки открываем в новой вкладке, свои — в этой же.
    outside = href.startswith("http")
    attrs = ' target="_blank" rel="noopener"' if outside else ""
    return f'<a href="{href}"{attrs}>{text}</a>'


def inline(text):
    """Строчная разметка. Текст уже должен быть экранирован."""
    for pattern, repl in INLINE:
        text = pattern.sub(repl, text)
    return text


def slugify(text):
    text = re.sub(r"<[^>]+>", "", text).strip().lower()
    text = re.sub(r"[^\w\s-]", "", text, flags=re.UNICODE)
    return re.sub(r"[\s_]+", "-", text) or "section"


# ------------------------------------------------------------------ блоки

def render(md):
    """Markdown в HTML. Возвращает готовый кусок разметки."""
    lines = md.replace("\r\n", "\n").split("\n")
    out = []
    i = 0

    while i < len(lines):
        line = lines[i]
        stripped = line.strip()

        # Пустая строка
        if not stripped:
            i += 1
            continue

        # Блок кода
        if stripped.startswith("```"):
            lang = stripped[3:].strip()
            body = []
            i += 1
            while i < len(lines) and not lines[i].strip().startswith("```"):
                body.append(lines[i])
                i += 1
            i += 1  # закрывающая тройка
            code = html.escape("\n".join(body))
            cls = f' class="lang-{html.escape(lang)}"' if lang else ""
            out.append(f"<pre><code{cls}>{code}</code></pre>")
            continue

        # Горизонтальная черта
        if re.fullmatch(r"(-{3,}|\*{3,})", stripped):
            out.append("<hr>")
            i += 1
            continue

        # Заголовок
        m = re.match(r"(#{1,4})\s+(.*)", stripped)
        if m:
            level = len(m.group(1)) + 1  # h1 занят заголовком поста
            level = min(level, 6)
            text = inline(html.escape(m.group(2).strip()))
            out.append(f'<h{level} id="{slugify(m.group(2))}">{text}</h{level}>')
            i += 1
            continue

        # Цитата
        if stripped.startswith(">"):
            body = []
            while i < len(lines) and lines[i].strip().startswith(">"):
                body.append(lines[i].strip().lstrip(">").strip())
                i += 1
            inner = inline(html.escape(" ".join(body)))
            out.append(f"<blockquote><p>{inner}</p></blockquote>")
            continue

        # Списки
        bullet = re.match(r"[-*+]\s+(.*)", stripped)
        number = re.match(r"\d+[.)]\s+(.*)", stripped)
        if bullet or number:
            ordered = bool(number)
            items = []
            pattern = r"\d+[.)]\s+(.*)" if ordered else r"[-*+]\s+(.*)"
            while i < len(lines):
                m = re.match(pattern, lines[i].strip())
                if not m:
                    break
                items.append(inline(html.escape(m.group(1))))
                i += 1
            tag = "ol" if ordered else "ul"
            body = "".join(f"<li>{x}</li>" for x in items)
            out.append(f"<{tag}>{body}</{tag}>")
            continue

        # Абзац: собираем до пустой строки
        body = []
        while i < len(lines) and lines[i].strip() and not starts_block(lines[i].strip()):
            body.append(lines[i].strip())
            i += 1
        text = inline(html.escape(" ".join(body)))
        out.append(f"<p>{text}</p>")

    return "\n".join(out)


def starts_block(stripped):
    """Строка начинает новый блок, значит абзац закончился."""
    return (
        stripped.startswith(("```", ">", "#"))
        or re.match(r"[-*+]\s+", stripped)
        or re.match(r"\d+[.)]\s+", stripped)
        or re.fullmatch(r"(-{3,}|\*{3,})", stripped)
    )


def plain(md, limit=200):
    """Текст без разметки: нужен для краткого описания и RSS."""
    text = re.sub(r"```.*?```", " ", md, flags=re.S)
    text = re.sub(r"[#>*_~`]", "", text)
    text = re.sub(r"!?\[([^\]]*)\]\([^)]*\)", r"\1", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text[:limit].rstrip() + ("…" if len(text) > limit else "")
