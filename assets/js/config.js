// Всё, что меняется руками, живёт здесь.
//
// Любой текст можно писать двумя способами:
//   'одинаково для обоих языков'
//   { ru: 'по-русски', en: 'in english' }

export const CONFIG = {
  nick: 'villcreat',
  tagline: { ru: 'self-hosted всё подряд', en: 'self-hosting everything' },

  // Чем занят прямо сейчас. Крутится в шапке. Слова английские в обоих языках.
  doing: ['building', 'self-hosting', 'breaking', 'fixing'],

  // Часы. Город не называем: только страна и смещение.
  place: {
    label: 'Vill-Land',
    tz: 'Europe/Moscow',
    tzLabel: 'UTC+3',
  },

  // Город по умолчанию для погоды, солнца и спутников.
  // Посетитель может выбрать любой другой, выбор сохранится у него в браузере.
  defaultCity: {
    name: 'Москва',
    country: 'RU',
    lat: 55.7558,
    lon: 37.6173,
  },

  // ЧЕМ ЗАНЯТ СЕЙЧАС. Правится руками, когда меняются дела.
  // Не забывай менять updated: под строками видно, насколько они свежие.
  // Строка это либо текст, либо объект: strike зачёркивает, note дописывает
  // в скобках, чем дело кончилось.
  now: {
    updated: '2026-09-05',
    lines: [
      {
        ru: 'пытаюсь делать сайт потому что могу себе позволить',
        en: 'making a website because i can afford to',
      },
      {
        ru: 'пытаюсь делать свою почту облако впн и прочую херь',
        en: 'running my own mail, cloud, vpn and other nonsense',
      },
      {
        text: { ru: 'делаю приложение для андроида', en: 'building an android app' },
        strike: true,
        note: { ru: 'надоело + не получилось', en: 'got bored + it did not work' },
      },
      {
        ru: 'делаю жалкие попытки в написании музыки',
        en: 'making pathetic attempts at writing music',
      },
    ],
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
  //   description: { ru: 'Что это и зачем.', en: 'What it is and why.' },
  //   href: 'https://пример.ру',   // необязательно
  //   tag: 'Go · Docker',          // необязательно
  //   status: 'wip',
  // },
  pinned: [],

  // СТЕК. level: 3 основное, 2 уверенно, 1 по необходимости.
  // since — год, с которого работаешь с этим. Стаж считается сам,
  // чтобы через год цифры не устарели.
  stack: [
    { name: 'Python',         level: 3, since: 2021 },
    { name: 'Flutter / Dart', level: 3, since: 2024 },
    { name: 'Bash',           level: 2, since: 2022 },
    { name: 'Docker',         level: 2, since: 2023 },
    { name: 'C++',            level: 2, since: 2024 },
    { name: 'Go',             level: 1, since: 2025 },
  ],

  // СВЯЗЬ.
  // group  — 'message' написать или 'find' найти
  // value  — что видно на странице. Пустое значение прячет пункт целиком
  // href   — куда ведёт клик. Без href пункт копируется в буфер
  // note   — приписка справа
  contacts: [
    {
      group: 'message', label: 'Telegram', value: '@villcreatgd',
      href: 'https://t.me/villcreatgd', note: { ru: 'основной', en: 'main' },
    },
    {
      group: 'message', label: 'Telegram', value: '@NVSK2005',
      href: 'https://t.me/NVSK2005', note: { ru: 'второй', en: 'second' },
    },
    { group: 'message', label: 'Discord', value: 'villcreat' },
    {
      group: 'message', label: { ru: 'Почта', en: 'Mail' }, value: 'ttyuki97@gmail.com',
      href: 'mailto:ttyuki97@gmail.com',
    },

    { group: 'find', label: 'GitHub', value: '@villcreat', href: 'https://github.com/villcreat' },
    {
      group: 'find', label: 'Steam', value: 'rtx3090user',
      href: 'https://steamcommunity.com/id/rtx3090user', note: { ru: 'основной', en: 'main' },
    },
    {
      group: 'find', label: 'Steam', value: 'villcreat',
      href: 'https://steamcommunity.com/id/villcreat', note: { ru: 'второй', en: 'second' },
    },
    {
      group: 'find', label: 'Spotify', value: { ru: 'профиль', en: 'profile' },
      href: 'https://open.spotify.com/user/31uxknpuqbe2cao3wh724xnzypdu',
    },
  ],

  // Кольцо личных сайтов, классика IndieWeb: слева и справа соседи.
  // Пока в списке меньше двух сайтов, в подвале ничего не показывается.
  webring: [
    // { label: 'сосед', href: 'https://пример.ру' },
  ],

  // ФОНОВАЯ МУЗЫКА.
  //
  // Свой проигрыватель на своих файлах: положи их в assets/audio или
  // отдай со своего сервера, тогда играет целиком и без чужих кадров.
  // Путь может быть относительным или полным, например
  // 'https://твой-сервер/audio/mix.mp3'.
  //
  // Если tracks пуст, но заполнен link, встраивается чужой проигрыватель:
  // YouTube и SoundCloud играют целиком, Spotify отдаёт гостям отрывки.
  //
  // Пустое и то и другое — блока на странице нет.
  player: {
    title: { ru: 'фоном', en: 'background noise' },
    tracks: [
      // { title: 'breakcore mix', artist: 'villcreat', src: 'assets/audio/mix.mp3' },
    ],
    link: '',
  },

  // Адрес сайта. Нужен для кода кнопки, который копируют другие.
  siteUrl: 'https://trishetka1337.github.io',

  // СТЕНА. Пока поля пустые, страница честно говорит, что не настроена.
  //
  // url и anonKey берутся в Supabase: Project Settings -> API.
  // Ключ публичный, его видит каждый гость, и это нормально:
  // доступ ограничивают правила из scripts/wall.sql, а не секретность ключа.
  //
  // ownerId — твой идентификатор после первого входа, нужен только чтобы
  // показывать кнопку удаления чужих записей.
  wall: {
    url: 'https://uhizglzwybclvakvqzjq.supabase.co',
    anonKey: 'sb_publishable_UsPmyaDbvVmDWLux2lGWCw_Mxswc9_3',
    ownerId: '',
  },

  // Кнопки 88x31 чужих сайтов. Своя кнопка лежит в assets/img/button.png.
  // src можно указывать чужой, но лучше сохранить картинку к себе
  // в assets/img: чужие ссылки со временем отваливаются.
  buttons: [
    // { alt: 'keetsta', href: 'https://keetsta.me', src: 'assets/img/keetsta.gif' },
  ],

  // Блинки: мелкие мигающие таблички из веба нулевых, 150x20.
  // Сделаны на blinkies.cafe и лежат у нас: хотлинкать чужой сервер нельзя,
  // да и ссылки со временем отваливаются. Новые добавляются туда же.
  blinkies: [
    { file: 'self-hosted.gif', alt: 'self-hosted' },
    { file: 'dont-sell-your-data.gif', alt: 'dont sell your data' },
    { file: 'made-for-ppl.gif', alt: 'made for ppl by ppl' },
    { file: 'vpn-or-die.gif', alt: 'vpn or die' },
    { file: 'made-by-hand.gif', alt: 'made by hand' },
  ],

  memberSince: 'JUN 2025',
};
