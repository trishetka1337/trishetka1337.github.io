// Стена: гостевые записи через Supabase.
//
// Ключ в config.js публичный, его видит каждый гость. Это нормально:
// что можно читать и писать, решают правила из scripts/wall.sql, а не
// секретность ключа.

import { CONFIG } from './config.js';
import { LANGS, detectLang } from './i18n.js';

const $ = (id) => document.getElementById(id);
const lang = detectLang();
document.documentElement.lang = lang;

const S = {
  ru: {
    title: 'стена',
    sub: 'пишите что угодно: привет, ссылку на свой сайт, ругательство',
    home: 'главная', blog: 'блог',
    auth_text: 'чтобы написать, войдите. храню только ник и аватарку',
    logout: 'выйти',
    placeholder: 'что нового?',
    send: 'написать',
    sending: 'отправляю…',
    empty: 'Пока никто ничего не написал. Будьте первым.',
    setup: 'Стена ещё не подключена. Ключи Supabase вписываются в config.js, ' +
           'таблица создаётся скриптом scripts/wall.sql.',
    err_generic: 'не отправилось, попробуйте ещё раз',
    err_fast: 'не так быстро: одно сообщение в минуту',
    err_empty: 'сначала напишите что-нибудь',
    err_load: 'не удалось загрузить записи',
    delete: 'удалить',
    confirm_delete: 'Удалить запись?',
    locale: 'ru-RU',
  },
  en: {
    title: 'wall',
    sub: 'write whatever: hello, a link to your site, an insult',
    home: 'home', blog: 'blog',
    auth_text: 'sign in to write. only your nickname and avatar are stored',
    logout: 'sign out',
    placeholder: 'what is new?',
    send: 'post',
    sending: 'sending…',
    empty: 'Nobody has written anything yet. Be the first.',
    setup: 'The wall is not connected yet. Supabase keys go into config.js, ' +
           'the table is created by scripts/wall.sql.',
    err_generic: 'did not go through, try again',
    err_fast: 'not so fast: one message per minute',
    err_empty: 'write something first',
    err_load: 'could not load the posts',
    delete: 'delete',
    confirm_delete: 'Delete this post?',
    locale: 'en-GB',
  },
}[lang];

/* ---------------------------- оформление ---------------------------- */

function initChrome() {
  $('wall-title').textContent = S.title;
  $('wall-sub').textContent = S.sub;
  $('nav-home').textContent = S.home;
  $('nav-blog').textContent = S.blog;
  $('nav-blog').href = lang === 'en' ? 'blog.en.html' : 'blog.html';
  $('wall-auth-text').textContent = S.auth_text;
  $('wall-input').placeholder = S.placeholder;
  $('wall-send').textContent = S.send;
  $('logout').textContent = S.logout;
  $('wall-empty').textContent = S.empty;

  $('langs').innerHTML = LANGS
    .map((code) => `<button class="lang ${code === lang ? 'lang--on' : ''}" type="button"
      data-lang="${code}">${code}</button>`)
    .join('');
  $('langs').querySelectorAll('[data-lang]').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (btn.dataset.lang === lang) return;
      try { localStorage.setItem('lang', btn.dataset.lang); } catch { /* ok */ }
      location.reload();
    });
  });

  const btn = $('theme-toggle');
  const label = $('theme-label');
  let theme = localStorage.getItem('theme') ||
    (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
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

const escapeHTML = (s) => String(s ?? '').replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function when(iso) {
  const d = new Date(iso);
  const min = Math.round((Date.now() - d.getTime()) / 60000);
  if (min < 1) return lang === 'ru' ? 'только что' : 'just now';
  if (min < 60) return lang === 'ru' ? `${min} мин назад` : `${min} min ago`;
  return new Intl.DateTimeFormat(S.locale, {
    day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit',
  }).format(d);
}

/* ------------------------------ запуск ------------------------------ */

initChrome();

const cfg = CONFIG.wall || {};
if (!cfg.url || !cfg.anonKey) {
  // Ключей нет: показываем, что делать, вместо молчаливой пустоты.
  $('wall-setup').hidden = false;
  $('wall-setup').textContent = S.setup;
} else {
  start();
}

async function start() {
  const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm');
  const db = createClient(cfg.url, cfg.anonKey);

  let me = null;

  const login = (provider) => db.auth.signInWithOAuth({
    provider,
    options: { redirectTo: location.href.split('#')[0] },
  });

  $('login-discord').addEventListener('click', () => login('discord'));
  $('login-github').addEventListener('click', () => login('github'));
  $('logout').addEventListener('click', async () => {
    await db.auth.signOut();
    location.reload();
  });

  const { data: { session } } = await db.auth.getSession();
  setUser(session?.user || null);

  db.auth.onAuthStateChange((_e, s) => setUser(s?.user || null));

  function setUser(user) {
    me = user;
    $('wall-auth').hidden = Boolean(user);
    $('wall-form').hidden = !user;
    if (!user) return;

    const m = user.user_metadata || {};
    $('me-name').textContent = m.user_name || m.full_name || m.name || 'аноним';
    $('me-avatar').src = m.avatar_url || m.picture || '';
    // Идентификатор пригодится, чтобы вписать себя владельцем в config.
    console.info('ваш id для config.wall.ownerId:', user.id);
  }

  /* ----------------------------- записи ----------------------------- */

  async function load() {
    const { data, error } = await db
      .from('wall')
      .select('id, created_at, user_id, name, avatar, provider, body')
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) {
      $('wall-empty').hidden = false;
      $('wall-empty').textContent = S.err_load;
      return;
    }

    $('wall-empty').hidden = data.length > 0;
    $('wall-list').innerHTML = data.map(row).join('');

    $('wall-list').querySelectorAll('[data-del]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (!confirm(S.confirm_delete)) return;
        await db.from('wall').delete().eq('id', btn.dataset.del);
        load();
      });
    });
  }

  function row(p) {
    // Свои записи может убрать автор, чужие — владелец сайта.
    const canDelete = me && (me.id === p.user_id || me.id === CONFIG.wall.ownerId);
    const avatar = p.avatar
      ? `<img class="wall-avatar" src="${escapeHTML(p.avatar)}" alt="" width="34" height="34" loading="lazy">`
      : '<span class="wall-avatar wall-avatar--none" aria-hidden="true"></span>';

    return `<li class="wall-post">
      ${avatar}
      <div class="wall-post-body">
        <div class="wall-post-head">
          <span class="wall-post-name">${escapeHTML(p.name)}</span>
          ${p.provider ? `<span class="wall-post-src">${escapeHTML(p.provider)}</span>` : ''}
          <span class="wall-post-when">${when(p.created_at)}</span>
          ${canDelete ? `<button class="wall-del" type="button" data-del="${p.id}">${S.delete}</button>` : ''}
        </div>
        <p class="wall-post-text">${escapeHTML(p.body)}</p>
      </div>
    </li>`;
  }

  /* --------------------------- отправка --------------------------- */

  const input = $('wall-input');
  const counter = $('wall-counter');
  input.addEventListener('input', () => {
    counter.textContent = `${input.value.length} / 600`;
  });

  $('wall-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = $('wall-error');
    err.hidden = true;

    const body = input.value.trim();
    if (!body) {
      err.hidden = false;
      err.textContent = S.err_empty;
      return;
    }

    const send = $('wall-send');
    send.disabled = true;
    send.textContent = S.sending;

    const m = me.user_metadata || {};
    const { error } = await db.from('wall').insert({
      user_id: me.id,
      name: (m.user_name || m.full_name || m.name || 'anon').slice(0, 60),
      avatar: m.avatar_url || m.picture || null,
      provider: me.app_metadata?.provider || null,
      body,
    });

    send.disabled = false;
    send.textContent = S.send;

    if (error) {
      err.hidden = false;
      // Сообщение из триггера о слишком частой отправке приходит как обычная ошибка.
      err.textContent = /too_fast/.test(error.message) ? S.err_fast : S.err_generic;
      return;
    }

    input.value = '';
    counter.textContent = '0 / 600';
    load();
  });

  load();
}
