-- Стена: таблица и правила доступа для Supabase.
--
-- Выполнить один раз в панели Supabase: SQL Editor -> New query -> Run.
--
-- Главное здесь не таблица, а политики. Ключ, который лежит на сайте,
-- публичный, его видит любой гость, поэтому базу защищают именно правила,
-- а не секретность ключа.

create table if not exists public.wall (
  id          bigint generated always as identity primary key,
  created_at  timestamptz not null default now(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  name        text not null,
  avatar      text,
  provider    text,
  body        text not null,
  hidden      boolean not null default false
);

create index if not exists wall_created_idx on public.wall (created_at desc);

-- Длина сообщения и имени ограничена на уровне базы: на клиент полагаться нельзя.
alter table public.wall drop constraint if exists wall_body_len;
alter table public.wall add constraint wall_body_len
  check (char_length(body) between 1 and 600);

alter table public.wall drop constraint if exists wall_name_len;
alter table public.wall add constraint wall_name_len
  check (char_length(name) between 1 and 60);

alter table public.wall enable row level security;

-- Читают все, включая незалогиненных. Скрытые записи не показываются никому.
drop policy if exists "wall read" on public.wall;
create policy "wall read" on public.wall
  for select using (hidden = false);

-- Писать может только вошедший и только от своего имени: user_id подделать нельзя.
drop policy if exists "wall insert" on public.wall;
create policy "wall insert" on public.wall
  for insert to authenticated
  with check (auth.uid() = user_id);

-- Удалять свои записи может автор.
drop policy if exists "wall delete own" on public.wall;
create policy "wall delete own" on public.wall
  for delete to authenticated
  using (auth.uid() = user_id);

-- Не чаще одной записи в минуту с одного аккаунта.
-- Это защита от того, кто зальёт стену за пять секунд.
create or replace function public.wall_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1 from public.wall
    where user_id = new.user_id
      and created_at > now() - interval '1 minute'
  ) then
    raise exception 'too_fast';
  end if;
  return new;
end;
$$;

drop trigger if exists wall_rate_limit_trg on public.wall;
create trigger wall_rate_limit_trg
  before insert on public.wall
  for each row execute function public.wall_rate_limit();

-- ---------------------------------------------------------------------
-- Модерация.
--
-- Подставь свой идентификатор вместо ВСТАВЬ-СВОЙ-UUID и выполни этот кусок
-- отдельно. Свой идентификатор видно в Authentication -> Users после
-- первого входа на сайт, либо на самой странице стены в консоли браузера.
--
-- drop policy if exists "wall owner all" on public.wall;
-- create policy "wall owner all" on public.wall
--   for all to authenticated
--   using (auth.uid() = 'ВСТАВЬ-СВОЙ-UUID')
--   with check (auth.uid() = 'ВСТАВЬ-СВОЙ-UUID');
--
-- После этого ты сможешь удалять и прятать чужие записи прямо со страницы.
