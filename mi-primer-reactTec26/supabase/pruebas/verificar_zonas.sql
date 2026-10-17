-- Verificación de seguridad de la etapa 4 (zonas de peligro y límite de rutas).
--
-- Cómo usarlo: pega TODO el archivo en el SQL Editor de Supabase y ejecútalo
-- DESPUÉS de aplicar la migración 6. Si el editor pregunta por RLS en tablas nuevas,
-- elige "Run without RLS" (son tablas temporales del script).
--
-- El script TERMINA A PROPÓSITO CON UN ERROR que trae el resumen, por ejemplo:
--   ERROR: RESULTADO: 20 de 20 casos OK
-- El error deshace todo: no queda ningún usuario ni zona de prueba.

begin;

-- ---------------------------------------------------------------------------
-- Ayudantes (solo existen durante este script)
-- ---------------------------------------------------------------------------
create temp table resultados (caso text, ok boolean, detalle text);
create temp table ids (nombre text primary key, id bigint);
grant insert, select on resultados, ids to authenticated, anon;

create function pg_temp.anotar(p_caso text, p_ok boolean, p_detalle text default null)
returns void language sql as $$
  insert into resultados values (p_caso, coalesce(p_ok, false), p_detalle);
$$;

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

create function pg_temp.id(p_nombre text)
returns bigint language sql as $$
  select id from ids where nombre = p_nombre;
$$;

-- Cuadrado de ~550 m de lado en Guadalajara, en GeoJSON [longitud, latitud]
create function pg_temp.cuadrado(p_lng double precision, p_lat double precision, p_lado double precision default 0.005)
returns text language sql as $$
  select json_build_object(
    'type', 'Polygon',
    'coordinates', json_build_array(json_build_array(
      json_build_array(p_lng, p_lat),
      json_build_array(p_lng + p_lado, p_lat),
      json_build_array(p_lng + p_lado, p_lat + p_lado),
      json_build_array(p_lng, p_lat + p_lado),
      json_build_array(p_lng, p_lat)
    ))
  )::text;
$$;

grant execute on function pg_temp.anotar(text, boolean, text) to anon, authenticated;
grant execute on function pg_temp.como(uuid, boolean) to anon, authenticated;
grant execute on function pg_temp.debe_fallar(text, text, text) to anon, authenticated;
grant execute on function pg_temp.id(text) to anon, authenticated;
grant execute on function pg_temp.cuadrado(double precision, double precision, double precision) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Usuarios de prueba: CO coordinador · CI ciudadano · AN anónimo
-- ---------------------------------------------------------------------------
insert into auth.users (id, email, is_anonymous) values
  ('00000000-0000-0000-0000-0000000004c1', 'coordinador4@prueba.local', false),
  ('00000000-0000-0000-0000-0000000004a1', 'ciudadano4@prueba.local', false),
  ('00000000-0000-0000-0000-0000000004a2', null, true);
update public.perfiles set rol = 'coordinador' where id = '00000000-0000-0000-0000-0000000004c1';

-- ---------------------------------------------------------------------------
-- Coordinador
-- ---------------------------------------------------------------------------
select pg_temp.como('00000000-0000-0000-0000-0000000004c1');

insert into ids values
  ('Z1', public.crear_zona_peligro(pg_temp.cuadrado(-103.35, 20.67), 1, '  Fuga de gas  ')),
  ('Z2', public.crear_zona_peligro(pg_temp.cuadrado(-103.40, 20.70), 2, null, now() + interval '6 hours'));
select pg_temp.anotar('1. El coordinador crea zonas y salen en la vista como GeoJSON [lng, lat]',
  exists (select 1 from public.zonas_peligro_vista
          where id = pg_temp.id('Z1') and severidad = 1 and descripcion = 'Fuga de gas'
            and geojson like '%[-103.35,20.67]%')
  and exists (select 1 from public.zonas_peligro_vista where id = pg_temp.id('Z2') and severidad = 2));

select pg_temp.debe_fallar('2. Polígono que se cruza a sí mismo (moño)',
  $q$ select public.crear_zona_peligro('{"type":"Polygon","coordinates":[[[-103.35,20.67],[-103.34,20.68],[-103.34,20.67],[-103.35,20.68],[-103.35,20.67]]]}') $q$,
  'ZONA_INVALIDA');
select pg_temp.debe_fallar('3. Texto que no es GeoJSON',
  $q$ select public.crear_zona_peligro('esto no es geojson') $q$, 'ZONA_INVALIDA');
select pg_temp.debe_fallar('4. Una línea no es una zona',
  $q$ select public.crear_zona_peligro('{"type":"LineString","coordinates":[[-103.35,20.67],[-103.34,20.68]]}') $q$,
  'ZONA_INVALIDA');
select pg_temp.debe_fallar('5. Zona fuera de México',
  $q$ select public.crear_zona_peligro(pg_temp.cuadrado(-3.70, 40.40)) $q$, 'FUERA_DE_MEXICO');
select pg_temp.debe_fallar('6. Zona de más de 20 km²',
  $q$ select public.crear_zona_peligro(pg_temp.cuadrado(-103.40, 20.60, 0.1)) $q$, 'ZONA_GRANDE');
select pg_temp.debe_fallar('7. Vencimiento en el pasado',
  $q$ select public.crear_zona_peligro(pg_temp.cuadrado(-103.30, 20.60), 1, null, now() - interval '1 hour') $q$,
  'ZONA_INVALIDA');
select pg_temp.debe_fallar('8. Severidad que no existe',
  $q$ select public.crear_zona_peligro(pg_temp.cuadrado(-103.30, 20.60), 3) $q$, 'zonas_peligro_severidad_check');

-- ---------------------------------------------------------------------------
-- Ciudadanos y visitantes: ven las zonas, no las cambian
-- ---------------------------------------------------------------------------
select pg_temp.como('00000000-0000-0000-0000-0000000004a1');
select pg_temp.anotar('9. Un ciudadano ve las zonas',
  (select count(*) from public.zonas_peligro_vista where id in (pg_temp.id('Z1'), pg_temp.id('Z2'))) = 2);
select pg_temp.debe_fallar('10. Un ciudadano no puede crear zonas',
  $q$ select public.crear_zona_peligro(pg_temp.cuadrado(-103.30, 20.60)) $q$, 'SIN_PERMISO');
select pg_temp.debe_fallar('11. Un ciudadano no puede desactivar zonas',
  $q$ select public.desactivar_zona_peligro(pg_temp.id('Z1')) $q$, 'SIN_PERMISO');
-- Escribir directo en la tabla tampoco se puede (sin permiso de update)
select pg_temp.debe_fallar('11b. Un ciudadano no puede cambiar la tabla directamente',
  $q$ update public.zonas_peligro set activa = false where id = pg_temp.id('Z1') $q$, 'permission denied');

select pg_temp.como(null);
select pg_temp.anotar('12. Sin sesión también se ven las zonas',
  exists (select 1 from public.zonas_peligro_vista where id = pg_temp.id('Z1')));
select pg_temp.debe_fallar('13. Sin sesión no se pueden crear zonas',
  $q$ select public.crear_zona_peligro(pg_temp.cuadrado(-103.30, 20.60)) $q$, 'permission denied');

-- ---------------------------------------------------------------------------
-- Desactivar y vencer
-- ---------------------------------------------------------------------------
select pg_temp.como('00000000-0000-0000-0000-0000000004c1');
select public.desactivar_zona_peligro(pg_temp.id('Z1'));
select pg_temp.anotar('14. Una zona desactivada desaparece de la vista',
  not exists (select 1 from public.zonas_peligro_vista where id = pg_temp.id('Z1')));
select pg_temp.debe_fallar('15. Desactivar dos veces',
  $q$ select public.desactivar_zona_peligro(pg_temp.id('Z1')) $q$, 'ZONA_NO_EXISTE');

reset role;
update public.zonas_peligro set expira_en = now() - interval '1 minute' where id = pg_temp.id('Z2');
select pg_temp.como('00000000-0000-0000-0000-0000000004a1');
select pg_temp.anotar('16. Una zona vencida desaparece de la vista',
  not exists (select 1 from public.zonas_peligro_vista where id = pg_temp.id('Z2')));

-- ---------------------------------------------------------------------------
-- Límite de consultas de ruta (sesión anónima)
-- ---------------------------------------------------------------------------
select pg_temp.como('00000000-0000-0000-0000-0000000004a2', true);
select public.registrar_consulta_ruta() from generate_series(1, 20);
select pg_temp.debe_fallar('17. La consulta 21 en una hora se rechaza',
  $q$ select public.registrar_consulta_ruta() $q$, 'LIMITE_RUTAS');
select pg_temp.debe_fallar('18. Nadie puede leer las consultas de ruta',
  $q$ select count(*) from public.consultas_ruta $q$, 'permission denied');

select pg_temp.como(null);
select pg_temp.debe_fallar('19. Sin sesión no se puede pedir una ruta',
  $q$ select public.registrar_consulta_ruta() $q$, 'permission denied');

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
