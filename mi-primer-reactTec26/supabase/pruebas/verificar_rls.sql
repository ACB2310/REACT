-- Verificación de seguridad de la etapa 3 (RLS, permisos y reglas de bloqueos).
--
-- Cómo usarlo: pega TODO el archivo en el SQL Editor de Supabase y ejecútalo
-- DESPUÉS de aplicar las migraciones 1, 2 y 3.
--
-- El script TERMINA A PROPÓSITO CON UN ERROR que trae el resumen, por ejemplo:
--   ERROR: RESULTADO: 18 de 18 casos OK
-- El error deshace todo, así que no queda ningún usuario ni bloqueo de prueba.
-- Si algún caso falla, el mensaje dice cuáles.

begin;

-- ---------------------------------------------------------------------------
-- Ayudantes (solo existen durante este script, en el esquema temporal)
-- ---------------------------------------------------------------------------
create temp table resultados (caso text, ok boolean, detalle text);
grant insert, select on resultados to authenticated, anon;

-- Anota el resultado de un caso
create function pg_temp.anotar(p_caso text, p_ok boolean, p_detalle text default null)
returns void language sql as $$
  insert into resultados values (p_caso, p_ok, p_detalle);
$$;

-- Actúa como un usuario: rol de Postgres + datos del JWT que mandaría Supabase.
-- p_usuario nulo = visitante sin sesión (rol anon).
create function pg_temp.como(p_usuario uuid, p_anonimo boolean default false)
returns void language plpgsql as $$
begin
  if p_usuario is null then
    perform set_config('request.jwt.claims', '{"role":"anon"}', true);
    set local role anon;
  else
    perform set_config(
      'request.jwt.claims',
      json_build_object('sub', p_usuario, 'role', 'authenticated', 'is_anonymous', p_anonimo)::text,
      true
    );
    set local role authenticated;
  end if;
end;
$$;

-- Ejecuta una instrucción que DEBE fallar con un mensaje que contenga p_esperado
create function pg_temp.debe_fallar(p_caso text, p_sql text, p_esperado text)
returns void language plpgsql as $$
begin
  execute p_sql;
  perform pg_temp.anotar(p_caso, false, 'No falló y debía fallar con ' || p_esperado);
exception when others then
  perform pg_temp.anotar(
    p_caso,
    sqlerrm ilike '%' || p_esperado || '%',
    case when sqlerrm ilike '%' || p_esperado || '%' then null else 'Falló con otro error: ' || sqlerrm end
  );
end;
$$;

grant execute on function pg_temp.anotar(text, boolean, text) to anon, authenticated;
grant execute on function pg_temp.como(uuid, boolean) to anon, authenticated;
grant execute on function pg_temp.debe_fallar(text, text, text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Usuarios de prueba (se borran solos con el error final)
--   A y B: anónimos · C: ciudadano con cuenta · BR: brigadista · CO: coordinador
-- ---------------------------------------------------------------------------
insert into auth.users (id, email, is_anonymous) values
  ('00000000-0000-0000-0000-00000000000a', null, true),
  ('00000000-0000-0000-0000-00000000000b', null, true),
  ('00000000-0000-0000-0000-00000000000c', 'ciudadano@prueba.local', false),
  ('00000000-0000-0000-0000-0000000000b1', 'brigadista@prueba.local', false),
  ('00000000-0000-0000-0000-0000000000c1', 'coordinador@prueba.local', false);

update public.perfiles set rol = 'brigadista' where id = '00000000-0000-0000-0000-0000000000b1';
update public.perfiles set rol = 'coordinador' where id = '00000000-0000-0000-0000-0000000000c1';

-- Caso 0: los anónimos no tienen perfil; las cuentas sí, como ciudadano
select pg_temp.anotar(
  '0. Perfiles creados solo para cuentas',
  (select count(*) from public.perfiles where id::text like '00000000-0000-0000-0000-%') = 3
  and not exists (select 1 from public.perfiles where id = '00000000-0000-0000-0000-00000000000a')
);

-- Un refugio de prueba
insert into public.refugios (nombre, fuente) values ('Refugio de prueba', 'Prueba');

-- ---------------------------------------------------------------------------
-- Casos como el usuario anónimo A
-- ---------------------------------------------------------------------------
select pg_temp.como('00000000-0000-0000-0000-00000000000a', true);

-- Caso 1: reporta en Guadalajara y lo ve como suyo y anónimo
select public.reportar_bloqueo(-103.35, 20.67, 'total', '  Árbol caído  ');
select pg_temp.anotar(
  '1. Anónimo reporta y lo ve como suyo',
  exists (
    select 1 from public.bloqueos_vista
    where es_mio and es_anonimo and not confirmado
      and longitud = -103.35 and latitud = 20.67 and descripcion = 'Árbol caído'
  )
);

-- Caso 2: un insert directo no puede saltarse las reglas del servidor
insert into public.bloqueos (geometria, tipo, expira_en, confirmado, reportado_por)
values (
  extensions.st_setsrid(extensions.st_makepoint(-103.36, 20.68), 4326)::extensions.geography,
  'solo_vehiculos', now() + interval '365 days', true, '00000000-0000-0000-0000-00000000000b'
);
select pg_temp.anotar(
  '2. El servidor fija vencimiento, confirmado y quién reportó',
  not exists (
    select 1 from public.bloqueos_vista
    where longitud = -103.36 and (expira_en > now() + interval '24 hours' or confirmado or not es_mio)
  )
);

-- Caso 3: fuera de México, y con las coordenadas invertidas
select pg_temp.debe_fallar('3a. Madrid queda fuera de México',
  $q$ select public.reportar_bloqueo(-3.7, 40.4, 'total') $q$, 'FUERA_DE_MEXICO');
select pg_temp.debe_fallar('3b. Guadalajara con lat/lon invertidos queda fuera',
  $q$ select public.reportar_bloqueo(20.67, -103.35, 'total') $q$, 'FUERA_DE_MEXICO');

-- Caso 5: tipo inválido (antes del caso 4: con el límite lleno saldría LIMITE_REPORTES)
select pg_temp.debe_fallar('5. Tipo de bloqueo inválido',
  $q$ select public.reportar_bloqueo(-103.35, 20.67, 'medio') $q$, 'bloqueos_tipo_check');

-- Caso 4: límite de 5 reportes por hora (ya lleva 2)
select public.reportar_bloqueo(-103.30, 20.60, 'total');
select public.reportar_bloqueo(-103.31, 20.61, 'total');
select public.reportar_bloqueo(-103.32, 20.62, 'total');
select pg_temp.debe_fallar('4. El sexto reporte en una hora se rechaza',
  $q$ select public.reportar_bloqueo(-103.33, 20.63, 'total') $q$, 'LIMITE_REPORTES');

-- ---------------------------------------------------------------------------
-- Casos como el usuario anónimo B (no reportó el bloqueo de A)
-- ---------------------------------------------------------------------------
reset role;
create temp table bloqueo_de_a as
  select id from public.bloqueos where descripcion = 'Árbol caído';
grant select on bloqueo_de_a to authenticated, anon;

select pg_temp.como('00000000-0000-0000-0000-00000000000b', true);

select pg_temp.debe_fallar('6a. B no puede renovar el bloqueo de A',
  $q$ select public.renovar_bloqueo((select id from bloqueo_de_a)) $q$, 'SIN_PERMISO');
select pg_temp.debe_fallar('6b. B no puede eliminar el bloqueo de A',
  $q$ select public.eliminar_bloqueo((select id from bloqueo_de_a)) $q$, 'SIN_PERMISO');

-- Caso 7: tampoco puede cambiarlo ni borrarlo directo en la tabla
update public.bloqueos set tipo = 'solo_vehiculos' where id = (select id from bloqueo_de_a);
delete from public.bloqueos where id = (select id from bloqueo_de_a);
reset role;
select pg_temp.anotar(
  '7. Update y delete directos no hacen nada',
  exists (select 1 from public.bloqueos where id = (select id from bloqueo_de_a) and tipo = 'total')
);

-- ---------------------------------------------------------------------------
-- A renueva el suyo; el brigadista puede con bloqueos ajenos
-- ---------------------------------------------------------------------------
select pg_temp.como('00000000-0000-0000-0000-00000000000a', true);
select pg_temp.anotar(
  '8. Quien reportó puede renovar',
  public.renovar_bloqueo((select id from bloqueo_de_a)) > now()
);

select pg_temp.como('00000000-0000-0000-0000-0000000000b1');
select public.eliminar_bloqueo((select id from bloqueo_de_a));
reset role;
select pg_temp.anotar(
  '9. El brigadista elimina un bloqueo ajeno',
  not exists (select 1 from public.bloqueos where id = (select id from bloqueo_de_a))
);

-- ---------------------------------------------------------------------------
-- Bloqueos vencidos: nadie los ve
-- ---------------------------------------------------------------------------
update public.bloqueos set expira_en = now() - interval '1 minute'
where reportado_por = '00000000-0000-0000-0000-00000000000a';

select pg_temp.como(null);
select pg_temp.anotar('10a. Sin sesión no se ven bloqueos vencidos',
  not exists (select 1 from public.bloqueos_vista where longitud between -103.40 and -103.29));
select pg_temp.como('00000000-0000-0000-0000-0000000000c1');
select pg_temp.anotar('10b. El coordinador tampoco ve vencidos',
  not exists (select 1 from public.bloqueos where reportado_por = '00000000-0000-0000-0000-00000000000a'));

-- ---------------------------------------------------------------------------
-- Roles y refugios
-- ---------------------------------------------------------------------------
select pg_temp.como('00000000-0000-0000-0000-00000000000c');
update public.perfiles set rol = 'coordinador' where id = '00000000-0000-0000-0000-00000000000c';
reset role;
select pg_temp.anotar('11. Un ciudadano no puede cambiarse el rol',
  (select rol from public.perfiles where id = '00000000-0000-0000-0000-00000000000c') = 'ciudadano');

select pg_temp.como('00000000-0000-0000-0000-00000000000c');
select pg_temp.debe_fallar('12. Un ciudadano no puede editar refugios',
  $q$ select public.actualizar_refugio((select id from public.refugios where nombre = 'Refugio de prueba'), -103.35, 20.67, 'lleno', 10) $q$,
  'SIN_PERMISO');

select pg_temp.como('00000000-0000-0000-0000-0000000000c1');
select public.actualizar_refugio((select id from public.refugios where nombre = 'Refugio de prueba'), -103.35, 20.67, 'lleno', 10);
select pg_temp.anotar('13. El coordinador ubica un refugio en [longitud, latitud]',
  exists (select 1 from public.refugios_vista
          where nombre = 'Refugio de prueba' and longitud = -103.35 and latitud = 20.67 and estado = 'lleno'));

-- Caso 14: sin sesión no se puede reportar
select pg_temp.como(null);
select pg_temp.debe_fallar('14. Sin sesión no se puede reportar',
  $q$ select public.reportar_bloqueo(-103.35, 20.67, 'total') $q$, 'permission denied');

-- ---------------------------------------------------------------------------
-- Resumen. Este error es a propósito: deshace todo lo de arriba.
-- ---------------------------------------------------------------------------
reset role;
do $$
declare
  total integer;
  buenos integer;
  fallas text;
begin
  select count(*), count(*) filter (where ok) into total, buenos from resultados;
  select string_agg(caso || coalesce(' → ' || detalle, ''), E'\n' order by caso)
    into fallas from resultados where not ok;
  raise exception 'RESULTADO: % de % casos OK%', buenos, total,
    coalesce(E'\nFALLARON:\n' || fallas, '');
end;
$$;
