// Счётчик тех, кто сейчас на сайте.
//
// Работает на Supabase Realtime: каждая открытая вкладка подключается
// к общему каналу и отмечается в нём. Сервер держит список подключённых
// и рассылает изменения, поэтому число живое, без опросов и без базы.
//
// Ключ публичный, как и на стене. Присутствие в канале не хранится:
// закрыл вкладку — исчез, писать в базу тут нечего.

import { CONFIG } from './config.js';

const box = document.getElementById('online');
const cfg = CONFIG.wall || {};

if (box && cfg.url && cfg.anonKey) {
  start();
}

async function start() {
  let createClient;
  try {
    ({ createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm'));
  } catch {
    return; // библиотека не загрузилась, счётчика просто не будет
  }

  const db = createClient(cfg.url, cfg.anonKey);

  // Ключ у каждой вкладки свой: иначе две вкладки одного человека
  // считались бы за одного, и число прыгало бы при их закрытии.
  const key = Math.random().toString(36).slice(2);
  const channel = db.channel('online', { config: { presence: { key } } });

  const lang = document.documentElement.lang === 'ru' ? 'ru' : 'en';
  const word = (n) => {
    if (lang !== 'ru') return n === 1 ? 'person here' : 'people here';
    const m10 = n % 10;
    const m100 = n % 100;
    if (m10 === 1 && m100 !== 11) return 'человек тут';
    if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return 'человека тут';
    return 'человек тут';
  };

  const draw = () => {
    const n = Object.keys(channel.presenceState()).length;
    if (!n) {
      box.hidden = true;
      return;
    }
    box.hidden = false;
    box.innerHTML = `<i class="online-dot" aria-hidden="true"></i>${n} ${word(n)}`;
  };

  channel
    .on('presence', { event: 'sync' }, draw)
    .on('presence', { event: 'join' }, draw)
    .on('presence', { event: 'leave' }, draw)
    .subscribe(async (status) => {
      if (status !== 'SUBSCRIBED') return;
      await channel.track({ at: Date.now() });
    });

  // Уходим по-человечески, чтобы не висеть в списке до таймаута.
  window.addEventListener('pagehide', () => { channel.unsubscribe(); });
}
