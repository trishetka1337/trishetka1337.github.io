// Всё, что меняется руками, живёт здесь.
export const CONFIG = {
  nick: 'villcreat',
  tagline: 'self-hosted всё подряд',
  // Чем занят прямо сейчас. Крутится в шапке.
  doing: ['building', 'self-hosting', 'breaking', 'fixing'],

  // Точка на карте. Погода и солнце считаются отсюда.
  place: {
    city: 'Moscow',
    country: 'RU',
    lat: 55.7558,
    lon: 37.6173,
    tz: 'Europe/Moscow',
    tzLabel: 'UTC+3 · MSK',
  },

  github: 'villcreat',

  // Сколько последних репозиториев показывать.
  recentCount: 3,

  // ГЛАВНОЕ. Ручной список, сюда идёт то, чем не стыдно хвастаться.
  // Пока пуст — блок на странице не показывается.
  //
  // Проект может быть вообще без гитхаба: просто не ставь href.
  // status: 'live' — работает, 'wip' — в работе, 'paused' — заморожен.
  //
  // Образец, снять комментарий и переписать под себя:
  // {
  //   name: 'Название',
  //   description: 'Одна-две строки о том, что это и зачем.',
  //   href: 'https://пример.ру',   // необязательно
  //   tag: 'Go · Docker',          // необязательно
  //   status: 'wip',
  // },
  pinned: [],

  // СВЯЗЬ.
  // group  — заголовок раздела, пункты с одинаковым group идут вместе
  // value  — что видно на странице. Пустое значение прячет пункт целиком
  // href   — куда ведёт клик. Без href пункт копируется в буфер
  // note   — приписка справа: основной, второй, рабочий
  contacts: [
    { group: 'написать', label: 'Telegram', value: '@villcreatgd', href: 'https://t.me/villcreatgd', note: 'основной' },
    { group: 'написать', label: 'Telegram', value: '@NVSK2005', href: 'https://t.me/NVSK2005', note: 'второй' },
    { group: 'написать', label: 'Discord', value: 'villcreat' },
    { group: 'написать', label: 'Почта', value: 'ttyuki97@gmail.com', href: 'mailto:ttyuki97@gmail.com' },

    { group: 'найти', label: 'GitHub', value: '@villcreat', href: 'https://github.com/villcreat' },
    { group: 'найти', label: 'Steam', value: 'rtx3090user', href: 'https://steamcommunity.com/id/rtx3090user', note: 'основной' },
    { group: 'найти', label: 'Steam', value: 'villcreat', href: 'https://steamcommunity.com/id/villcreat', note: 'второй' },
    { group: 'найти', label: 'Spotify', value: 'профиль', href: 'https://open.spotify.com/user/31uxknpuqbe2cao3wh724xnzypdu' },
  ],

  // Кольцо личных сайтов. Классика IndieWeb.
  webring: [
    { label: 'keetsta', href: 'https://keetsta.me' },
    { label: 'nichind', href: 'https://nichind.dev' },
  ],

  // Навыки для чека. Порядок = порядок строк.
  stack: ['Flutter / Dart', 'Python', 'Go', 'Linux / VPS', 'Docker', 'Bash', 'C++'],

  memberSince: 'JUN 2025',
};
