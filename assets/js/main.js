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

function escapeHTML(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  );
}

/* ======================== выбранный город ========================= */
// Один источник правды для погоды, солнца и спутников.

let city = readSavedCity() || { ...CONFIG.defaultCity };
const cityChosen = Boolean(readSavedCity()); // выбирал ли посетитель город руками
const cityListeners = [];

function readSavedCity() {
  try {
    const saved = JSON.parse(localStorage.getItem('city') || 'null');
    if (saved && Number.isFinite(saved.lat) && Number.isFinite(saved.lon)) return saved;
  } catch { /* испорченная запись, игнорируем */ }
  return null;
}

// Откуда взялся город. Влияет только на подпись под погодой.
let cityMode = cityChosen ? 'manual' : 'default';

const WHO = {
  manual:  'это погода в городе, который выбрали вы',
  geo:     'это погода по вашему местоположению',
  auto:    'это погода у вас: город определён по часовому поясу браузера',
  default: 'город по умолчанию, нажмите на него и выберите свой',
};

/**
 * @param {boolean} persist ручной выбор запоминаем, автоопределение нет:
 *   иначе город прилипнет навсегда, даже если человек переедет.
 */
function setCity(next, persist = true, mode = persist ? 'manual' : 'auto') {
  city = next;
  cityMode = mode;
  if (persist) {
    try {
      localStorage.setItem('city', JSON.stringify(next));
    } catch { /* приватный режим, переживём */ }
  }
  $('city-name').textContent = next.name;
  $('wx-who').textContent = WHO[mode];
  cityListeners.forEach((fn) => fn(next));
}

const onCityChange = (fn) => cityListeners.push(fn);

/**
 * Ищем город в геокодере Open-Meteo и берём тот, чей часовой пояс совпадает
 * с искомым. Без этой проверки поиск подсовывает однофамильцев: по запросу
 * New York находится деревня Йорк в Небраске.
 */
async function geocodeInZone(query, tz, lang) {
  const url = `https://geocoding-api.open-meteo.com/v1/search?count=10&language=${lang}` +
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
 *
 * Русский поиск закрывает большинство поясов, английский добирает те,
 * где русского названия в базе нет. Если ничего не совпало по поясу,
 * возвращаем null: пусть лучше останется город по умолчанию, чем чужая деревня.
 */
async function detectCityByTimezone() {
  let tz = '';
  try {
    tz = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
  } catch { /* совсем старый браузер */ }

  if (!tz.includes('/')) return null;
  const guess = tz.split('/').pop().replace(/_/g, ' ');

  return (await geocodeInZone(guess, tz, 'ru')) || geocodeInZone(guess, tz, 'en');
}

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

function initClock() {
  // Крупные часы — время гостя: с них он и начинает смотреть страницу.
  const guestTz = Intl.DateTimeFormat().resolvedOptions().timeZone || CONFIG.place.tz;
  const authorTz = CONFIG.place.tz;

  const guestTime = new Intl.DateTimeFormat('ru-RU', {
    timeZone: guestTz, hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  });
  const guestDate = new Intl.DateTimeFormat('ru-RU', {
    timeZone: guestTz, weekday: 'long', day: 'numeric', month: 'long',
  });
  const authorTime = new Intl.DateTimeFormat('ru-RU', {
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
  $('topclock').title = `время автора, ${CONFIG.place.tzLabel}`;
}

/** Насколько часы гостя убежали вперёд относительно моих. */
function diffText(min) {
  if (min === 0) return 'совпадает';
  const ahead = min > 0;
  const abs = Math.abs(min);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  const parts = [];
  if (h) parts.push(`${h} ${plural(h, 'час', 'часа', 'часов')}`);
  if (m) parts.push(`${m} мин`);
  return `${ahead ? '+' : '−'}${parts.join(' ')}`;
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

function windDir(deg) {
  const dirs = ['С', 'СВ', 'В', 'ЮВ', 'Ю', 'ЮЗ', 'З', 'СЗ'];
  return dirs[Math.round(deg / 45) % 8];
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
    $('wx-desc').textContent = WMO[c.weather_code] ?? 'погода';
    $('wx-feels').textContent = `${Math.round(c.apparent_temperature)}°`;
    $('wx-wind').textContent = `${c.wind_speed_10m.toFixed(1)} м/с ${windDir(c.wind_direction_10m)}`;
    $('wx-hum').textContent = `${c.relative_humidity_2m}%`;
  } catch {
    $('wx-desc').textContent = 'недоступна';
  }
}

/** Местное время выбранного города, рядом с его погодой. */
let localClockTimer = null;
function startLocalClock() {
  clearInterval(localClockTimer);
  if (!cityTz) return;
  const fmt = new Intl.DateTimeFormat('ru-RU', {
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

  // Точное место — только по явному клику и только в браузере посетителя.
  const geo = $('city-geo');
  if (!navigator.geolocation) {
    geo.remove();
  } else {
    geo.addEventListener('click', () => {
      geo.textContent = 'определяю…';
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          // Округляем до километра: точные координаты человека уходить наружу не должны.
          setCity({
            name: 'моё место',
            country: '',
            lat: Math.round(pos.coords.latitude * 100) / 100,
            lon: Math.round(pos.coords.longitude * 100) / 100,
          }, true, 'geo');
          geo.textContent = 'определить точно';
          close();
        },
        () => { geo.textContent = 'не вышло, выбери вручную'; },
        { timeout: 10000, maximumAge: 600000 }
      );
    });
  }

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

  async function search(q) {
    const url = 'https://geocoding-api.open-meteo.com/v1/search?count=6&language=ru&format=json' +
      `&name=${encodeURIComponent(q)}`;
    let found = [];
    try {
      const r = await fetch(url);
      found = (await r.json()).results || [];
    } catch { /* сеть подвела, покажем пустой список */ }

    if (!found.length) {
      results.innerHTML = '<li class="city-empty">ничего не нашлось</li>';
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
    const hm = new Intl.DateTimeFormat('ru-RU', {
      ...(cityTz ? { timeZone: cityTz } : {}),
      hour: '2-digit', minute: '2-digit', hour12: false,
    });
    const { lat, lon } = city;
    const now = new Date();
    const alt = sunAltitude(now, lat, lon);
    const { rise, set } = sunTimes(now, lat, lon);

    $('sun-altitude').textContent = alt.toFixed(1);
    $('sun-phase').textContent = alt > 0 ? 'день' : alt > -6 ? 'сумерки' : 'ночь';
    $('sun-altitude').title = `пик сегодня: ${noonAltitude(now, lat, lon).toFixed(1)}°`;

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
    if (m === null) return 'не в ближайшие 8 часов';
    if (m < 60) return `через ${m} ${plural(m, 'минуту', 'минуты', 'минут')}`;
    const h = Math.floor(m / 60);
    return `через ${h} ${plural(h, 'час', 'часа', 'часов')} ${m % 60} мин`;
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
        elevation: look.elevation / rad,       // высота над горизонтом, градусы
        azimuth: look.azimuth / rad,           // азимут, градусы от севера
        range: look.rangeSat,                  // расстояние до наблюдателя, км
        height: geo.height,                    // высота орбиты, км
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

    // Падежи городов не склоняем: город выносим отдельной строкой под списком.
    $('sats-summary').textContent = `видно ${visible.length} из ${rows.length}`;

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
      $('sky-dots').innerHTML =
        '<text class="sky-empty" x="0" y="4">сейчас никого</text>';
    }

    // Длинный список утомляет: показываем видимых и ближайших, остальных под кнопкой.
    const shown = expanded ? rows : rows.slice(0, Math.max(visible.length + 4, 6));

    $('sats').innerHTML = shown
      .map((r) => {
        const up = r.elevation > 0;
        const when = up
          ? `${r.elevation.toFixed(0)}° над горизонтом`
          : passIn(passes.get(r.name) ?? null);
        return `<li class="sat ${up ? 'sat--up' : ''}">
          <span class="sat-name">${escapeHTML(r.name)}</span>
          <span class="sat-el">${when}</span>
          <span class="sat-group">${escapeHTML(r.group)}</span>
          <span class="sat-num">${Math.round(r.height)} км · ${Math.round(r.speed).toLocaleString('ru-RU')} км/ч</span>
        </li>`;
      })
      .join('');

    const rest = rows.length - shown.length;
    const more = $('sats-more');
    more.hidden = rest <= 0 && !expanded;
    more.textContent = expanded
      ? 'свернуть'
      : `показать ещё ${rest} ${plural(rest, 'спутник', 'спутника', 'спутников')}`;

    $('sats-note').textContent =
      `точка наблюдения: ${city.name} · орбиты обновлены ${ago(data.updated_at)}`;
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
    $('card-projects').remove();
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
    $('card-pinned').remove();
    return;
  }

  $('pinned-count').textContent =
    `${items.length} ${plural(items.length, 'проект', 'проекта', 'проектов')}`;

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
      const bars = [1, 2, 3]
        .map((i) => `<i class="${i <= lvl ? 'on' : ''}"></i>`)
        .join('');

      // Первый год работы с языком считается за год, а не за ноль.
      const years = s.since ? Math.max(1, thisYear - s.since) : null;
      const stage = years ? `${years} ${plural(years, 'год', 'года', 'лет')}` : '';

      return `<li class="skill">
        <span class="skill-name">${escapeHTML(s.name)}</span>
        <span class="skill-years">${stage}</span>
        <span class="skill-bars" aria-label="уровень ${lvl} из 3">${bars}</span>
      </li>`;
    })
    .join('');
}

/* ========================== инфраструктура ========================== */

async function initInfra() {
  const data = await loadJSON('data/infra.json');
  const box = $('infra-nodes');

  if (!data || !Array.isArray(data.nodes) || !data.nodes.length) {
    $('card-infra').remove();
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

  $('card-music').hidden = false;
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

/* =========================== связь и кольцо =========================== */

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

/* ============================== запуск ============================== */

initTheme();
initRotator();
initClock();
initCityPicker();
initSun();
renderPinned();
renderStack();
initLinks();

$('city-name').textContent = cityChosen ? city.name : 'определяю…';
$('wx-who').textContent = cityChosen ? WHO.manual : '';
loadWeather(city);
onCityChange(loadWeather);

// Если посетитель ещё ничего не выбирал, подставляем его город сами.
if (!cityChosen) {
  detectCityByTimezone().then((found) => {
    if (found && !readSavedCity()) {
      setCity(found, false, 'auto');
    } else {
      $('city-name').textContent = city.name;
      $('wx-who').textContent = WHO.default;
    }
  });
}

initSats();
initGitHub();
initInfra();
initMusic();

loadJSON('data/meta.json').then((m) => {
  $('build-stamp').textContent = m?.built_at ? `данные: ${ago(m.built_at)}` : 'статика';
});
