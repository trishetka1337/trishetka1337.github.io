import { CONFIG } from './config.js';
import { sunAltitude, sunTimes, noonAltitude } from './sun.js';

const $ = (id) => document.getElementById(id);

/* ============================ утилиты ============================ */

/** Загрузка JSON, который генерит GitHub Actions. Молча возвращает null. */
async function loadJSON(path) {
  try {
    const r = await fetch(path, { cache: 'no-cache' });
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  }
}

/** Русские окончания: 5 минут, 21 минута, 2 минуты. */
function plural(n, one, few, many) {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return few;
  return many;
}

function ago(iso) {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const min = Math.max(0, Math.round((Date.now() - then) / 60000));
  if (min < 1) return 'только что';
  if (min < 60) return `${min} ${plural(min, 'минуту', 'минуты', 'минут')} назад`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} ${plural(h, 'час', 'часа', 'часов')} назад`;
  const d = Math.round(h / 24);
  if (d < 31) return `${d} ${plural(d, 'день', 'дня', 'дней')} назад`;
  const mo = Math.round(d / 30);
  return `${mo} ${plural(mo, 'месяц', 'месяца', 'месяцев')} назад`;
}

const pad = (n) => String(n).padStart(2, '0');

/* ============================== тема ============================== */

function initTheme() {
  const btn = $('theme-toggle');
  const label = $('theme-label');
  const saved = localStorage.getItem('theme');
  const prefersLight = window.matchMedia('(prefers-color-scheme: light)').matches;
  let theme = saved || (prefersLight ? 'light' : 'dark');

  const apply = () => {
    document.documentElement.dataset.theme = theme;
    label.textContent = theme;
  };
  apply();

  btn.addEventListener('click', () => {
    theme = theme === 'dark' ? 'light' : 'dark';
    localStorage.setItem('theme', theme);
    apply();
  });
}

/* ============================ ротатор ============================ */

function initRotator() {
  const box = $('rotator');
  const words = CONFIG.doing;
  if (!box || words.length < 2) return;
  let i = 0;
  setInterval(() => {
    i = (i + 1) % words.length;
    box.innerHTML = `<span class="rotator-word">${words[i]}</span>`;
  }, 2800);
}

/* ============================== часы ============================== */

function initClock() {
  const tz = CONFIG.place.tz;
  const timeFmt = new Intl.DateTimeFormat('ru-RU', {
    timeZone: tz, hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  });
  const dateFmt = new Intl.DateTimeFormat('ru-RU', {
    timeZone: tz, weekday: 'long', day: 'numeric', month: 'long',
  });

  const clock = $('clock');
  const dateEl = $('now-date');

  const tick = () => {
    const parts = Object.fromEntries(
      timeFmt.formatToParts(new Date()).map((p) => [p.type, p.value])
    );
    clock.innerHTML =
      `<span class="clock-hm">${parts.hour}:${parts.minute}</span>` +
      `<span class="clock-s">:${parts.second}</span>`;
    dateEl.textContent = dateFmt.format(new Date());
  };

  tick();
  setInterval(tick, 1000);

  $('now-place').textContent = `${CONFIG.place.city}, ${CONFIG.place.country}`;
  $('now-tz').textContent = CONFIG.place.tzLabel;
}

/* ============================= погода ============================= */

// Коды WMO, которые отдаёт Open-Meteo.
const WMO = {
  0: 'ясно', 1: 'почти ясно', 2: 'переменная облачность', 3: 'пасмурно',
  45: 'туман', 48: 'изморозь',
  51: 'морось', 53: 'морось', 55: 'сильная морось',
  56: 'ледяная морось', 57: 'ледяная морось',
  61: 'небольшой дождь', 63: 'дождь', 65: 'ливень',
  66: 'ледяной дождь', 67: 'ледяной дождь',
  71: 'небольшой снег', 73: 'снег', 75: 'сильный снег', 77: 'снежные зёрна',
  80: 'ливень', 81: 'ливень', 82: 'сильный ливень',
  85: 'снегопад', 86: 'сильный снегопад',
  95: 'гроза', 96: 'гроза с градом', 99: 'гроза с градом',
};

async function initWeather() {
  const { lat, lon } = CONFIG.place;
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
    '&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m,wind_direction_10m' +
    '&wind_speed_unit=ms&timezone=auto';

  try {
    const r = await fetch(url);
    if (!r.ok) throw new Error(r.status);
    const { current: c } = await r.json();

    $('wx-temp').textContent = `${Math.round(c.temperature_2m)}°`;
    $('wx-desc').textContent = WMO[c.weather_code] ?? 'погода';
    $('wx-wind').textContent = `${c.wind_speed_10m.toFixed(1)} м/с ${windDir(c.wind_direction_10m)}`;
    $('wx-hum').textContent = `${c.relative_humidity_2m}%`;
  } catch {
    $('wx-desc').textContent = 'погода недоступна';
  }
}

function windDir(deg) {
  const dirs = ['С', 'СВ', 'В', 'ЮВ', 'Ю', 'ЮЗ', 'З', 'СЗ'];
  return dirs[Math.round(deg / 45) % 8];
}

/* ============================== солнце ============================== */

function initSun() {
  const { lat, lon, tz } = CONFIG.place;
  const hm = new Intl.DateTimeFormat('ru-RU', {
    timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false,
  });

  const draw = () => {
    const now = new Date();
    const alt = sunAltitude(now, lat, lon);
    const { rise, set } = sunTimes(now, lat, lon);

    $('sun-altitude').textContent = alt.toFixed(1);
    $('sun-phase').textContent = alt > 0 ? 'день' : alt > -6 ? 'сумерки' : 'ночь';

    if (rise && set) {
      $('sun-rise').textContent = hm.format(rise);
      $('sun-set').textContent = hm.format(set);
      const mins = Math.round((set - rise) / 60000);
      $('sun-len').textContent = `${Math.floor(mins / 60)} ч ${pad(mins % 60)} м`;

      // Точка едет по дуге: 0 на восходе, 1 на закате.
      let t = (now - rise) / (set - rise);
      const dot = $('sun-dot');
      dot.style.opacity = t < 0 || t > 1 ? '.25' : '1';
      t = Math.min(1, Math.max(0, t));
      // Та же квадратичная кривая, что в SVG: M10 78 Q150 -6 290 78
      const x = (1 - t) ** 2 * 10 + 2 * (1 - t) * t * 150 + t ** 2 * 290;
      const y = (1 - t) ** 2 * 78 + 2 * (1 - t) * t * -6 + t ** 2 * 78;
      dot.setAttribute('cx', x.toFixed(1));
      dot.setAttribute('cy', y.toFixed(1));
    } else {
      $('sun-rise').textContent = '—';
      $('sun-set').textContent = '—';
      $('sun-len').textContent = alt > 0 ? 'полярный день' : 'полярная ночь';
    }
  };

  draw();
  setInterval(draw, 60000);
  // Пик дня показываем как подпись к высоте.
  $('sun-altitude').title = `пик сегодня: ${noonAltitude(new Date(), lat, lon).toFixed(1)}°`;
}

/* ============================== github ============================== */

async function initGitHub() {
  // Основной источник — снапшот от Actions (там есть граф контрибуций).
  let data = await loadJSON('data/github.json');

  // Запасной путь: публичный API, если снапшота ещё нет.
  if (!data) {
    try {
      const [u, repos] = await Promise.all([
        fetch(`https://api.github.com/users/${CONFIG.github}`).then((r) => r.json()),
        fetch(`https://api.github.com/users/${CONFIG.github}/repos?sort=updated&per_page=6`).then((r) => r.json()),
      ]);
      data = {
        followers: u.followers,
        public_repos: u.public_repos,
        repos: (Array.isArray(repos) ? repos : []).map((x) => ({
          name: x.name, description: x.description, language: x.language,
          stars: x.stargazers_count, url: x.html_url, updated_at: x.updated_at,
        })),
      };
    } catch {
      data = null;
    }
  }

  if (!data) {
    $('gh-graph').innerHTML = '<span class="card-note">github недоступен</span>';
    return;
  }

  $('gh-contrib').textContent = data.contributions ?? '—';
  $('gh-streak').textContent = data.streak ?? '—';
  $('gh-repos').textContent = data.public_repos ?? '—';
  $('gh-followers').textContent = data.followers ?? '—';

  renderGraph(data.calendar);
  renderCommits(data.commits);
  renderProjects(data.repos);
}

function renderGraph(calendar) {
  const box = $('gh-graph');
  if (!Array.isArray(calendar) || !calendar.length) {
    box.remove();
    return;
  }
  const max = Math.max(1, ...calendar.map((d) => d.count));
  box.innerHTML = calendar
    .map((d) => {
      const lvl = d.count === 0 ? 0 : Math.min(4, Math.ceil((d.count / max) * 4));
      const word = plural(d.count, 'контрибуция', 'контрибуции', 'контрибуций');
      return `<i class="gh-cell" data-lvl="${lvl}" title="${d.date}: ${d.count} ${word}"></i>`;
    })
    .join('');
}

function renderCommits(commits) {
  const box = $('gh-commits');
  if (!Array.isArray(commits) || !commits.length) {
    box.remove();
    return;
  }
  box.innerHTML = commits
    .slice(0, 5)
    .map(
      (c) => `<li><a class="commit" href="${c.url}" target="_blank" rel="noopener">
        <span class="commit-repo">${c.repo}</span>
        <span class="commit-msg">${escapeHTML(c.message)}</span>
        <span class="commit-when">${ago(c.date)}</span>
      </a></li>`
    )
    .join('');
}

function renderProjects(repos) {
  const box = $('projects');
  if (!Array.isArray(repos) || !repos.length) {
    document.getElementById('card-projects').remove();
    return;
  }

  // Именно последние по времени, а не самые звёздные.
  const recent = [...repos]
    .sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at))
    .slice(0, CONFIG.recentCount);

  const word = plural(recent.length, 'репозиторий', 'репозитория', 'репозиториев');
  $('projects-title').textContent = `последние ${recent.length} ${word}`;

  box.innerHTML = recent
    .map(
      (r) => `<li><a class="project" href="${r.url}" target="_blank" rel="noopener">
        <span class="project-top">
          <span class="project-name">${escapeHTML(r.name)}</span>
          ${r.stars ? `<span class="project-stars">★ ${r.stars}</span>` : ''}
        </span>
        <p class="project-desc">${escapeHTML(r.description || 'без описания')}</p>
        <span class="project-foot">
          ${r.language ? `<span class="project-lang"><i class="lang-dot"></i>${r.language}</span>` : '<span></span>'}
          <span class="project-when">${r.updated_at ? ago(r.updated_at) : ''}</span>
        </span>
      </a></li>`
    )
    .join('');
}

/* ============================== главное ============================== */

const PIN_STATUS = {
  live:   { label: 'работает',  cls: 'pin--live' },
  wip:    { label: 'в работе',  cls: 'pin--wip' },
  paused: { label: 'заморожен', cls: 'pin--paused' },
};

function renderPinned() {
  const box = $('pinned');
  const items = CONFIG.pinned || [];

  if (!items.length) {
    document.getElementById('card-pinned').remove();
    return;
  }

  $('pinned-count').textContent = `${items.length} ${plural(items.length, 'проект', 'проекта', 'проектов')}`;

  box.innerHTML = items
    .map((p) => {
      const st = PIN_STATUS[p.status] || PIN_STATUS.live;
      const inner = `
        <span class="pin-top">
          <span class="pin-name">${escapeHTML(p.name)}</span>
          <span class="pin-status ${st.cls}"><i></i>${st.label}</span>
        </span>
        <p class="pin-desc">${escapeHTML(p.description || '')}</p>
        ${p.tag ? `<span class="pin-tag">${escapeHTML(p.tag)}</span>` : ''}`;

      // Проект может быть без ссылки: тогда это просто карточка.
      return p.href
        ? `<li><a class="pin" href="${p.href}" target="_blank" rel="noopener">${inner}</a></li>`
        : `<li><div class="pin pin--flat">${inner}</div></li>`;
    })
    .join('');
}

/* ========================== инфраструктура ========================== */

async function initInfra() {
  const data = await loadJSON('data/infra.json');
  const box = $('infra-nodes');

  if (!data || !Array.isArray(data.nodes) || !data.nodes.length) {
    document.getElementById('card-infra').remove();
    return;
  }

  const up = data.nodes.filter((n) => n.up).length;
  $('infra-summary').textContent = `${up}/${data.nodes.length} онлайн`;

  box.innerHTML = data.nodes
    .map(
      (n) => `<li class="node ${n.up ? 'node--up' : 'node--down'}">
        <i class="node-led"></i>
        <span class="node-name">${escapeHTML(n.name)}</span>
        <span class="node-role">${escapeHTML(n.role || '')}</span>
        <span class="node-ping">${n.up ? `${n.ms} ms` : 'нет ответа'}</span>
      </li>`
    )
    .join('');

  $('infra-checked').textContent = `проверено ${ago(data.checked_at)}`;
}

/* ============================== музыка ============================== */

async function initMusic() {
  const data = await loadJSON('data/music.json');
  if (!data || !data.now) return;

  document.getElementById('card-music').hidden = false;
  $('track-name').textContent = data.now.name;
  $('track-artist').textContent = data.now.artist;
  if (data.now.art) $('track-art').style.backgroundImage = `url("${data.now.art}")`;
  $('music-source').textContent = data.now.playing ? 'играет сейчас' : 'последний трек';

  if (Array.isArray(data.recent) && data.recent.length) {
    $('scrobbles').innerHTML = data.recent
      .slice(0, 5)
      .map(
        (t) => `<li class="scrobble">
          <span>${escapeHTML(t.artist)} — ${escapeHTML(t.name)}</span>
          <span>${t.date ? ago(t.date) : ''}</span>
        </li>`
      )
      .join('');
  }
}

/* =============================== чек =============================== */

function initReceipt() {
  const now = new Date();
  $('rc-items').innerHTML = CONFIG.stack
    .map((s) => `<li><span>${escapeHTML(s)}</span><span>0.00</span></li>`)
    .join('');
  $('rc-count').textContent = CONFIG.stack.length;
  $('rc-since').textContent = CONFIG.memberSince;
  $('rc-date').textContent =
    `${pad(now.getDate())}.${pad(now.getMonth() + 1)}.${now.getFullYear()} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
  // Номер чека растёт со временем: просто день года плюс минуты.
  const dayOfYear = Math.floor((now - new Date(now.getFullYear(), 0, 0)) / 86400000);
  $('rc-order').textContent = `#${String(dayOfYear).padStart(4, '0')}`;
}

/* =========================== ссылки и кольцо =========================== */

function initLinks() {
  // Пункты без значения ещё не заполнены — на странице их быть не должно.
  const filled = (CONFIG.contacts || []).filter((c) => c.value && c.value.trim());
  const groups = [...new Set(filled.map((c) => c.group))];

  $('links').innerHTML = groups
    .map((g) => {
      const rows = filled
        .filter((c) => c.group === g)
        .map((c) => {
          const inner = `
            <span class="link-label">${escapeHTML(c.label)}</span>
            <span class="link-value">${escapeHTML(c.value)}</span>
            ${c.note ? `<span class="link-note">${escapeHTML(c.note)}</span>` : ''}`;

          // Есть ссылка — ведём наружу. Нет — отдаём в буфер обмена.
          return c.href
            ? `<li><a class="link-row" href="${c.href}" target="_blank" rel="noopener me">${inner}
                 <span class="link-act">↗</span></a></li>`
            : `<li><button class="link-row" type="button" data-copy="${escapeHTML(c.value)}">${inner}
                 <span class="link-act">копировать</span></button></li>`;
        })
        .join('');
      return `<li class="link-group"><span class="link-group-title">${escapeHTML(g)}</span>
                <ul class="link-list">${rows}</ul></li>`;
    })
    .join('');

  initCopy();

  const ring = CONFIG.webring;
  $('webring').innerHTML =
    '<span>←</span>' +
    `<a href="${ring[0]?.href || '#'}" rel="noopener">${ring[0]?.label || '—'}</a>` +
    `<span class="ring-self">${CONFIG.nick}</span>` +
    `<a href="${ring[1]?.href || '#'}" rel="noopener">${ring[1]?.label || '—'}</a>` +
    '<span>→</span>';

  $('year').textContent = new Date().getFullYear();
  $('hero-sub').textContent = CONFIG.tagline;

  // Ссылки на профиль берём из конфига, чтобы ник менялся в одном месте.
  document.querySelectorAll('[data-gh-profile]').forEach((a) => {
    a.href = `https://github.com/${CONFIG.github}${a.dataset.ghProfile}`;
    if (a.dataset.ghLabel === 'nick') a.textContent = `@${CONFIG.github}`;
  });
}

/** Клик по строке без ссылки кладёт значение в буфер. */
function initCopy() {
  document.querySelectorAll('[data-copy]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const act = btn.querySelector('.link-act');
      try {
        await navigator.clipboard.writeText(btn.dataset.copy);
        act.textContent = 'скопировано';
      } catch {
        act.textContent = 'не вышло';
      }
      setTimeout(() => { act.textContent = 'копировать'; }, 1600);
    });
  });
}

function escapeHTML(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  );
}

/* ============================== запуск ============================== */

initTheme();
initRotator();
initClock();
initSun();
initReceipt();
renderPinned();
initLinks();
initWeather();
initGitHub();
initInfra();
initMusic();

loadJSON('data/meta.json').then((m) => {
  $('build-stamp').textContent = m?.built_at ? `данные: ${ago(m.built_at)}` : 'статика';
});
