-- Etapa 3 · Migración 2: refugios
-- Requiere la migración 1 (PostGIS y rol_actual).

-- ---------------------------------------------------------------------------
-- dentro_de_mexico(longitud, latitud): caja aproximada de México.
-- Es la misma que BBOX_MEXICO en src/utils/geo.js: [-118.6, 14.3, -86.5, 32.8].
-- Ojo con el orden: primero longitud, luego latitud.
-- ---------------------------------------------------------------------------
create function public.dentro_de_mexico(p_longitud double precision, p_latitud double precision)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_longitud between -118.6 and -86.5
     and p_latitud between 14.3 and 32.8;
$$;

-- ---------------------------------------------------------------------------
-- Tabla de refugios. Se llena con la lista oficial (ver supabase/plantillas/).
-- La ubicación puede venir vacía: el coordinador la marca en el mapa.
-- ---------------------------------------------------------------------------
create table public.refugios (
  id bigint generated always as identity primary key,
  clave_oficial text unique,
  nombre text not null,
  direccion text,
  municipio text,
  entidad text,
  ubicacion extensions.geography (Point, 4326),
  capacidad integer check (capacidad >= 0),
  ocupacion integer not null default 0 check (ocupacion >= 0),
  estado text not null default 'abierto'
    check (estado in ('abierto', 'lleno', 'cerrado')),
  fuente text not null,
  actualizado_en timestamptz not null default now()
);

comment on column public.refugios.fuente is
  'De dónde salió el dato, por ejemplo: Protección Civil de Jalisco, lista 2026.';

-- Índice espacial para buscar refugios cercanos (etapa 4)
create index refugios_ubicacion_idx on public.refugios using gist (ubicacion);

alter table public.refugios enable row level security;

-- Todos pueden ver los refugios, con o sin sesión
create policy "Todos ven los refugios"
  on public.refugios for select
  to anon, authenticated
  using (true);

-- Solo el coordinador agrega, cambia o borra refugios
create policy "El coordinador agrega refugios"
  on public.refugios for insert
  to authenticated
  with check ((select public.rol_actual()) = 'coordinador');

create policy "El coordinador cambia refugios"
  on public.refugios for update
  to authenticated
  using ((select public.rol_actual()) = 'coordinador')
  with check ((select public.rol_actual()) = 'coordinador');

create policy "El coordinador borra refugios"
  on public.refugios for delete
  to authenticated
  using ((select public.rol_actual()) = 'coordinador');

-- ---------------------------------------------------------------------------
-- Vista para la app: entrega longitud y latitud como números, así el navegador
-- no tiene que entender el formato interno de PostGIS.
-- security_invoker: la vista respeta las políticas de quien la consulta.
-- ---------------------------------------------------------------------------
create view public.refugios_vista
with (security_invoker = true)
as
select
  r.id,
  r.clave_oficial,
  r.nombre,
  r.direccion,
  r.municipio,
  r.entidad,
  r.capacidad,
  r.ocupacion,
  r.estado,
  r.fuente,
  r.actualizado_en,
  extensions.st_x(r.ubicacion::extensions.geometry) as longitud,
  extensions.st_y(r.ubicacion::extensions.geometry) as latitud
from public.refugios r;

-- ---------------------------------------------------------------------------
-- actualizar_refugio: el coordinador ubica un refugio en el mapa y/o cambia
-- su estado y ocupación. Si un valor llega nulo, se deja como estaba.
-- security invoker: las políticas de arriba deciden si puede hacerlo.
-- ---------------------------------------------------------------------------
create function public.actualizar_refugio(
  p_id bigint,
  p_longitud double precision default null,
  p_latitud double precision default null,
  p_estado text default null,
  p_ocupacion integer default null
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  filas integer;
begin
  -- Longitud y latitud van juntas: o las dos o ninguna
  if (p_longitud is null) <> (p_latitud is null) then
    raise exception 'FUERA_DE_MEXICO';
  end if;
  if p_longitud is not null and not public.dentro_de_mexico(p_longitud, p_latitud) then
    raise exception 'FUERA_DE_MEXICO';
  end if;

  update public.refugios
  set
    ubicacion = case
      when p_longitud is null then ubicacion
      else extensions.st_setsrid(extensions.st_makepoint(p_longitud, p_latitud), 4326)::extensions.geography
    end,
    estado = coalesce(p_estado, estado),
    ocupacion = coalesce(p_ocupacion, ocupacion),
    actualizado_en = now()
  where id = p_id;

  -- Si no cambió nada, o no existe o las políticas no lo dejaron (no es coordinador)
  get diagnostics filas = row_count;
  if filas = 0 then
    raise exception 'SIN_PERMISO';
  end if;
end;
$$;

revoke execute on function public.actualizar_refugio(bigint, double precision, double precision, text, integer) from public, anon;
grant execute on function public.actualizar_refugio(bigint, double precision, double precision, text, integer) to authenticated;
