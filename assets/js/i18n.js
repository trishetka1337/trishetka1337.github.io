// Строки интерфейса. Всё, что видит гость, живёт здесь.
// Тексты из config.js могут быть либо строкой (одинаково для обоих языков),
// либо объектом { ru, en }.

export const LANGS = ['ru', 'en'];

export const STRINGS = {
  ru: {
    locale: 'ru-RU',

    nav_blog: 'блог',
    nav_home: 'главная',
    is_currently: 'is currently',

    now_title: 'сейчас у вас',
    now_zone: 'ваша зона',
    now_mine: 'у меня',
    now_diff: 'разница',
    diff_same: 'совпадает',

    weather: 'погода',
    weather_loading: 'грузится',
    weather_failed: 'недоступна',
    feels: 'ощущается',
    wind: 'ветер',
    humidity: 'влажность',
    local_time: 'там сейчас',
    wind_units: 'м/с',
    city_search: 'город: Токио, Лима, Мурманск…',
    city_search_label: 'Поиск города',
    city_detect: 'определить точно',
    city_detecting: 'определяю…',
    city_detect_failed: 'не вышло, выберите вручную',
    city_empty: 'ничего не нашлось',

    who_manual: 'это погода в городе, который выбрали вы',
    who_geo: 'это погода по вашему местоположению',
    who_auto: 'это погода у вас: город определён по часовому поясу браузера',
    who_default: 'город по умолчанию, нажмите на него и выберите свой',

    sun: 'солнце',
    sun_above: '° над горизонтом',
    sunrise: 'восход',
    sunset: 'закат',
    daylight: 'светло',
    phase_day: 'день',
    phase_twilight: 'сумерки',
    phase_night: 'ночь',
    polar_day: 'полярный день',
    polar_night: 'полярная ночь',
    sun_peak: 'пик сегодня',

    doing: 'чем занят',
    updated: 'обновлено',
    today: 'сегодня',
    yesterday: 'вчера',

    github: 'github',
    gh_contrib: 'контрибуций/год',
    gh_streak: 'дней подряд',
    gh_repos: 'репозиториев',
    gh_followers: 'подписчиков',
    gh_unavailable: 'github недоступен',

    stack: 'стек',
    featured: 'главное',
    status_live: 'работает',
    status_wip: 'в работе',
    status_paused: 'заморожен',

    projects_recent: 'последние',
    projects_all: 'все репозитории',
    no_description: 'без описания',

    infra: 'инфраструктура',
    infra_online: 'онлайн',
    infra_checked: 'проверено',
    infra_down: 'нет ответа',

    music: 'играет',
    music_now: 'играет сейчас',
    music_last: 'последний трек',

    sats: 'над головой',
    sats_visible: 'видно',
    sats_of: 'из',
    sats_empty: 'сейчас никого',
    sats_below: 'за горизонтом',
    sats_above: '° над горизонтом',
    sats_in: 'через',
    sats_never: 'не в ближайшие 8 часов',
    sats_observer: 'точка наблюдения',
    sats_orbits: 'орбиты обновлены',
    sats_more: 'показать ещё',
    sats_less: 'свернуть',

    contacts_message: 'написать',
    contacts_find: 'найти',
    copy: 'копировать',
    copied: 'скопировано',
    copy_failed: 'не вышло',

    data_static: 'статика',
    data_from: 'данные',
    ago: 'назад',
    just_now: 'только что',

    units: {
      minute: ['минуту', 'минуты', 'минут'],
      hour: ['час', 'часа', 'часов'],
      day: ['день', 'дня', 'дней'],
      month: ['месяц', 'месяца', 'месяцев'],
      year: ['год', 'года', 'лет'],
      repo: ['репозиторий', 'репозитория', 'репозиториев'],
      project: ['проект', 'проекта', 'проектов'],
      sat: ['спутник', 'спутника', 'спутников'],
      contribution: ['контрибуция', 'контрибуции', 'контрибуций'],
    },

    wmo: {
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
    },

    compass: ['С', 'СВ', 'В', 'ЮВ', 'Ю', 'ЮЗ', 'З', 'СЗ'],
    sky_compass: { n: 'С', e: 'В', s: 'Ю', w: 'З' },
  },

  en: {
    locale: 'en-GB',

    nav_blog: 'blog',
    nav_home: 'home',
    is_currently: 'is currently',

    now_title: 'your time',
    now_zone: 'your zone',
    now_mine: 'mine',
    now_diff: 'difference',
    diff_same: 'same as mine',

    weather: 'weather',
    weather_loading: 'loading',
    weather_failed: 'unavailable',
    feels: 'feels like',
    wind: 'wind',
    humidity: 'humidity',
    local_time: 'time there',
    wind_units: 'm/s',
    city_search: 'city: Tokyo, Lima, Murmansk…',
    city_search_label: 'City search',
    city_detect: 'detect precisely',
    city_detecting: 'detecting…',
    city_detect_failed: 'failed, pick manually',
    city_empty: 'nothing found',

    who_manual: 'this is the weather in the city you picked',
    who_geo: 'this is the weather at your location',
    who_auto: 'this is your weather: city guessed from your time zone',
    who_default: 'default city, click it and pick your own',

    sun: 'sun',
    sun_above: '° above horizon',
    sunrise: 'sunrise',
    sunset: 'sunset',
    daylight: 'daylight',
    phase_day: 'day',
    phase_twilight: 'twilight',
    phase_night: 'night',
    polar_day: 'polar day',
    polar_night: 'polar night',
    sun_peak: 'peak today',

    doing: 'what i am up to',
    updated: 'updated',
    today: 'today',
    yesterday: 'yesterday',

    github: 'github',
    gh_contrib: 'contributions/yr',
    gh_streak: 'day streak',
    gh_repos: 'repositories',
    gh_followers: 'followers',
    gh_unavailable: 'github unavailable',

    stack: 'stack',
    featured: 'featured',
    status_live: 'live',
    status_wip: 'in progress',
    status_paused: 'paused',

    projects_recent: 'latest',
    projects_all: 'all repositories',
    no_description: 'no description',

    infra: 'infrastructure',
    infra_online: 'online',
    infra_checked: 'checked',
    infra_down: 'no answer',

    music: 'playing',
    music_now: 'playing now',
    music_last: 'last track',

    sats: 'overhead',
    sats_visible: 'visible',
    sats_of: 'of',
    sats_empty: 'nobody up there',
    sats_below: 'below horizon',
    sats_above: '° above horizon',
    sats_in: 'in',
    sats_never: 'not in the next 8 hours',
    sats_observer: 'observer',
    sats_orbits: 'orbits updated',
    sats_more: 'show',
    sats_less: 'collapse',

    contacts_message: 'message',
    contacts_find: 'find',
    copy: 'copy',
    copied: 'copied',
    copy_failed: 'failed',

    data_static: 'static',
    data_from: 'data',
    ago: 'ago',
    just_now: 'just now',

    units: {
      minute: ['minute', 'minutes', 'minutes'],
      hour: ['hour', 'hours', 'hours'],
      day: ['day', 'days', 'days'],
      month: ['month', 'months', 'months'],
      year: ['year', 'years', 'years'],
      repo: ['repository', 'repositories', 'repositories'],
      project: ['project', 'projects', 'projects'],
      sat: ['satellite', 'satellites', 'satellites'],
      contribution: ['contribution', 'contributions', 'contributions'],
    },

    wmo: {
      0: 'clear', 1: 'mostly clear', 2: 'partly cloudy', 3: 'overcast',
      45: 'fog', 48: 'rime fog',
      51: 'drizzle', 53: 'drizzle', 55: 'heavy drizzle',
      56: 'freezing drizzle', 57: 'freezing drizzle',
      61: 'light rain', 63: 'rain', 65: 'heavy rain',
      66: 'freezing rain', 67: 'freezing rain',
      71: 'light snow', 73: 'snow', 75: 'heavy snow', 77: 'snow grains',
      80: 'showers', 81: 'showers', 82: 'heavy showers',
      85: 'snow showers', 86: 'heavy snow showers',
      95: 'thunderstorm', 96: 'thunderstorm with hail', 99: 'thunderstorm with hail',
    },

    compass: ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'],
    sky_compass: { n: 'N', e: 'E', s: 'S', w: 'W' },
  },
};

/** Язык гостя: сохранённый выбор, иначе по языку браузера. */
export function detectLang() {
  try {
    const saved = localStorage.getItem('lang');
    if (LANGS.includes(saved)) return saved;
  } catch { /* приватный режим */ }

  const nav = (navigator.language || 'en').slice(0, 2).toLowerCase();
  return nav === 'ru' ? 'ru' : 'en';
}

/** Значение из конфига: строка или { ru, en }. */
export function pick(value, lang) {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value[lang] ?? value.ru ?? value.en ?? '';
  }
  return value ?? '';
}

/**
 * Форма слова по числу. В русском три формы, в английском две,
 * поэтому таблица одна, а правило выбора разное.
 */
export function pluralize(n, forms, lang) {
  if (lang === 'ru') {
    const m10 = n % 10;
    const m100 = n % 100;
    if (m10 === 1 && m100 !== 11) return forms[0];
    if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return forms[1];
    return forms[2];
  }
  return n === 1 ? forms[0] : forms[1];
}
