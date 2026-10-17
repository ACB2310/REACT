-- Etapa 6 · Migración 5: brigadas, incidentes y asignaciones
-- Requiere las migraciones 1 a 4. No modifica nada de ellas: solo agrega.
--
-- Decisiones del 2026-10-17:
-- - Solo el coordinador crea incidentes (tocando el mapa o desde un bloqueo).
-- - La app sugiere la brigada disponible más cercana por prioridad y el coordinador confirma.
-- - Cada brigada tiene una BASE fija que marca el coordinador (no se rastrea a nadie).
-- - Cada brigadista pertenece a una brigada y avanza su asignación:
--   en camino → en el lugar → terminado.
-- - Prioridad 1 = la más urgente; 5 = la menos urgente.
-- - Una brigada atiende un incidente a la vez y un incidente tiene una brigada a la vez.
--
-- Los ciudadanos (con o sin cuenta) NO ven incidentes ni brigadas: pueden traer
-- datos sensibles ("persona atrapada en…"). Solo brigadistas y coordinadores.
-- Nadie escribe directo en las tablas: todo pasa por las funciones (RPC) de abajo,
-- que revisan el rol y el estado.

-- ---------------------------------------------------------------------------
-- Tablas
-- ---------------------------------------------------------------------------
create table public.brigadas (
  id bigint generated always as identity primary key,
  nombre text not null unique check (char_length(btrim(nombre)) between 1 and 80),
  vehiculo text check (char_length(vehiculo) <= 80),
  base extensions.geography (Point, 4326) not null,
  estado text not null default 'disponible'
    check (estado in ('disponible', 'asignada', 'en_camino', 'en_sitio', 'fuera_de_servicio')),
  incidente_id bigint,
  actualizado_en timestamptz not null default now(),
  -- Una brigada tiene incidente si y solo si está asignada, en camino o en el lugar
  constraint brigadas_estado_coherente check (
    (estado in ('asignada', 'en_camino', 'en_sitio')) = (incidente_id is not null)
  )
);

create table public.incidentes (
  id bigint generated always as identity primary key,
  ubicacion extensions.geography (Point, 4326) not null,
  tipo text not null
    check (tipo in ('rescate', 'atencion_medica', 'incendio', 'derrumbe', 'inundacion', 'bloqueo', 'otro')),
  prioridad smallint not null check (prioridad between 1 and 5),
  descripcion text check (char_length(descripcion) <= 500),
  estado text not null default 'pendiente'
    check (estado in ('pendiente', 'asignado', 'en_atencion', 'atendido', 'cancelado')),
  bloqueo_id bigint references public.bloqueos (id) on delete set null,
  creado_por uuid references auth.users (id) on delete set null,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

alter table public.brigadas
  add constraint brigadas_incidente_fk
  foreign key (incidente_id) references public.incidentes (id) on delete set null;

-- Historial: quién asignó qué brigada a qué incidente y cómo terminó
create table public.asignaciones (
  id bigint generated always as identity primary key,
  incidente_id bigint not null references public.incidentes (id) on delete cascade,
  brigada_id bigint not null references public.brigadas (id) on delete cascade,
  asignado_por uuid references auth.users (id) on delete set null,
  asignado_en timestamptz not null default now(),
  terminado_en timestamptz,
  resultado text check (resultado in ('atendido', 'liberada', 'cancelado')),
  constraint asignaciones_cierre_coherente check ((terminado_en is null) = (resultado is null))
);

-- A qué brigada pertenece cada brigadista
alter table public.perfiles
  add column brigada_id bigint references public.brigadas (id) on delete set null;

-- ---------------------------------------------------------------------------
-- Índices. Los "únicos parciales" son los que impiden duplicidades aunque
-- dos coordinadores asignen al mismo tiempo.
-- ---------------------------------------------------------------------------
-- Un incidente no puede estar en dos brigadas
create unique index brigadas_incidente_unico on public.brigadas (incidente_id) where incidente_id is not null;
-- Un incidente y una brigada tienen como máximo una asignación abierta
create unique index asignaciones_incidente_abierta on public.asignaciones (incidente_id) where terminado_en is null;
create unique index asignaciones_brigada_abierta on public.asignaciones (brigada_id) where terminado_en is null;

create index brigadas_base_idx on public.brigadas using gist (base);
create index incidentes_ubicacion_idx on public.incidentes using gist (ubicacion);
create index incidentes_estado_prioridad_idx on public.incidentes (estado, prioridad, creado_en);
create index perfiles_brigada_idx on public.perfiles (brigada_id);

-- ---------------------------------------------------------------------------
-- Ayudantes
-- ---------------------------------------------------------------------------
-- ¿Quien pregunta es brigadista o coordinador?
create function public.es_personal()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.rol_actual() in ('brigadista', 'coordinador');
$$;

-- Brigada del brigadista que pregunta (o null)
create function public.mi_brigada_id()
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select p.brigada_id
  from public.perfiles p
  where p.id = auth.uid() and p.rol = 'brigadista';
$$;

-- Cuántos brigadistas tiene una brigada (0 para quien no es personal)
create function public.contar_miembros(p_brigada_id bigint)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when public.es_personal() then
      (select count(*)::integer from public.perfiles p
       where p.brigada_id = p_brigada_id and p.rol = 'brigadista')
    else 0
  end;
$$;

-- Solo para usarse dentro de las funciones de abajo
create function public.exigir_coordinador()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or public.rol_actual() <> 'coordinador' then
    raise exception 'SIN_PERMISO';
  end if;
end;
$$;

-- Punto [longitud, latitud] a geography, revisando que esté en México
create function public.punto_en_mexico(p_longitud double precision, p_latitud double precision)
returns extensions.geography
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_longitud is null or p_latitud is null
     or not public.dentro_de_mexico(p_longitud, p_latitud) then
    raise exception 'FUERA_DE_MEXICO';
  end if;
  return extensions.st_setsrid(extensions.st_makepoint(p_longitud, p_latitud), 4326)::extensions.geography;
end;
$$;

-- ---------------------------------------------------------------------------
-- RLS: solo brigadistas y coordinadores pueden leer. Nadie escribe directo.
-- ---------------------------------------------------------------------------
alter table public.brigadas enable row level security;
alter table public.incidentes enable row level security;
alter table public.asignaciones enable row level security;

create policy "Personal ve las brigadas"
  on public.brigadas for select to authenticated
  using ((select public.es_personal()));

create policy "Personal ve los incidentes"
  on public.incidentes for select to authenticated
  using ((select public.es_personal()));

create policy "Personal ve el historial de asignaciones"
  on public.asignaciones for select to authenticated
  using ((select public.es_personal()));

revoke insert, update, delete, truncate on public.brigadas, public.incidentes, public.asignaciones
  from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Vistas para la app (longitud y latitud como números)
-- ---------------------------------------------------------------------------
-- Incidentes abiertos, con la brigada que los atiende
create view public.incidentes_vista
with (security_invoker = true)
as
select
  i.id,
  i.tipo,
  i.prioridad,
  i.descripcion,
  i.estado,
  i.bloqueo_id,
  i.creado_en,
  i.actualizado_en,
  b.id as brigada_id,
  b.nombre as brigada_nombre,
  b.estado as brigada_estado,
  extensions.st_x(i.ubicacion::extensions.geometry) as longitud,
  extensions.st_y(i.ubicacion::extensions.geometry) as latitud
from public.incidentes i
left join public.brigadas b on b.incidente_id = i.id
where i.estado in ('pendiente', 'asignado', 'en_atencion');

create view public.brigadas_vista
with (security_invoker = true)
as
select
  b.id,
  b.nombre,
  b.vehiculo,
  b.estado,
  b.incidente_id,
  b.actualizado_en,
  public.contar_miembros(b.id) as miembros,
  coalesce(b.id = public.mi_brigada_id(), false) as es_mia,
  extensions.st_x(b.base::extensions.geometry) as longitud,
  extensions.st_y(b.base::extensions.geometry) as latitud
from public.brigadas b;

-- ---------------------------------------------------------------------------
-- Funciones del coordinador: incidentes
-- ---------------------------------------------------------------------------
create function public.crear_incidente(
  p_longitud double precision,
  p_latitud double precision,
  p_tipo text,
  p_prioridad integer,
  p_descripcion text default null,
  p_bloqueo_id bigint default null
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  nuevo_id bigint;
begin
  perform public.exigir_coordinador();
  insert into public.incidentes (ubicacion, tipo, prioridad, descripcion, bloqueo_id, creado_por)
  values (
    public.punto_en_mexico(p_longitud, p_latitud),
    p_tipo,
    p_prioridad,
    nullif(btrim(p_descripcion), ''),
    p_bloqueo_id,
    auth.uid()
  )
  returning id into nuevo_id;
  return nuevo_id;
end;
$$;

create function public.actualizar_incidente(p_id bigint, p_prioridad integer, p_descripcion text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.exigir_coordinador();
  update public.incidentes
  set prioridad = p_prioridad,
      descripcion = nullif(btrim(p_descripcion), ''),
      actualizado_en = now()
  where id = p_id and estado in ('pendiente', 'asignado', 'en_atencion');
  if not found then
    raise exception 'INCIDENTE_CERRADO';
  end if;
end;
$$;

-- Orden de bloqueo en TODAS las funciones: primero el incidente, luego la brigada.
-- Así dos operaciones al mismo tiempo nunca se quedan esperándose una a la otra.
create function public.cancelar_incidente(p_id bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.exigir_coordinador();
  perform 1 from public.incidentes
  where id = p_id and estado in ('pendiente', 'asignado', 'en_atencion')
  for update;
  if not found then
    raise exception 'INCIDENTE_CERRADO';
  end if;

  update public.brigadas
  set estado = 'disponible', incidente_id = null, actualizado_en = now()
  where incidente_id = p_id;

  update public.asignaciones
  set terminado_en = now(), resultado = 'cancelado'
  where incidente_id = p_id and terminado_en is null;

  update public.incidentes
  set estado = 'cancelado', actualizado_en = now()
  where id = p_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Funciones del coordinador: asignar y liberar
-- ---------------------------------------------------------------------------
create function public.asignar_brigada(p_incidente_id bigint, p_brigada_id bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  estado_incidente text;
  estado_brigada text;
begin
  perform public.exigir_coordinador();

  select estado into estado_incidente from public.incidentes where id = p_incidente_id for update;
  if estado_incidente is null or estado_incidente in ('atendido', 'cancelado') then
    raise exception 'INCIDENTE_CERRADO';
  end if;
  if estado_incidente <> 'pendiente' then
    raise exception 'INCIDENTE_ASIGNADO';
  end if;

  select estado into estado_brigada from public.brigadas where id = p_brigada_id for update;
  if estado_brigada is null then
    raise exception 'BRIGADA_NO_EXISTE';
  end if;
  if estado_brigada <> 'disponible' then
    raise exception 'BRIGADA_OCUPADA';
  end if;

  update public.brigadas
  set estado = 'asignada', incidente_id = p_incidente_id, actualizado_en = now()
  where id = p_brigada_id;

  update public.incidentes
  set estado = 'asignado', actualizado_en = now()
  where id = p_incidente_id;

  insert into public.asignaciones (incidente_id, brigada_id, asignado_por)
  values (p_incidente_id, p_brigada_id, auth.uid());
end;
$$;

-- Quita la brigada de su incidente: el incidente vuelve a "pendiente"
create function public.liberar_brigada(p_brigada_id bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  incidente bigint;
begin
  perform public.exigir_coordinador();

  select incidente_id into incidente from public.brigadas where id = p_brigada_id;
  if not found then
    raise exception 'BRIGADA_NO_EXISTE';
  end if;
  if incidente is null then
    raise exception 'TRANSICION_INVALIDA';
  end if;

  perform 1 from public.incidentes where id = incidente for update;
  -- Se vuelve a revisar ya con la brigada apartada, por si cambió mientras tanto
  perform 1 from public.brigadas where id = p_brigada_id and incidente_id = incidente for update;
  if not found then
    raise exception 'TRANSICION_INVALIDA';
  end if;

  update public.brigadas
  set estado = 'disponible', incidente_id = null, actualizado_en = now()
  where id = p_brigada_id;

  update public.incidentes
  set estado = 'pendiente', actualizado_en = now()
  where id = incidente and estado in ('asignado', 'en_atencion');

  update public.asignaciones
  set terminado_en = now(), resultado = 'liberada'
  where brigada_id = p_brigada_id and terminado_en is null;
end;
$$;

-- ---------------------------------------------------------------------------
-- Funciones del coordinador: brigadas y miembros
-- ---------------------------------------------------------------------------
-- Crea (p_id nulo) o edita una brigada. Devuelve su id.
create function public.guardar_brigada(
  p_id bigint,
  p_nombre text,
  p_vehiculo text,
  p_longitud double precision,
  p_latitud double precision
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  resultado bigint;
begin
  perform public.exigir_coordinador();
  begin
    if p_id is null then
      insert into public.brigadas (nombre, vehiculo, base)
      values (btrim(p_nombre), nullif(btrim(p_vehiculo), ''), public.punto_en_mexico(p_longitud, p_latitud))
      returning id into resultado;
    else
      update public.brigadas
      set nombre = btrim(p_nombre),
          vehiculo = nullif(btrim(p_vehiculo), ''),
          base = public.punto_en_mexico(p_longitud, p_latitud),
          actualizado_en = now()
      where id = p_id
      returning id into resultado;
      if resultado is null then
        raise exception 'BRIGADA_NO_EXISTE';
      end if;
    end if;
  exception when unique_violation then
    raise exception 'NOMBRE_REPETIDO';
  end;
  return resultado;
end;
$$;

-- En servicio = disponible; fuera de servicio = no se le sugiere ni asigna nada
create function public.cambiar_servicio_brigada(p_id bigint, p_en_servicio boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  incidente bigint;
begin
  perform public.exigir_coordinador();
  select incidente_id into incidente from public.brigadas where id = p_id for update;
  if not found then
    raise exception 'BRIGADA_NO_EXISTE';
  end if;
  if incidente is not null then
    raise exception 'BRIGADA_OCUPADA';
  end if;
  update public.brigadas
  set estado = case when p_en_servicio then 'disponible' else 'fuera_de_servicio' end,
      actualizado_en = now()
  where id = p_id;
end;
$$;

-- Mete (o saca, con p_brigada_id nulo) a un brigadista de una brigada
create function public.asignar_miembro(p_usuario_id uuid, p_brigada_id bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.exigir_coordinador();
  if p_brigada_id is not null and not exists (select 1 from public.brigadas where id = p_brigada_id) then
    raise exception 'BRIGADA_NO_EXISTE';
  end if;
  update public.perfiles
  set brigada_id = p_brigada_id
  where id = p_usuario_id and rol = 'brigadista';
  if not found then
    raise exception 'NO_ES_BRIGADISTA';
  end if;
end;
$$;

-- Lista de cuentas brigadistas con su correo (lee auth.users, solo coordinador)
create function public.brigadistas()
returns table (id uuid, correo text, nombre text, brigada_id bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.exigir_coordinador();
  return query
    select p.id, u.email::text, p.nombre, p.brigada_id
    from public.perfiles p
    join auth.users u on u.id = p.id
    where p.rol = 'brigadista'
    order by u.email;
end;
$$;

-- ---------------------------------------------------------------------------
-- Funciones del brigadista
-- ---------------------------------------------------------------------------
-- Mi brigada y, si tiene, su incidente activo. Sin brigada: no devuelve renglones.
create function public.mi_asignacion()
returns table (
  brigada_id bigint,
  brigada_nombre text,
  brigada_estado text,
  base_longitud double precision,
  base_latitud double precision,
  incidente_id bigint,
  tipo text,
  prioridad smallint,
  descripcion text,
  incidente_estado text,
  incidente_longitud double precision,
  incidente_latitud double precision,
  asignado_en timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    b.id,
    b.nombre,
    b.estado,
    extensions.st_x(b.base::extensions.geometry),
    extensions.st_y(b.base::extensions.geometry),
    i.id,
    i.tipo,
    i.prioridad,
    i.descripcion,
    i.estado,
    extensions.st_x(i.ubicacion::extensions.geometry),
    extensions.st_y(i.ubicacion::extensions.geometry),
    a.asignado_en
  from public.brigadas b
  left join public.incidentes i on i.id = b.incidente_id
  left join public.asignaciones a on a.brigada_id = b.id and a.terminado_en is null
  where b.id = public.mi_brigada_id();
$$;

-- Avanza la asignación de MI brigada, solo en orden:
-- asignada → en_camino → en_sitio → terminado
create function public.avanzar_asignacion(p_estado text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  brigada bigint := public.mi_brigada_id();
  incidente bigint;
  estado_actual text;
begin
  if auth.uid() is null or public.rol_actual() <> 'brigadista' then
    raise exception 'SIN_PERMISO';
  end if;
  if brigada is null then
    raise exception 'SIN_BRIGADA';
  end if;

  select incidente_id into incidente from public.brigadas where id = brigada;
  if incidente is null then
    raise exception 'TRANSICION_INVALIDA';
  end if;

  -- Mismo orden de bloqueo que las demás funciones: incidente y luego brigada
  perform 1 from public.incidentes where id = incidente for update;
  select estado into estado_actual from public.brigadas
  where id = brigada and incidente_id = incidente
  for update;
  if estado_actual is null then
    raise exception 'TRANSICION_INVALIDA';
  end if;

  if p_estado = 'en_camino' and estado_actual = 'asignada' then
    update public.brigadas set estado = 'en_camino', actualizado_en = now() where id = brigada;
  elsif p_estado = 'en_sitio' and estado_actual = 'en_camino' then
    update public.brigadas set estado = 'en_sitio', actualizado_en = now() where id = brigada;
    update public.incidentes set estado = 'en_atencion', actualizado_en = now() where id = incidente;
  elsif p_estado = 'terminado' and estado_actual = 'en_sitio' then
    update public.brigadas
    set estado = 'disponible', incidente_id = null, actualizado_en = now()
    where id = brigada;
    update public.incidentes set estado = 'atendido', actualizado_en = now() where id = incidente;
    update public.asignaciones
    set terminado_en = now(), resultado = 'atendido'
    where brigada_id = brigada and terminado_en is null;
  else
    raise exception 'TRANSICION_INVALIDA';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Permisos de las funciones
-- ---------------------------------------------------------------------------
-- Ayudantes internos: nadie los llama desde la app
revoke execute on function public.exigir_coordinador() from public, anon, authenticated;
revoke execute on function public.punto_en_mexico(double precision, double precision) from public, anon, authenticated;

-- Ayudantes que usan las políticas y las vistas (no revelan nada a quien no es personal)
revoke execute on function public.es_personal() from public;
revoke execute on function public.mi_brigada_id() from public;
revoke execute on function public.contar_miembros(bigint) from public;
grant execute on function public.es_personal() to anon, authenticated;
grant execute on function public.mi_brigada_id() to anon, authenticated;
grant execute on function public.contar_miembros(bigint) to anon, authenticated;

-- Funciones de la app: solo con sesión (cada una revisa el rol)
revoke execute on function public.crear_incidente(double precision, double precision, text, integer, text, bigint) from public, anon;
revoke execute on function public.actualizar_incidente(bigint, integer, text) from public, anon;
revoke execute on function public.cancelar_incidente(bigint) from public, anon;
revoke execute on function public.asignar_brigada(bigint, bigint) from public, anon;
revoke execute on function public.liberar_brigada(bigint) from public, anon;
revoke execute on function public.guardar_brigada(bigint, text, text, double precision, double precision) from public, anon;
revoke execute on function public.cambiar_servicio_brigada(bigint, boolean) from public, anon;
revoke execute on function public.asignar_miembro(uuid, bigint) from public, anon;
revoke execute on function public.brigadistas() from public, anon;
revoke execute on function public.mi_asignacion() from public, anon;
revoke execute on function public.avanzar_asignacion(text) from public, anon;

grant execute on function public.crear_incidente(double precision, double precision, text, integer, text, bigint) to authenticated;
grant execute on function public.actualizar_incidente(bigint, integer, text) to authenticated;
grant execute on function public.cancelar_incidente(bigint) to authenticated;
grant execute on function public.asignar_brigada(bigint, bigint) to authenticated;
grant execute on function public.liberar_brigada(bigint) to authenticated;
grant execute on function public.guardar_brigada(bigint, text, text, double precision, double precision) to authenticated;
grant execute on function public.cambiar_servicio_brigada(bigint, boolean) to authenticated;
grant execute on function public.asignar_miembro(uuid, bigint) to authenticated;
grant execute on function public.brigadistas() to authenticated;
grant execute on function public.mi_asignacion() to authenticated;
grant execute on function public.avanzar_asignacion(text) to authenticated;

-- ---------------------------------------------------------------------------
-- Tiempo real: canal PRIVADO "brigadas-cambios". Solo brigadistas y coordinadores
-- pueden escucharlo; nadie puede enviar desde la app (solo el servidor).
-- El aviso solo dice qué tabla cambió; la app vuelve a pedir las vistas.
-- ---------------------------------------------------------------------------
create policy "Personal escucha avisos de brigadas"
  on realtime.messages for select
  to authenticated
  using (
    (select realtime.topic()) = 'brigadas-cambios'
    and realtime.messages.extension = 'broadcast'
    and (select public.es_personal())
  );

create function public.avisar_cambio_brigadas()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform realtime.send(
    jsonb_build_object('tabla', tg_table_name, 'operacion', tg_op),
    'cambio',
    'brigadas-cambios',
    true
  );
  return null;
end;
$$;

revoke execute on function public.avisar_cambio_brigadas() from public, anon, authenticated;

-- Un aviso por instrucción (no por renglón): asignar cambia varias filas y basta un aviso
create trigger despues_de_cambiar_incidentes
  after insert or update or delete on public.incidentes
  for each statement execute function public.avisar_cambio_brigadas();

create trigger despues_de_cambiar_brigadas
  after insert or update or delete on public.brigadas
  for each statement execute function public.avisar_cambio_brigadas();

-- Si el coordinador mete o saca a un brigadista, su pantalla "Mi brigada" cambia
create trigger despues_de_cambiar_miembros
  after update of brigada_id on public.perfiles
  for each statement execute function public.avisar_cambio_brigadas();
