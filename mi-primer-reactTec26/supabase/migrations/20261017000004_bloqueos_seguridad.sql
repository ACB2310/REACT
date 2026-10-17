-- Etapa 3 · Migración 4: seguridad de los bloqueos (revisión del 2026-10-17)
-- Requiere las migraciones 1, 2 y 3. No cambia nada de ellas: solo agrega o reemplaza.
--
-- Por qué: los bloqueos 'total' alimentan la ruta de evacuación a pie, que NUNCA cruza
-- un bloqueo total. Si alguien llena una zona de reportes falsos, a la gente de esa zona
-- le saldría "no hay ruta". Esta migración:
--   1. Limita los reportes SIN CONFIRMAR de ciudadanos por zona (además de por persona)
--      y evita que dos reportes al mismo tiempo se salten los límites.
--   2. Limita cuánto tiempo puede un ciudadano seguir renovando su propio reporte.
--   3. Agrega confirmar_bloqueo(): solo un coordinador puede confirmar.
--   4. Deja de exponer quién reportó cada bloqueo (reportado_por): ni en la tabla
--      ni en el tiempo real. La app solo necesita saber si un bloqueo "es mío".

-- ---------------------------------------------------------------------------
-- 1. Límites al crear un bloqueo
-- ---------------------------------------------------------------------------
-- Límites de reportes sin confirmar de ciudadanos (con o sin cuenta) a 1 km o menos del
-- punto nuevo. Brigadistas y coordinadores no tienen este límite (son personas conocidas).
-- Importante en el proyecto real: activar CAPTCHA para las sesiones anónimas
-- (Authentication → Attack Protection) y bajar su límite de creación por IP.
create or replace function public.preparar_bloqueo_nuevo()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  usuario uuid := auth.uid();
  reportes_ultima_hora integer;
  reportes_en_la_zona integer;
  vivos_en_la_zona integer;
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

  -- Los reportes se revisan de uno en uno: así dos reportes enviados al mismo tiempo
  -- no pueden contar "4" los dos y pasarse del límite
  perform pg_advisory_xact_lock(hashtext('reportar_bloqueo'));

  -- Límite por persona: 5 reportes por hora (con o sin cuenta)
  select count(*) into reportes_ultima_hora
  from public.bloqueos b
  where b.reportado_por = usuario
    and b.creado_en > now() - interval '1 hour';
  if reportes_ultima_hora >= 5 then
    raise exception 'LIMITE_REPORTES';
  end if;

  -- Límite por zona: cada sesión anónima nueva tiene su propio límite por persona,
  -- así que también se limita cuántos reportes sin confirmar de ciudadanos hay a 1 km:
  --   - máximo 10 creados en la última hora (ritmo), y
  --   - máximo 20 vivos en total (para que no se acumulen durante días).
  -- Los reportes de brigadistas y coordinadores no cuentan (son personas conocidas).
  if public.rol_actual() = 'ciudadano' then
    select
      count(*) filter (where b.creado_en > now() - interval '1 hour'),
      count(*)
    into reportes_en_la_zona, vivos_en_la_zona
    from public.bloqueos b
    where not b.confirmado
      and b.expira_en > now()
      and extensions.st_dwithin(b.geometria, new.geometria, 1000)
      and not exists (
        select 1 from public.perfiles p
        where p.id = b.reportado_por and p.rol in ('brigadista', 'coordinador')
      );
    if reportes_en_la_zona >= 10 or vivos_en_la_zona >= 20 then
      raise exception 'LIMITE_ZONA';
    end if;
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

-- ---------------------------------------------------------------------------
-- 2. Renovar: un ciudadano solo puede renovar su reporte durante sus primeras 48 h
--    (así un reporte falso no vive para siempre). Brigadistas y coordinadores sin límite.
-- ---------------------------------------------------------------------------
create or replace function public.renovar_bloqueo(p_id bigint)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  nuevo_vencimiento timestamptz := now() + interval '24 hours';
  creado timestamptz;
begin
  perform public.revisar_permiso_bloqueo(p_id);

  if public.rol_actual() = 'ciudadano' then
    select b.creado_en into creado from public.bloqueos b where b.id = p_id;
    if creado < now() - interval '48 hours' then
      raise exception 'RENOVACION_LIMITE';
    end if;
  end if;

  update public.bloqueos
  set expira_en = nuevo_vencimiento, renovado_en = now()
  where id = p_id;
  return nuevo_vencimiento;
end;
$$;

revoke execute on function public.renovar_bloqueo(bigint) from public, anon;
grant execute on function public.renovar_bloqueo(bigint) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. confirmar_bloqueo: solo un coordinador. Un bloqueo confirmado ya no cuenta
--    para el límite por zona.
-- ---------------------------------------------------------------------------
create function public.confirmar_bloqueo(p_id bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or public.rol_actual() <> 'coordinador' then
    raise exception 'SIN_PERMISO';
  end if;

  update public.bloqueos
  set confirmado = true
  where id = p_id and expira_en > now();

  if not found then
    raise exception 'NO_EXISTE';
  end if;
end;
$$;

revoke execute on function public.confirmar_bloqueo(bigint) from public, anon;
grant execute on function public.confirmar_bloqueo(bigint) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. No exponer quién reportó cada bloqueo
-- ---------------------------------------------------------------------------
-- La app pregunta "¿cuáles son míos?" con esta función, sin poder ver de nadie más
create function public.ids_bloqueos_mios()
returns setof bigint
language sql
stable
security definer
set search_path = ''
as $$
  select b.id
  from public.bloqueos b
  where auth.uid() is not null
    and b.reportado_por = auth.uid()
    and b.expira_en > now();
$$;

revoke execute on function public.ids_bloqueos_mios() from public;
grant execute on function public.ids_bloqueos_mios() to anon, authenticated;

-- La vista ya no lee reportado_por directamente (mismas columnas, en el mismo orden)
create or replace view public.bloqueos_vista
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
  b.id in (select public.ids_bloqueos_mios()) as es_mio,
  extensions.st_x(b.geometria::extensions.geometry) as longitud,
  extensions.st_y(b.geometria::extensions.geometry) as latitud
from public.bloqueos b
where b.expira_en > now();

-- Se puede leer todo de la tabla MENOS reportado_por
revoke select on public.bloqueos from anon, authenticated;
grant select (id, geometria, tipo, descripcion, es_anonimo, confirmado, expira_en, renovado_en, creado_en)
  on public.bloqueos to anon, authenticated;

-- El tiempo real ya no manda el renglón completo (traía reportado_por): se deja de
-- publicar la tabla y un disparador avisa solo "algo cambió en el bloqueo N"
-- por un canal PRIVADO. Privado porque en un canal público cualquiera con la llave
-- pública podría mandar avisos falsos y hacer que todas las apps recarguen sin parar.
-- Todos pueden ESCUCHAR ese tema; nadie puede ENVIAR desde la app (solo el servidor).
alter publication supabase_realtime drop table public.bloqueos;

create policy "Escuchar avisos de bloqueos"
  on realtime.messages for select
  to anon, authenticated
  using (
    (select realtime.topic()) = 'bloqueos-cambios'
    and realtime.messages.extension = 'broadcast'
  );
-- No hay política de insert en realtime.messages para este tema: nadie puede enviar

create function public.avisar_cambio_bloqueo()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform realtime.send(
    jsonb_build_object('id', coalesce(new.id, old.id), 'operacion', tg_op),
    'cambio',
    'bloqueos-cambios',
    true
  );
  return null;
end;
$$;

revoke execute on function public.avisar_cambio_bloqueo() from public, anon, authenticated;

create trigger despues_de_cambiar_bloqueo
  after insert or update or delete on public.bloqueos
  for each row execute function public.avisar_cambio_bloqueo();
