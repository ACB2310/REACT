-- Etapa 4 · Migración 6: zonas de peligro y límite de consultas de ruta
-- Requiere las migraciones 1 a 5. No modifica nada de ellas: solo agrega.
--
-- Decisiones del 2026-10-17:
-- - Las zonas de peligro las dibuja el COORDINADOR (polígonos). Sismos y ciclones
--   no generan zonas en esta etapa (los valores de `origen` quedan reservados).
-- - Todos pueden VER las zonas (la gente necesita saber dónde está el peligro).
-- - Severidad 1 = la ruta la evita siempre; 2 = precaución (solo se avisa).
-- - Cada zona mide como máximo 20 km²: OpenRouteService no acepta más de 200 km²
--   de zonas a evitar en una ruta, ni más de 20 km de lado.
-- - La Edge Function `rutas` usa la cuota de OpenRouteService: máximo 20 consultas
--   por hora por sesión (con o sin cuenta).

-- ---------------------------------------------------------------------------
-- Zonas de peligro
-- ---------------------------------------------------------------------------
create table public.zonas_peligro (
  id bigint generated always as identity primary key,
  geometria extensions.geography (Polygon, 4326) not null,
  origen text not null default 'manual'
    check (origen in ('manual', 'sismo', 'nhc', 'gdacs', 'inundacion')),
  severidad smallint not null default 1 check (severidad in (1, 2)),
  descripcion text check (char_length(descripcion) <= 300),
  activa boolean not null default true,
  expira_en timestamptz,
  creado_por uuid references auth.users (id) on delete set null,
  creado_en timestamptz not null default now()
);

create index zonas_peligro_geometria_idx on public.zonas_peligro using gist (geometria);
create index zonas_peligro_activas_idx on public.zonas_peligro (activa, expira_en);

alter table public.zonas_peligro enable row level security;

-- Todos ven las zonas activas y no vencidas, con o sin sesión
create policy "Todos ven las zonas de peligro vigentes"
  on public.zonas_peligro for select
  to anon, authenticated
  using (activa and (expira_en is null or expira_en > now()));

-- Nadie escribe directo: solo con las funciones de abajo (coordinador)
revoke insert, update, delete, truncate on public.zonas_peligro from anon, authenticated;

-- Para la app: el polígono como GeoJSON (coordenadas [longitud, latitud])
create view public.zonas_peligro_vista
with (security_invoker = true)
as
select
  z.id,
  z.origen,
  z.severidad,
  z.descripcion,
  z.expira_en,
  z.creado_en,
  extensions.st_asgeojson(z.geometria::extensions.geometry, 6) as geojson
from public.zonas_peligro z
where z.activa and (z.expira_en is null or z.expira_en > now());

-- Crea una zona a partir de un polígono GeoJSON. Devuelve su id.
create function public.crear_zona_peligro(
  p_geojson text,
  p_severidad integer default 1,
  p_descripcion text default null,
  p_expira_en timestamptz default null
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  forma extensions.geometry;
  nuevo_id bigint;
begin
  perform public.exigir_coordinador();

  begin
    forma := extensions.st_setsrid(extensions.st_geomfromgeojson(p_geojson), 4326);
  exception when others then
    raise exception 'ZONA_INVALIDA';
  end;

  if forma is null
     or extensions.geometrytype(forma) <> 'POLYGON'
     or not extensions.st_isvalid(forma) then
    raise exception 'ZONA_INVALIDA';
  end if;

  -- Toda la zona debe quedar dentro de México (misma caja que dentro_de_mexico())
  if not extensions.st_within(forma, extensions.st_makeenvelope(-118.6, 14.3, -86.5, 32.8, 4326)) then
    raise exception 'FUERA_DE_MEXICO';
  end if;

  -- Área real en m² (geography). Máximo 20 km² por el límite de OpenRouteService.
  if extensions.st_area(forma::extensions.geography) > 20000000 then
    raise exception 'ZONA_GRANDE';
  end if;

  if p_expira_en is not null and p_expira_en <= now() then
    raise exception 'ZONA_INVALIDA';
  end if;

  insert into public.zonas_peligro (geometria, severidad, descripcion, expira_en, creado_por)
  values (
    forma::extensions.geography,
    p_severidad,
    nullif(btrim(p_descripcion), ''),
    p_expira_en,
    auth.uid()
  )
  returning id into nuevo_id;
  return nuevo_id;
end;
$$;

-- Desactiva una zona (no se borra: queda el historial)
create function public.desactivar_zona_peligro(p_id bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.exigir_coordinador();
  update public.zonas_peligro set activa = false where id = p_id and activa;
  if not found then
    raise exception 'ZONA_NO_EXISTE';
  end if;
end;
$$;

revoke execute on function public.crear_zona_peligro(text, integer, text, timestamptz) from public, anon;
revoke execute on function public.desactivar_zona_peligro(bigint) from public, anon;
grant execute on function public.crear_zona_peligro(text, integer, text, timestamptz) to authenticated;
grant execute on function public.desactivar_zona_peligro(bigint) to authenticated;

-- Tiempo real: canal PRIVADO "zonas-cambios". Todos pueden escucharlo; nadie puede
-- enviar desde la app (solo el servidor), igual que "bloqueos-cambios".
create policy "Escuchar avisos de zonas de peligro"
  on realtime.messages for select
  to anon, authenticated
  using (
    (select realtime.topic()) = 'zonas-cambios'
    and realtime.messages.extension = 'broadcast'
  );

create function public.avisar_cambio_zonas()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform realtime.send(jsonb_build_object('operacion', tg_op), 'cambio', 'zonas-cambios', true);
  return null;
end;
$$;

revoke execute on function public.avisar_cambio_zonas() from public, anon, authenticated;

create trigger despues_de_cambiar_zonas
  after insert or update or delete on public.zonas_peligro
  for each statement execute function public.avisar_cambio_zonas();

-- ---------------------------------------------------------------------------
-- Límite de consultas de ruta (cuida la cuota diaria de OpenRouteService)
-- ---------------------------------------------------------------------------
create table public.consultas_ruta (
  id bigint generated always as identity primary key,
  usuario uuid not null references auth.users (id) on delete cascade,
  creado_en timestamptz not null default now()
);

create index consultas_ruta_usuario_idx on public.consultas_ruta (usuario, creado_en);

-- Nadie la puede leer ni escribir desde la app: solo la función de abajo
alter table public.consultas_ruta enable row level security;
revoke all on public.consultas_ruta from anon, authenticated;

-- La llama la Edge Function `rutas` (con la sesión de la persona) antes de usar ORS
create function public.registrar_consulta_ruta()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_usuario uuid := auth.uid();
  recientes integer;
begin
  if v_usuario is null then
    raise exception 'SIN_SESION';
  end if;

  -- Una consulta a la vez por persona, para que no se salten el límite en paralelo
  perform pg_advisory_xact_lock(hashtext('consulta_ruta:' || v_usuario::text));

  -- Lo que pasó de un día ya no sirve: se limpia aquí mismo
  delete from public.consultas_ruta
  where consultas_ruta.usuario = v_usuario
    and creado_en < now() - interval '1 day';

  select count(*) into recientes
  from public.consultas_ruta c
  where c.usuario = v_usuario
    and c.creado_en > now() - interval '1 hour';
  if recientes >= 20 then
    raise exception 'LIMITE_RUTAS';
  end if;

  insert into public.consultas_ruta (usuario) values (v_usuario);
end;
$$;

revoke execute on function public.registrar_consulta_ruta() from public, anon;
grant execute on function public.registrar_consulta_ruta() to authenticated;
