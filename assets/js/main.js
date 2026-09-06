import { CONFIG } from './config.js';
import { sunAltitude, sunTimes, noonAltitude } from './sun.js';
import { LANGS, STRINGS, detectLang, pick, pluralize } from './i18n.js';

const $ = (id) => document.getElementById(id);

/* ============================== язык ============================== */

const lang = detectLang();
const T = STRINGS[lang];

document.documentElement.lang = lang;

/** Текст из конфига на текущем языке. */
const L = (value) => pick(value, lang);

/** Форма слова по числу. */
const plural = (n, key) => pluralize(n, T.units[key], lang);

function initLangSwitch() {
  $('langs').innerHTML = LANGS
    .map((code) => `<button class="lang ${code === lang ? 'lang--on' : ''}" type="button"
      data-lang="${code}" ${code === lang ? 'aria-current="true"' : ''}>${code}</button>`)
    .join('');

  $('langs').querySelectorAll('[data-lang]').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (btn.dataset.lang === lang) return;
      try {
        localStorage.setItem('lang', btn.dataset.lang);
      } catch { /* приватный режим */ }
      // Перезагрузка вместо перерисовки: надёжнее и без осиротевших таймеров.
      location.reload();
    });
  });
}

/** Подписи, у которых текст не зависит от данных. */
function applyStatic() {
  document.querySelectorAll('[data-i18n]').forEach((el) => {
    const value = T[el.dataset.i18n];
    if (value) el.textContent = value;
  });

  $('city-input').placeholder = T.city_search;
  $('city-input').setAttribute('aria-label', T.city_search_label);
  $('links-title').textContent = lang === 'ru' ? 'связь' : 'contacts';

  $('sky-n').textContent = T.sky_compass.n;
  $('sky-e').textContent = T.sky_compass.e;
  $('sky-s').textContent = T.sky_compass.s;
  $('sky-w').textContent = T.sky_compass.w;

  $('nav-wall').textContent = lang === 'ru' ? 'стена' : 'wall';

  // Блог существует на двух языках, ведём в нужную версию.
  $('nav-blog').href = lang === 'en' ? 'blog.en.html' : 'blog.html';
  $('nav-feed').href = lang === 'en' ? 'feed.en.xml' : 'feed.xml';
}

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

function ago(iso) {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const min = Math.max(0, Math.round((Date.now() - then) / 60000));

  const say = (n, key) => (lang === 'ru'
    ? `${n} ${plural(n, key)} ${T.ago}`
    : `${n} ${plural(n, key)} ${T.ago}`);

  if (min < 1) return T.just_now;
  if (min < 60) return say(min, 'minute');
  const h = Math.round(min / 60);
  if (h < 24) return say(h, 'hour');
  const d = Math.round(h / 24);
  if (d < 31) return say(d, 'day');
  return say(Math.round(d / 30), 'month');
}

/**
 * То же, но для даты без времени: считаем календарные дни, иначе
 * поставленная сегодня дата показывается как «20 часов назад».
 */
function agoDays(dateStr) {
  const d = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(d.getTime())) return '';

  const midnight = new Date();
  midnight.setHours(0, 0, 0, 0);
  const days = Math.round((midnight - d) / 86400000);

  if (days <= 0) return T.today;
  if (days === 1) return T.yesterday;
  if (days < 31) return `${days} ${plural(days, 'day')} ${T.ago}`;
  const mo = Math.round(days / 30);
  if (mo < 12) return `${mo} ${plural(mo, 'month')} ${T.ago}`;
  const y = Math.round(mo / 12);
  return `${y} ${plural(y, 'year')} ${T.ago}`;
}

const pad = (n) => String(n).padStart(2, '0');

function escapeHTML(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  );
}

/* ======================== выбранный город ========================= */
// Один источник правды для погоды, солнца и спутников.

let city = readSavedCity() || { ...CONFIG.defaultCity };
const cityChosen = Boolean(readSavedCity());
const cityListeners = [];

function readSavedCity() {
  try {
    const saved = JSON.parse(localStorage.getItem('city') || 'null');
    if (saved && Number.isFinite(saved.lat) && Number.isFinite(saved.lon)) return saved;
  } catch { /* испорченная запись, игнорируем */ }
  return null;
}

const WHO = {
  manual: () => T.who_manual,
  geo: () => T.who_geo,
  auto: () => T.who_auto,
  default: () => T.who_default,
};

/**
 * @param {boolean} persist ручной выбор запоминаем, автоопределение нет:
 *   иначе город прилипнет навсегда, даже если человек переедет.
 */
function setCity(next, persist = true, mode = persist ? 'manual' : 'auto') {
  city = next;
  if (persist) {
    try {
      localStorage.setItem('city', JSON.stringify(next));
    } catch { /* приватный режим, переживём */ }
  }
  $('city-name').textContent = next.name;
  $('wx-who').textContent = WHO[mode]();
  cityListeners.forEach((fn) => fn(next));
}

const onCityChange = (fn) => cityListeners.push(fn);

/**
 * Ищем город в геокодере Open-Meteo и берём тот, чей часовой пояс совпадает
 * с искомым. Без этой проверки поиск подсовывает однофамильцев: по запросу
 * New York находится деревня Йорк в Небраске.
 */
async function geocodeInZone(query, tz, searchLang) {
  const url = `https://geocoding-api.open-meteo.com/v1/search?count=10&language=${searchLang}` +
    `&format=json&name=${encodeURIComponent(query)}`;
  try {
    const r = await fetch(url);
    const found = (await r.json()).results || [];
    const f = found
      .filter((x) => x.timezone === tz)
      .sort((a, b) => (b.population || 0) - (a.population || 0))[0];
    if (!f) return null;
    return { name: f.name, country: f.country_code || '', lat: f.latitude, lon: f.longitude };
  } catch {
    return null;
  }
}

/**
 * Город посетителя по его часовому поясу.
 *
 * Имя пояса и так содержит крупный город: Europe/Moscow, Asia/Tokyo.
 * Это не требует ни разрешения на геолокацию, ни обращения к сервисам,
 * которые определяют место по адресу: пояс уже известен браузеру.
 */
async function detectCityByTimezone() {
  let tz = '';
  try {
    tz = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
  } catch { /* совсем старый браузер */ }

  if (!tz.includes('/')) return null;
  const guess = tz.split('/').pop().replace(/_/g, ' ');

  return (await geocodeInZone(guess, tz, lang)) || geocodeInZone(guess, tz, 'en');
}

/* ============================== тема ============================== */

function initTheme() {
  const btn = $('theme-toggle');
  const saved = localStorage.getItem('theme');
  const prefersLight = window.matchMedia('(prefers-color-scheme: light)').matches;
  let theme = saved || (prefersLight ? 'light' : 'dark');

  const apply = () => {
    document.documentElement.dataset.theme = theme;
    btn.setAttribute('aria-checked', String(theme === 'light'));
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
    box.innerHTML = `<span class="rotator-word">${escapeHTML(L(words[i]))}</span>`;
  }, 2800);
}

/* ============================== часы ============================== */

/** Смещение часового пояса от UTC в минутах. */
function tzOffsetMinutes(tz, date = new Date()) {
  try {
    const name = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'longOffset' })
      .formatToParts(date)
      .find((p) => p.type === 'timeZoneName')?.value || '';
    // Приходит вида GMT+03:00, а для нулевого пояса просто GMT.
    const m = name.match(/GMT([+-])(\d{2}):(\d{2})/);
    if (!m) return 0;
    return (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3]));
  } catch {
    return 0;
  }
}

/** Подпись вида UTC+3 для произвольного пояса. */
function tzLabel(tz) {
  const min = tzOffsetMinutes(tz);
  const sign = min < 0 ? '-' : '+';
  const abs = Math.abs(min);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  return `UTC${sign}${h}${m ? ':' + pad(m) : ''}`;
}

/** Насколько часы гостя убежали вперёд относительно моих. */
function diffText(min) {
  if (min === 0) return T.diff_same;
  const abs = Math.abs(min);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  const parts = [];
  if (h) parts.push(`${h} ${plural(h, 'hour')}`);
  if (m) parts.push(`${m} ${lang === 'ru' ? 'мин' : 'min'}`);
  return `${min > 0 ? '+' : '−'}${parts.join(' ')}`;
}

function initClock() {
  // Крупные часы — время гостя: с них он и начинает смотреть страницу.
  const guestTz = Intl.DateTimeFormat().resolvedOptions().timeZone || CONFIG.place.tz;
  const authorTz = CONFIG.place.tz;

  const guestTime = new Intl.DateTimeFormat(T.locale, {
    timeZone: guestTz, hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  });
  const guestDate = new Intl.DateTimeFormat(T.locale, {
    timeZone: guestTz, weekday: 'long', day: 'numeric', month: 'long',
  });
  const authorTime = new Intl.DateTimeFormat(T.locale, {
    timeZone: authorTz, hour: '2-digit', minute: '2-digit', hour12: false,
  });

  const clock = $('clock');

  const tick = () => {
    const now = new Date();
    const p = Object.fromEntries(guestTime.formatToParts(now).map((x) => [x.type, x.value]));
    clock.innerHTML =
      `<span class="clock-hm">${p.hour}:${p.minute}</span>` +
      `<span class="clock-s">:${p.second}</span>`;
    $('now-date').textContent = guestDate.format(now);

    const mine = authorTime.format(now);
    $('now-mine').textContent = mine;
    $('author-time').textContent = mine;
  };

  tick();
  setInterval(tick, 1000);

  $('now-place').textContent = guestTz.split('/').pop().replace(/_/g, ' ');
  $('now-tz').textContent = tzLabel(guestTz);
  $('now-diff').textContent = diffText(tzOffsetMinutes(guestTz) - tzOffsetMinutes(authorTz));

  $('topclock-label').textContent = CONFIG.place.label;
  $('topclock').title = `${CONFIG.place.label}, ${CONFIG.place.tzLabel}`;
}

/* ============================= погода ============================= */

function windDir(deg) {
  return T.compass[Math.round(deg / 45) % 8];
}

// Часовой пояс выбранного города. Приезжает вместе с погодой и нужен солнцу,
// иначе восход показывается по часам зрителя, а не города.
let cityTz = null;
let redrawSun = () => {};

async function loadWeather({ lat, lon }) {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
    '&current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,' +
    'wind_speed_10m,wind_direction_10m&wind_speed_unit=ms&timezone=auto';

  try {
    const r = await fetch(url);
    if (!r.ok) throw new Error(r.status);
    const data = await r.json();
    const c = data.current;

    cityTz = data.timezone || null;
    redrawSun();
    startLocalClock();

    $('wx-temp').textContent = `${Math.round(c.temperature_2m)}°`;
    $('wx-desc').textContent = T.wmo[c.weather_code] ?? T.weather;
    $('wx-feels').textContent = `${Math.round(c.apparent_temperature)}°`;
    $('wx-wind').textContent =
      `${c.wind_speed_10m.toFixed(1)} ${T.wind_units} ${windDir(c.wind_direction_10m)}`;
    $('wx-hum').textContent = `${c.relative_humidity_2m}%`;
  } catch {
    $('wx-desc').textContent = T.weather_failed;
  }
}

/** Местное время выбранного города, рядом с его погодой. */
let localClockTimer = null;
function startLocalClock() {
  clearInterval(localClockTimer);
  if (!cityTz) return;
  const fmt = new Intl.DateTimeFormat(T.locale, {
    timeZone: cityTz, hour: '2-digit', minute: '2-digit', hour12: false,
  });
  const tick = () => { $('wx-local').textContent = fmt.format(new Date()); };
  tick();
  localClockTimer = setInterval(tick, 20000);
}

/* ========================= выбор города ========================= */

function initCityPicker() {
  const btn = $('city-btn');
  const box = $('city-picker');
  const input = $('city-input');
  const results = $('city-results');
  let timer = null;

  const close = () => {
    box.hidden = true;
    btn.setAttribute('aria-expanded', 'false');
    results.innerHTML = '';
    input.value = '';
  };

  btn.addEventListener('click', () => {
    const open = box.hidden;
    box.hidden = !open;
    btn.setAttribute('aria-expanded', String(open));
    if (open) input.focus();
    else close();
  });

  input.addEventListener('input', () => {
    clearTimeout(timer);
    const q = input.value.trim();
    if (q.length < 2) {
      results.innerHTML = '';
      return;
    }
    // Ждём паузу в наборе, чтобы не долбить геокодер на каждой букве.
    timer = setTimeout(() => search(q), 350);
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') close();
  });

  document.addEventListener('click', (e) => {
    if (!box.hidden && !box.contains(e.target) && !btn.contains(e.target)) close();
  });

  // Точное место — только по явному клику и только в браузере посетителя.
  const geo = $('city-geo');
  if (!navigator.geolocation) {
    geo.remove();
  } else {
    geo.addEventListener('click', () => {
      geo.textContent = T.city_detecting;
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          // Округляем до километра: точные координаты человека уходить наружу не должны.
          setCity({
            name: lang === 'ru' ? 'моё место' : 'my place',
            country: '',
            lat: Math.round(pos.coords.latitude * 100) / 100,
            lon: Math.round(pos.coords.longitude * 100) / 100,
          }, true, 'geo');
          geo.textContent = T.city_detect;
          close();
        },
        () => { geo.textContent = T.city_detect_failed; },
        { timeout: 10000, maximumAge: 600000 }
      );
    });
  }

  async function search(q) {
    const url = `https://geocoding-api.open-meteo.com/v1/search?count=6&language=${lang}` +
      `&format=json&name=${encodeURIComponent(q)}`;
    let found = [];
    try {
      const r = await fetch(url);
      found = (await r.json()).results || [];
    } catch { /* сеть подвела, покажем пустой список */ }

    if (!found.length) {
      results.innerHTML = `<li class="city-empty">${T.city_empty}</li>`;
      return;
    }

    results.innerHTML = found
      .map((f, i) => {
        const region = [f.admin1, f.country].filter(Boolean).join(', ');
        return `<li><button class="city-option" type="button" data-i="${i}">
          <span class="city-option-name">${escapeHTML(f.name)}</span>
          <span class="city-option-region">${escapeHTML(region)}</span>
        </button></li>`;
      })
      .join('');

    results.querySelectorAll('[data-i]').forEach((el) => {
      el.addEventListener('click', () => {
        const f = found[+el.dataset.i];
        setCity({
          name: f.name,
          country: f.country_code || '',
          lat: f.latitude,
          lon: f.longitude,
        });
        close();
      });
    });
  }
}

/* ============================== солнце ============================== */

function initSun() {
  const draw = () => {
    // Время восхода показываем по часам того города, который выбран.
    const hm = new Intl.DateTimeFormat(T.locale, {
      ...(cityTz ? { timeZone: cityTz } : {}),
      hour: '2-digit', minute: '2-digit', hour12: false,
    });

    const { lat, lon } = city;
    const now = new Date();
    const alt = sunAltitude(now, lat, lon);
    const { rise, set } = sunTimes(now, lat, lon);

    $('sun-altitude').textContent = alt.toFixed(1);
    $('sun-phase').textContent = alt > 0 ? T.phase_day : alt > -6 ? T.phase_twilight : T.phase_night;
    $('sun-altitude').title = `${T.sun_peak}: ${noonAltitude(now, lat, lon).toFixed(1)}°`;

    if (rise && set) {
      $('sun-rise').textContent = hm.format(rise);
      $('sun-set').textContent = hm.format(set);
      const mins = Math.round((set - rise) / 60000);
      const hourMark = lang === 'ru' ? 'ч' : 'h';
      const minMark = lang === 'ru' ? 'м' : 'm';
      $('sun-len').textContent = `${Math.floor(mins / 60)} ${hourMark} ${pad(mins % 60)} ${minMark}`;

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
      $('sun-len').textContent = alt > 0 ? T.polar_day : T.polar_night;
    }
  };

  draw();
  setInterval(draw, 60000);
  onCityChange(draw);
  redrawSun = draw; // погода приносит часовой пояс, после этого время пересчитывается
}

/* ============================ спутники ============================ */

const rad = Math.PI / 180;

async function initSats() {
  const card = $('card-sats');
  const data = await loadJSON('data/satellites.json');

  // Нет орбитальных данных или не загрузилась библиотека — блока не будет.
  if (!data || !Array.isArray(data.sats) || !data.sats.length || !window.satellite) {
    card.remove();
    return;
  }

  const recs = data.sats
    .map((s) => {
      try {
        return {
          name: s.name,
          group: s.group || '',
          rec: window.satellite.twoline2satrec(s.tle1, s.tle2),
        };
      } catch {
        return null;
      }
    })
    .filter((s) => s && !s.rec.error);

  if (!recs.length) {
    card.remove();
    return;
  }

  // Через сколько минут спутник поднимется над горизонтом.
  // Шагаем вперёд по минуте: восемь часов хватает почти на любую орбиту.
  const nextPass = (rec, observer, from) => {
    for (let m = 1; m <= 8 * 60; m++) {
      const t = new Date(from.getTime() + m * 60000);
      const pv = window.satellite.propagate(rec, t);
      if (!pv || !pv.position) continue;
      const ecf = window.satellite.eciToEcf(pv.position, window.satellite.gstime(t));
      if (window.satellite.ecfToLookAngles(observer, ecf).elevation > 0) return m;
    }
    return null;
  };

  const passIn = (m) => {
    if (m === null) return T.sats_never;
    if (m < 60) return `${T.sats_in} ${m} ${plural(m, 'minute')}`;
    const h = Math.floor(m / 60);
    const minMark = lang === 'ru' ? 'мин' : 'min';
    return `${T.sats_in} ${h} ${plural(h, 'hour')} ${m % 60} ${minMark}`;
  };

  // Пролёты считаются дороже позиций, поэтому реже: раз в минуту и при смене города.
  let passes = new Map();
  const recalcPasses = () => {
    const now = new Date();
    const observer = { longitude: city.lon * rad, latitude: city.lat * rad, height: 0.1 };
    passes = new Map(recs.map(({ name, rec }) => [name, nextPass(rec, observer, now)]));
  };

  const draw = () => {
    const now = new Date();
    const gmst = window.satellite.gstime(now);
    const observer = { longitude: city.lon * rad, latitude: city.lat * rad, height: 0.1 };

    const rows = [];
    for (const { name, group, rec } of recs) {
      const pv = window.satellite.propagate(rec, now);
      if (!pv || !pv.position) continue;

      const ecf = window.satellite.eciToEcf(pv.position, gmst);
      const look = window.satellite.ecfToLookAngles(observer, ecf);
      const geo = window.satellite.eciToGeodetic(pv.position, gmst);
      const v = pv.velocity;

      rows.push({
        name,
        group,
        elevation: look.elevation / rad,        // высота над горизонтом, градусы
        azimuth: look.azimuth / rad,            // азимут, градусы от севера
        height: geo.height,                     // высота орбиты, км
        speed: Math.hypot(v.x, v.y, v.z) * 3600, // км/ч
      });
    }

    // Сверху те, кто над горизонтом, ниже — по времени ближайшего пролёта.
    const visible = rows.filter((r) => r.elevation > 0).sort((a, b) => b.elevation - a.elevation);
    const hidden = rows
      .filter((r) => r.elevation <= 0)
      .sort((a, b) => (passes.get(a.name) ?? 1e9) - (passes.get(b.name) ?? 1e9));
    rows.length = 0;
    rows.push(...visible, ...hidden);

    $('sats-summary').textContent =
      `${T.sats_visible} ${visible.length} ${T.sats_of} ${recs.length}`;

    // Небо сверху: центр — зенит, край круга — горизонт.
    // Подписываем только пять самых высоких, иначе имена налезают друг на друга.
    $('sky-dots').innerHTML = visible
      .map((r, i) => {
        const dist = ((90 - r.elevation) / 90) * 100;
        const x = dist * Math.sin(r.azimuth * rad);
        const y = -dist * Math.cos(r.azimuth * rad);
        const label = i < 5 ? `<text x="6" y="3">${escapeHTML(r.name)}</text>` : '';
        return `<g class="sky-sat" transform="translate(${x.toFixed(1)} ${y.toFixed(1)})">
          <circle r="3.5"><title>${escapeHTML(r.name)}</title></circle>${label}
        </g>`;
      })
      .join('');

    // Пустое небо без пояснения выглядит как поломка.
    if (!visible.length) {
      $('sky-dots').innerHTML = `<text class="sky-empty" x="0" y="4">${T.sats_empty}</text>`;
    }

    // Длинный список утомляет: показываем видимых и ближайших, остальных под кнопкой.
    const shown = expanded ? rows : rows.slice(0, Math.max(visible.length + 4, 6));
    const kmh = lang === 'ru' ? 'км/ч' : 'km/h';
    const km = lang === 'ru' ? 'км' : 'km';

    $('sats').innerHTML = shown
      .map((r) => {
        const up = r.elevation > 0;
        const when = up
          ? `${r.elevation.toFixed(0)}${T.sats_above}`
          : passIn(passes.get(r.name) ?? null);
        return `<li class="sat ${up ? 'sat--up' : ''}">
          <span class="sat-name">${escapeHTML(r.name)}</span>
          <span class="sat-el">${when}</span>
          <span class="sat-group">${escapeHTML(r.group)}</span>
          <span class="sat-num">${Math.round(r.height)} ${km} · ${Math.round(r.speed).toLocaleString(T.locale)} ${kmh}</span>
        </li>`;
      })
      .join('');

    const rest = rows.length - shown.length;
    const more = $('sats-more');
    more.hidden = rest <= 0 && !expanded;
    more.textContent = expanded
      ? T.sats_less
      : `${T.sats_more} ${rest} ${plural(rest, 'sat')}`;

    $('sats-note').textContent =
      `${T.sats_observer}: ${city.name} · ${T.sats_orbits} ${ago(data.updated_at)}`;
  };

  let expanded = false;
  $('sats-more').addEventListener('click', () => {
    expanded = !expanded;
    draw();
  });

  recalcPasses();
  draw();
  setInterval(draw, 5000);
  setInterval(recalcPasses, 60000);
  onCityChange(() => { recalcPasses(); draw(); });
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
        fetch(`https://api.github.com/users/${CONFIG.github}/repos?sort=updated&per_page=12`).then((r) => r.json()),
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
    $('gh-graph').innerHTML = `<span class="card-note">${T.gh_unavailable}</span>`;
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
      return `<i class="gh-cell" data-lvl="${lvl}" title="${d.date}: ${d.count} ${plural(d.count, 'contribution')}"></i>`;
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
        <span class="commit-repo">${escapeHTML(c.repo)}</span>
        <span class="commit-msg">${escapeHTML(c.message)}</span>
        <span class="commit-when">${ago(c.date)}</span>
      </a></li>`
    )
    .join('');
}

function renderProjects(repos) {
  const box = $('projects');
  if (!Array.isArray(repos) || !repos.length) {
    $('card-projects').remove();
    return;
  }

  // Именно последние по времени, а не самые звёздные.
  const recent = [...repos]
    .sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at))
    .slice(0, CONFIG.recentCount);

  $('projects-title').textContent =
    `${T.projects_recent} ${recent.length} ${plural(recent.length, 'repo')}`;

  box.innerHTML = recent
    .map(
      (r) => `<li><a class="project" href="${r.url}" target="_blank" rel="noopener">
        <span class="project-top">
          <span class="project-name">${escapeHTML(r.name)}</span>
          ${r.stars ? `<span class="project-stars">★ ${r.stars}</span>` : ''}
        </span>
        <p class="project-desc">${escapeHTML(r.description || T.no_description)}</p>
        <span class="project-foot">
          ${r.language ? `<span class="project-lang"><i class="lang-dot"></i>${escapeHTML(r.language)}</span>` : '<span></span>'}
          <span class="project-when">${r.updated_at ? ago(r.updated_at) : ''}</span>
        </span>
      </a></li>`
    )
    .join('');
}

/* ============================== главное ============================== */

function renderPinned() {
  const items = CONFIG.pinned || [];
  if (!items.length) {
    $('card-pinned').remove();
    return;
  }

  const statuses = {
    live: { label: T.status_live, cls: 'pin--live' },
    wip: { label: T.status_wip, cls: 'pin--wip' },
    paused: { label: T.status_paused, cls: 'pin--paused' },
  };

  $('pinned-count').textContent = `${items.length} ${plural(items.length, 'project')}`;

  $('pinned').innerHTML = items
    .map((p) => {
      const st = statuses[p.status] || statuses.live;
      const inner = `
        <span class="pin-top">
          <span class="pin-name">${escapeHTML(L(p.name))}</span>
          <span class="pin-status ${st.cls}"><i></i>${st.label}</span>
        </span>
        <p class="pin-desc">${escapeHTML(L(p.description))}</p>
        ${p.tag ? `<span class="pin-tag">${escapeHTML(L(p.tag))}</span>` : ''}`;

      // Проект может быть без ссылки: тогда это просто карточка.
      return p.href
        ? `<li><a class="pin" href="${p.href}" target="_blank" rel="noopener">${inner}</a></li>`
        : `<li><div class="pin pin--flat">${inner}</div></li>`;
    })
    .join('');
}

/* ============================ чем занят ============================ */

function renderDoing() {
  const now = CONFIG.now;
  if (!now || !Array.isArray(now.lines) || !now.lines.length) {
    $('card-now-doing').remove();
    return;
  }

  // Дата обновления важнее самого текста: по ней видно, живая страница или брошенная.
  $('now-updated').textContent = now.updated ? `${T.updated} ${agoDays(now.updated)}` : '';

  $('doing').innerHTML = now.lines
    .map((line) => {
      // Строка может быть текстом, объектом с переводами или объектом с зачёркиванием.
      const isEntry = line && typeof line === 'object' && ('text' in line || 'strike' in line);
      const item = isEntry ? line : { text: line };

      const cls = item.strike ? 'doing-item doing-item--done' : 'doing-item';
      const note = item.note ? ` <span class="doing-note">(${escapeHTML(L(item.note))})</span>` : '';
      return `<li class="${cls}">
        <span class="doing-text">${escapeHTML(L(item.text))}</span>${note}
      </li>`;
    })
    .join('');
}

/* =============================== стек =============================== */

function renderStack() {
  const items = CONFIG.stack || [];
  if (!items.length) {
    $('card-stack').remove();
    return;
  }

  const thisYear = new Date().getFullYear();

  $('stack').innerHTML = items
    .map((s) => {
      const lvl = Math.min(3, Math.max(1, s.level || 1));
      const bars = [1, 2, 3].map((i) => `<i class="${i <= lvl ? 'on' : ''}"></i>`).join('');

      // Первый год работы с языком считается за год, а не за ноль.
      const years = s.since ? Math.max(1, thisYear - s.since) : null;
      const stage = years ? `${years} ${plural(years, 'year')}` : '';

      return `<li class="skill">
        <span class="skill-name">${escapeHTML(L(s.name))}</span>
        <span class="skill-years">${stage}</span>
        <span class="skill-bars" aria-label="${lvl}/3">${bars}</span>
      </li>`;
    })
    .join('');
}

/* ========================== фоном музыка ========================== */

/**
 * Разбирает ссылку на музыку и возвращает, чем её проигрывать.
 *
 * Spotify во встроенном проигрывателе даёт только отрывки: полный трек
 * там слышат лишь те, у кого есть подписка. YouTube, SoundCloud и Bandcamp
 * играют целиком у всех, поэтому для фоновой музыки они удобнее.
 */
function parseMusic(link) {
  const url = String(link || '').trim();
  if (!url) return null;

  // Свой файл, лежащий рядом с сайтом.
  if (/\.(mp3|ogg|opus|m4a|wav|flac)$/i.test(url)) {
    return { kind: 'file', src: url, full: true, height: 54 };
  }

  let m = url.match(/spotify\.com\/(?:intl-\w+\/)?(playlist|album|track|artist|episode|show)\/([A-Za-z0-9]+)/);
  if (m) {
    return {
      kind: 'spotify', full: false, height: 80,
      src: `https://open.spotify.com/embed/${m[1]}/${m[2]}?utm_source=generator&theme=0`,
    };
  }

  // Плейлист ютуба.
  m = url.match(/[?&]list=([A-Za-z0-9_-]+)/);
  if (m && /youtu/.test(url)) {
    return {
      kind: 'youtube', full: true, height: 152,
      src: `https://www.youtube-nocookie.com/embed/videoseries?list=${m[1]}`,
    };
  }

  m = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|live\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/);
  if (m) {
    return {
      kind: 'youtube', full: true, height: 152,
      src: `https://www.youtube-nocookie.com/embed/${m[1]}`,
    };
  }

  if (/soundcloud\.com\//.test(url)) {
    return {
      kind: 'soundcloud', full: true, height: 120,
      src: 'https://w.soundcloud.com/player/?color=%2300ae4c&inverse=true&auto_play=false' +
           `&show_user=true&url=${encodeURIComponent(url)}`,
    };
  }

  if (/bandcamp\.com\//.test(url)) {
    // У Bandcamp во встраиваемом коде свой номер альбома, ссылка на страницу не подходит.
    return { kind: 'bandcamp', full: true, height: 120, src: null, needsCode: true };
  }

  return null;
}

function renderPlayer() {
  const cfg = CONFIG.player || {};
  const tracks = (cfg.tracks || []).filter((t) => t && t.src);

  $('spotify-title').textContent = L(cfg.title) || (lang === 'ru' ? 'фоном' : 'background');

  // Свои файлы важнее: играют целиком и не тянут чужие кадры.
  if (tracks.length) {
    $('card-spotify').hidden = false;
    $('player').remove();
    $('spotify-service').textContent = lang === 'ru' ? 'своё' : 'own files';
    initDeck(tracks);
    return;
  }

  const music = parseMusic(cfg.link);
  if (!music || !music.src) {
    $('card-spotify').remove();
    return;
  }

  $('card-spotify').hidden = false;
  $('deck').remove();
  $('spotify-service').textContent = music.kind;

  // Про отрывки предупреждаем только там, где они действительно есть.
  $('player-note').textContent = music.full
    ? (lang === 'ru' ? 'проигрыватель загрузится по клику' : 'the player loads on click')
    : (lang === 'ru'
      ? 'проигрыватель загрузится по клику. Spotify даёт гостям только отрывки'
      : 'the player loads on click. Spotify plays previews unless the listener has Premium');

  const start = $('player-start');
  start.textContent = lang === 'ru' ? '▶ включить' : '▶ play';

  // Чужой кадр появляется только по клику: он тянет свои куки,
  // а автозапуск браузеры всё равно блокируют.
  start.addEventListener('click', () => {
    $('player').innerHTML =
      `<iframe class="player-frame" src="${music.src}" width="100%" height="${music.height}"
        frameborder="0" scrolling="no" loading="lazy" title="${music.kind}"
        allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"></iframe>`;
  }, { once: true });
}

/** Время в виде 3:07. */
function clock(sec) {
  if (!Number.isFinite(sec)) return '0:00';
  const m = Math.floor(sec / 60);
  return `${m}:${pad(Math.floor(sec % 60))}`;
}

/** Свой проигрыватель: обычный тег audio плюс своя обвязка. */
function initDeck(tracks) {
  $('deck').hidden = false;

  // preload=none: файл не качается, пока гость не нажал play.
  // Элемент кладём в страницу: так его видят медиа-клавиши и расширения,
  // и состояние можно посмотреть, если что-то пойдёт не так.
  const audio = document.createElement('audio');
  audio.preload = 'none';
  audio.id = 'deck-audio';
  audio.hidden = true;
  $('deck').appendChild(audio);

  let current = -1;
  let seeking = false;

  const icon = $('deck-icon');
  const seek = $('deck-seek');
  const vol = $('deck-vol');

  // Громкость запоминаем: никому не нравится ловить внезапный грохот.
  const savedVol = Number(localStorage.getItem('volume'));
  audio.volume = Number.isFinite(savedVol) && savedVol > 0 ? Math.min(savedVol, 1) : 0.7;
  vol.value = String(Math.round(audio.volume * 100));

  const renderList = () => {
    $('deck-list').innerHTML = tracks
      .map((t, i) => `<li><button class="deck-item ${i === current ? 'deck-item--on' : ''}"
        type="button" data-i="${i}">
        <span class="deck-item-no">${pad(i + 1)}</span>
        <span class="deck-item-name">${escapeHTML(L(t.title) || t.src.split('/').pop())}</span>
        ${t.artist ? `<span class="deck-item-artist">${escapeHTML(L(t.artist))}</span>` : ''}
      </button></li>`)
      .join('');

    $('deck-list').querySelectorAll('[data-i]').forEach((btn) => {
      btn.addEventListener('click', () => load(+btn.dataset.i, true));
    });
  };

  // Список из одного трека — это не список.
  if (tracks.length < 2) $('deck-list').remove();

  function load(i, autoplay) {
    current = ((i % tracks.length) + tracks.length) % tracks.length;
    const t = tracks[current];
    audio.src = t.src;
    $('deck-title').textContent = L(t.title) || t.src.split('/').pop();
    $('deck-artist').textContent = L(t.artist) || '';
    if (tracks.length > 1) renderList();
    if (autoplay) audio.play().catch(() => { /* браузер не дал, ждём клика */ });
  }

  load(0, false);

  $('deck-play').addEventListener('click', () => {
    if (audio.paused) audio.play().catch(() => {});
    else audio.pause();
  });

  audio.addEventListener('play', () => { icon.textContent = '⏸'; });
  audio.addEventListener('pause', () => { icon.textContent = '▶'; });

  audio.addEventListener('loadedmetadata', () => {
    $('deck-dur').textContent = clock(audio.duration);
  });

  audio.addEventListener('timeupdate', () => {
    $('deck-cur').textContent = clock(audio.currentTime);
    if (!seeking && audio.duration) {
      seek.value = String(Math.round((audio.currentTime / audio.duration) * 1000));
    }
  });

  // Один трек играет по кругу, несколько — по очереди.
  audio.addEventListener('ended', () => {
    if (tracks.length === 1) {
      audio.currentTime = 0;
      audio.play().catch(() => {});
    } else {
      load(current + 1, true);
    }
  });

  audio.addEventListener('error', () => {
    $('deck-artist').textContent = lang === 'ru' ? 'файл не открылся' : 'could not load the file';
  });

  seek.addEventListener('input', () => { seeking = true; });
  seek.addEventListener('change', () => {
    if (audio.duration) audio.currentTime = (seek.value / 1000) * audio.duration;
    seeking = false;
  });

  vol.addEventListener('input', () => {
    audio.volume = vol.value / 100;
    try {
      localStorage.setItem('volume', String(audio.volume));
    } catch { /* приватный режим */ }
  });
}

/* ========================= кнопки и блинки ========================= */

function renderButtons() {
  const card = $('card-buttons');
  const mine = `<a href="${CONFIG.siteUrl}"><img src="${CONFIG.siteUrl}/assets/img/button.png" width="88" height="31" alt="villcreat"></a>`;

  $('buttons-title').textContent = lang === 'ru' ? 'кнопки' : 'buttons';
  $('buttons-hint').textContent = lang === 'ru'
    ? 'поставьте меня у себя, код копируется по клику'
    : 'put me on your site, click the code to copy';

  const code = $('button-code');
  code.textContent = mine;
  code.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(mine);
      code.dataset.copied = '1';
      setTimeout(() => { delete code.dataset.copied; }, 1600);
    } catch { /* буфер недоступен, код и так виден целиком */ }
  });

  // Чужие кнопки. Пока их нет, блока просто не будет.
  const buttons = CONFIG.buttons || [];
  $('buttons-wall').innerHTML = buttons
    .map((b) => `<a class="btn88-link" href="${b.href}" target="_blank" rel="noopener">
      <img class="btn88" src="${b.src}" width="88" height="31" alt="${escapeHTML(b.alt)}" loading="lazy">
    </a>`)
    .join('');

  const blinkies = CONFIG.blinkies || [];
  $('blinkies').innerHTML = blinkies
    .map((b) => `<img class="blinkie" src="assets/img/blinkies/${b.file}"
      width="150" height="20" alt="${escapeHTML(b.alt)}" loading="lazy">`)
    .join('');

  if (blinkies.length) {
    $('blinkies-credit').innerHTML = lang === 'ru'
      ? 'блинки сделаны на <a href="https://blinkies.cafe" target="_blank" rel="noopener">blinkies.cafe</a>, шаблоны CC BY'
      : 'blinkies made at <a href="https://blinkies.cafe" target="_blank" rel="noopener">blinkies.cafe</a>, templates CC BY';
  }

  if (!buttons.length && !blinkies.length) card.remove();
}

/* ========================== инфраструктура ========================== */

async function initInfra() {
  const data = await loadJSON('data/infra.json');

  if (!data || !Array.isArray(data.nodes) || !data.nodes.length) {
    $('card-infra').remove();
    return;
  }

  const up = data.nodes.filter((n) => n.up).length;
  $('infra-summary').textContent = `${up}/${data.nodes.length} ${T.infra_online}`;

  $('infra-nodes').innerHTML = data.nodes
    .map(
      (n) => `<li class="node ${n.up ? 'node--up' : 'node--down'}">
        <i class="node-led"></i>
        <span class="node-name">${escapeHTML(n.name)}</span>
        <span class="node-role">${escapeHTML(n.role || '')}</span>
        <span class="node-ping">${n.up ? `${n.ms} ms` : T.infra_down}</span>
      </li>`
    )
    .join('');

  $('infra-checked').textContent = `${T.infra_checked} ${ago(data.checked_at)}`;
}

/* ============================== музыка ============================== */

async function initMusic() {
  const data = await loadJSON('data/music.json');
  if (!data || !data.now) return;

  $('card-music').hidden = false;
  $('track-name').textContent = data.now.name;
  $('track-artist').textContent = data.now.artist;
  if (data.now.art) $('track-art').style.backgroundImage = `url("${data.now.art}")`;
  $('music-source').textContent = data.now.playing ? T.music_now : T.music_last;

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

/* =========================== связь и кольцо =========================== */

function initLinks() {
  // Пункты без значения ещё не заполнены — на странице их быть не должно.
  const filled = (CONFIG.contacts || []).filter((c) => L(c.value).trim());
  const groups = [...new Set(filled.map((c) => c.group))];
  const groupTitle = { message: T.contacts_message, find: T.contacts_find };

  $('links').innerHTML = groups
    .map((g) => {
      const rows = filled
        .filter((c) => c.group === g)
        .map((c) => {
          const value = L(c.value);
          const inner = `
            <span class="link-label">${escapeHTML(L(c.label))}</span>
            <span class="link-value">${escapeHTML(value)}</span>
            ${c.note ? `<span class="link-note">${escapeHTML(L(c.note))}</span>` : ''}`;

          // Есть ссылка — ведём наружу. Нет — отдаём в буфер обмена.
          return c.href
            ? `<li><a class="link-row" href="${c.href}" target="_blank" rel="noopener me">${inner}
                 <span class="link-act">↗</span></a></li>`
            : `<li><button class="link-row" type="button" data-copy="${escapeHTML(value)}">${inner}
                 <span class="link-act">${T.copy}</span></button></li>`;
        })
        .join('');
      return `<li class="link-group"><span class="link-group-title">${escapeHTML(groupTitle[g] || g)}</span>
                <ul class="link-list">${rows}</ul></li>`;
    })
    .join('');

  initCopy();

  // Кольцо сайтов: пока в конфиге пусто, в подвале ничего нет.
  const ring = CONFIG.webring || [];
  if (ring.length < 2) {
    $('webring').remove();
  } else {
    $('webring').innerHTML =
      '<span>←</span>' +
      `<a href="${ring[0].href}" rel="noopener">${escapeHTML(ring[0].label)}</a>` +
      `<span class="ring-self">${escapeHTML(CONFIG.nick)}</span>` +
      `<a href="${ring[1].href}" rel="noopener">${escapeHTML(ring[1].label)}</a>` +
      '<span>→</span>';
  }

  $('year').textContent = new Date().getFullYear();
  $('hero-sub').textContent = L(CONFIG.tagline);

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
        act.textContent = T.copied;
      } catch {
        act.textContent = T.copy_failed;
      }
      setTimeout(() => { act.textContent = T.copy; }, 1600);
    });
  });
}

/* ============================== запуск ============================== */

initLangSwitch();
applyStatic();
initTheme();
initRotator();
initClock();
initCityPicker();
initSun();
renderPinned();
renderDoing();
renderStack();
renderPlayer();
renderButtons();
initLinks();

$('city-name').textContent = cityChosen ? city.name : T.city_detecting;
$('wx-who').textContent = cityChosen ? T.who_manual : '';
$('wx-desc').textContent = T.weather_loading;
loadWeather(city);
onCityChange(loadWeather);

// Если посетитель ещё ничего не выбирал, подставляем его город сами.
if (!cityChosen) {
  detectCityByTimezone().then((found) => {
    if (found && !readSavedCity()) {
      setCity(found, false, 'auto');
    } else {
      $('city-name').textContent = city.name;
      $('wx-who').textContent = T.who_default;
    }
  });
}

initSats();
initGitHub();
initInfra();
initMusic();

loadJSON('data/meta.json').then((m) => {
  $('build-stamp').textContent = m?.built_at ? `${T.data_from}: ${ago(m.built_at)}` : T.data_static;
});
