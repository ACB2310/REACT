-- Etapa 3 · Migración 3: bloqueos
-- Requiere las migraciones 1 y 2 (PostGIS, rol_actual y dentro_de_mexico).
--
-- Decisiones del 2026-10-16:
-- - Cualquiera puede reportar, con cuenta o sin ella (sesión anónima de Supabase).
-- - Un bloqueo es un punto: 'solo_vehiculos' (parcial: se puede pasar a pie)
--   o 'total' (no pasa nadie).
-- - Dura 24 horas. Se puede renovar (24 h más desde ese momento) o eliminar.

create table public.bloqueos (
  id bigint generated always as identity primary key,
  geometria extensions.geography (Point, 4326) not null,
  tipo text not null check (tipo in ('solo_vehiculos', 'total')),
  descripcion text check (char_length(descripcion) <= 280),
  reportado_por uuid references auth.users (id) on delete set null,
  es_anonimo boolean not null default true,
  confirmado boolean not null default false,
  expira_en timestamptz not null,
  renovado_en timestamptz,
  creado_en timestamptz not null default now()
);

-- Índice espacial (etapa 4: rutas que evitan bloqueos) y por vencimiento
create index bloqueos_geometria_idx on public.bloqueos using gist (geometria);
create index bloqueos_expira_en_idx on public.bloqueos (expira_en);
-- Para contar rápido cuántos reportes hizo alguien en la última hora
create index bloqueos_reportado_por_idx on public.bloqueos (reportado_por, creado_en);

alter table public.bloqueos enable row level security;

-- ---------------------------------------------------------------------------
-- Antes de guardar un bloqueo nuevo, el servidor decide estos valores.
-- Lo que mande la app en estas columnas se ignora, para que nadie pueda,
-- por ejemplo, crear un bloqueo que dure un año o que ya venga confirmado.
-- ---------------------------------------------------------------------------
create function public.preparar_bloqueo_nuevo()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  usuario uuid := auth.uid();
  reportes_ultima_hora integer;
begin
  if usuario is null then
    raise exception 'SIN_SESION';
  end if;

  if not public.dentro_de_mexico(
    extensions.st_x(new.geometria::extensions.geometry),
    extensions.st_y(new.geometria::extensions.geometry)
  ) then
    raise exception 'FUERA_DE_MEXICO';
  end if;

  -- Límite contra spam: 5 reportes por hora por usuario (con o sin cuenta)
  select count(*) into reportes_ultima_hora
  from public.bloqueos b
  where b.reportado_por = usuario
    and b.creado_en > now() - interval '1 hour';
  if reportes_ultima_hora >= 5 then
    raise exception 'LIMITE_REPORTES';
  end if;

  new.reportado_por := usuario;
  new.es_anonimo := coalesce((auth.jwt() ->> 'is_anonymous')::boolean, true);
  new.confirmado := false;
  new.creado_en := now();
  new.expira_en := now() + interval '24 hours';
  new.renovado_en := null;
  new.descripcion := nullif(btrim(new.descripcion), '');
  return new;
end;
$$;

revoke execute on function public.preparar_bloqueo_nuevo() from public, anon, authenticated;

create trigger antes_de_crear_bloqueo
  before insert on public.bloqueos
  for each row execute function public.preparar_bloqueo_nuevo();

-- ---------------------------------------------------------------------------
-- Políticas
-- ---------------------------------------------------------------------------

-- Todos ven los bloqueos vigentes. Los vencidos no se muestran a nadie.
create policy "Todos ven los bloqueos vigentes"
  on public.bloqueos for select
  to anon, authenticated
  using (expira_en > now());

-- Cualquiera con sesión (también anónima) puede reportar, solo a su nombre.
-- Los anónimos de Supabase usan el rol "authenticated".
create policy "Reportar bloqueos a mi nombre"
  on public.bloqueos for insert
  to authenticated
  with check (reportado_por = (select auth.uid()));

-- No hay políticas de update ni delete: renovar y eliminar se hacen con las
-- funciones de abajo, que revisan quién lo pide.

-- ---------------------------------------------------------------------------
-- Vista para la app: longitud y latitud como números y "es_mio" en lugar
-- del id de quien reportó (no se expone a los demás).
-- ---------------------------------------------------------------------------
create view public.bloqueos_vista
with (security_invoker = true)
as
select
  b.id,
  b.tipo,
  b.descripcion,
  b.es_anonimo,
  b.confirmado,
  b.expira_en,
  b.renovado_en,
  b.creado_en,
  coalesce(b.reportado_por = (select auth.uid()), false) as es_mio,
  extensions.st_x(b.geometria::extensions.geometry) as longitud,
  extensions.st_y(b.geometria::extensions.geometry) as latitud
from public.bloqueos b
where b.expira_en > now();

-- ---------------------------------------------------------------------------
-- reportar_bloqueo: guarda un bloqueo nuevo y devuelve su id.
-- Recibe primero la longitud y luego la latitud.
-- security invoker: pasan la política de insert y el disparador de arriba.
-- ---------------------------------------------------------------------------
create function public.reportar_bloqueo(
  p_longitud double precision,
  p_latitud double precision,
  p_tipo text,
  p_descripcion text default null
)
returns bigint
language plpgsql
security invoker
set search_path = ''
as $$
declare
  nuevo_id bigint;
begin
  insert into public.bloqueos (geometria, tipo, descripcion)
  values (
    extensions.st_setsrid(extensions.st_makepoint(p_longitud, p_latitud), 4326)::extensions.geography,
    p_tipo,
    p_descripcion
  )
  returning id into nuevo_id;
  return nuevo_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- ¿Quien pide puede renovar o eliminar este bloqueo?
-- Sí, si lo reportó esa misma persona o si es brigadista o coordinador.
-- Si no, lanza NO_EXISTE o SIN_PERMISO. Aparta el renglón (for update) para
-- que dos personas no lo renueven o eliminen al mismo tiempo.
-- ---------------------------------------------------------------------------
create function public.revisar_permiso_bloqueo(p_id bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  dueno uuid;
begin
  select b.reportado_por into dueno
  from public.bloqueos b
  where b.id = p_id and b.expira_en > now()
  for update;

  if not found then
    raise exception 'NO_EXISTE';
  end if;

  if auth.uid() is null
     or (dueno is distinct from auth.uid()
         and public.rol_actual() not in ('brigadista', 'coordinador')) then
    raise exception 'SIN_PERMISO';
  end if;
end;
$$;

revoke execute on function public.revisar_permiso_bloqueo(bigint) from public, anon, authenticated;

-- renovar_bloqueo: 24 horas más a partir de ahora. Devuelve el nuevo vencimiento.
create function public.renovar_bloqueo(p_id bigint)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  nuevo_vencimiento timestamptz := now() + interval '24 hours';
begin
  perform public.revisar_permiso_bloqueo(p_id);
  update public.bloqueos
  set expira_en = nuevo_vencimiento, renovado_en = now()
  where id = p_id;
  return nuevo_vencimiento;
end;
$$;

-- eliminar_bloqueo: lo quita en ese momento.
create function public.eliminar_bloqueo(p_id bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.revisar_permiso_bloqueo(p_id);
  delete from public.bloqueos where id = p_id;
end;
$$;

-- Solo usuarios con sesión (también anónima) pueden llamar estas funciones
revoke execute on function public.reportar_bloqueo(double precision, double precision, text, text) from public, anon;
revoke execute on function public.renovar_bloqueo(bigint) from public, anon;
revoke execute on function public.eliminar_bloqueo(bigint) from public, anon;
grant execute on function public.reportar_bloqueo(double precision, double precision, text, text) to authenticated;
grant execute on function public.renovar_bloqueo(bigint) to authenticated;
grant execute on function public.eliminar_bloqueo(bigint) to authenticated;

-- ---------------------------------------------------------------------------
-- Tiempo real: avisar a la app cuando se crea, renueva o elimina un bloqueo.
-- Supabase respeta las políticas de select al enviar los cambios.
-- ---------------------------------------------------------------------------
alter publication supabase_realtime add table public.bloqueos;
