-- =====================================================================
--  LA MEJENGA - esquema de base de datos para Supabase
--  Pegar completo en: Supabase > SQL Editor > New query > Run
--  Es seguro volver a ejecutarlo en un proyecto nuevo y vacío.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------- Tablas ----------------------------------------------------

create table public.mejengas (
  id         uuid primary key default gen_random_uuid(),
  titulo     text        not null check (char_length(trim(titulo)) between 1 and 80),
  lugar      text        not null check (char_length(trim(lugar))  between 1 and 80),
  fecha      timestamptz not null,
  capacidad  int         not null check (capacidad between 2 and 50),
  abierta    boolean     not null default true,
  creada     timestamptz not null default now()
);

create table public.anotados (
  id          uuid primary key default gen_random_uuid(),
  mejenga_id  uuid not null references public.mejengas(id) on delete cascade,
  nombre      text not null check (char_length(trim(nombre)) between 1 and 40),
  -- clock_timestamp() garantiza orden cronológico exacto
  creado      timestamptz not null default clock_timestamp()
);

-- No se permite el mismo nombre dos veces en una mejenga (sin importar mayúsculas)
create unique index anotados_nombre_unico on public.anotados (mejenga_id, lower(nombre));
create index anotados_orden on public.anotados (mejenga_id, creado);

-- Código secreto de cada dispositivo. Nadie puede leerlo desde la web:
-- solo lo usan las funciones de abajo.
create table public.anotado_tokens (
  anotado_id  uuid primary key references public.anotados(id) on delete cascade,
  mejenga_id  uuid not null references public.mejengas(id) on delete cascade,
  token       text not null
);
create index anotado_tokens_busqueda on public.anotado_tokens (mejenga_id, token);

-- ---------- Seguridad (RLS) -------------------------------------------

alter table public.mejengas       enable row level security;
alter table public.anotados       enable row level security;
alter table public.anotado_tokens enable row level security;  -- sin políticas = cerrada

-- Permisos base: primero quitar todo, luego dar solo lo necesario
revoke all on public.mejengas, public.anotados, public.anotado_tokens from anon, authenticated;

grant select on public.mejengas, public.anotados to anon, authenticated;
grant insert, update, delete on public.mejengas   to authenticated;  -- árbitros
grant delete                 on public.anotados   to authenticated;  -- árbitros

-- Cualquiera puede VER mejengas y anotados
create policy mejengas_ver on public.mejengas for select to anon, authenticated using (true);
create policy anotados_ver on public.anotados for select to anon, authenticated using (true);

-- Solo árbitros (usuarios con sesión) crean/editan/borran mejengas
create policy mejengas_crear  on public.mejengas for insert to authenticated with check (true);
create policy mejengas_editar on public.mejengas for update to authenticated using (true) with check (true);
create policy mejengas_borrar on public.mejengas for delete to authenticated using (true);

-- Solo árbitros pueden sacar a cualquier anotado directamente
create policy anotados_borrar on public.anotados for delete to authenticated using (true);

-- ---------- Funciones para jugadores ----------------------------------

-- Anotarse: la usan jugadores (sin sesión) y árbitros
create or replace function public.anotarse(p_mejenga uuid, p_nombre text, p_token text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nombre  text := trim(regexp_replace(coalesce(p_nombre, ''), '\s+', ' ', 'g'));
  v_abierta boolean;
  v_id      uuid;
begin
  if char_length(v_nombre) < 1 or char_length(v_nombre) > 40 then
    raise exception 'NOMBRE_INVALIDO';
  end if;
  if p_token is null or char_length(p_token) < 16 then
    raise exception 'TOKEN_INVALIDO';
  end if;

  select abierta into v_abierta from public.mejengas where id = p_mejenga;
  if v_abierta is null then raise exception 'MEJENGA_NO_EXISTE'; end if;
  if not v_abierta     then raise exception 'MEJENGA_CERRADA';   end if;

  -- tope de seguridad por mejenga (evita spam)
  if (select count(*) from public.anotados where mejenga_id = p_mejenga) >= 100 then
    raise exception 'LISTA_MAXIMA';
  end if;

  -- máximo 3 anotaciones por dispositivo (uno mismo + 2 amigos); árbitros sin límite
  if auth.uid() is null
     and (select count(*) from public.anotado_tokens
          where mejenga_id = p_mejenga and token = p_token) >= 3 then
    raise exception 'LIMITE_DISPOSITIVO';
  end if;

  insert into public.anotados (mejenga_id, nombre)
  values (p_mejenga, v_nombre)
  returning id into v_id;

  insert into public.anotado_tokens (anotado_id, mejenga_id, token)
  values (v_id, p_mejenga, p_token);

  return v_id;
exception
  when unique_violation then
    raise exception 'NOMBRE_REPETIDO';
end;
$$;

-- Quitarse: solo funciona si el código del dispositivo coincide
create or replace function public.quitarme(p_id uuid, p_token text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_filas int;
begin
  delete from public.anotados a
  using public.anotado_tokens t
  where a.id = p_id
    and t.anotado_id = a.id
    and t.token = p_token;
  get diagnostics v_filas = row_count;
  return v_filas > 0;
end;
$$;

revoke all on function public.anotarse(uuid, text, text) from public;
revoke all on function public.quitarme(uuid, text)       from public;
grant execute on function public.anotarse(uuid, text, text) to anon, authenticated;
grant execute on function public.quitarme(uuid, text)       to anon, authenticated;

-- ---------- Tiempo real -----------------------------------------------
-- Para que la lista se actualice sola en todos los celulares
alter publication supabase_realtime add table public.mejengas, public.anotados;
