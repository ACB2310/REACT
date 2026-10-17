-- Verificación de seguridad de la etapa 6 (brigadas, incidentes y asignaciones).
--
-- Cómo usarlo: pega TODO el archivo en el SQL Editor de Supabase y ejecútalo
-- DESPUÉS de aplicar la migración 5. Si el editor pregunta por RLS en tablas nuevas,
-- elige "Run without RLS" (son tablas temporales del script).
--
-- El script TERMINA A PROPÓSITO CON UN ERROR que trae el resumen, por ejemplo:
--   ERROR: RESULTADO: 34 de 34 casos OK
-- El error deshace todo: no queda ningún usuario, brigada ni incidente de prueba.

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

-- Actúa como un usuario. p_usuario nulo = visitante sin sesión (rol anon).
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

-- Id guardado por nombre ('I1', 'A', ...)
create function pg_temp.id(p_nombre text)
returns bigint language sql as $$
  select id from ids where nombre = p_nombre;
$$;

grant execute on function pg_temp.anotar(text, boolean, text) to anon, authenticated;
grant execute on function pg_temp.como(uuid, boolean) to anon, authenticated;
grant execute on function pg_temp.debe_fallar(text, text, text) to anon, authenticated;
grant execute on function pg_temp.id(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Usuarios de prueba
--   CO: coordinador · B1, B2, B3: brigadistas · CI: ciudadano · AN: anónimo
-- ---------------------------------------------------------------------------
insert into auth.users (id, email, is_anonymous) values
  ('00000000-0000-0000-0000-0000000006c1', 'coordinador6@prueba.local', false),
  ('00000000-0000-0000-0000-0000000006b1', 'brigadista1@prueba.local', false),
  ('00000000-0000-0000-0000-0000000006b2', 'brigadista2@prueba.local', false),
  ('00000000-0000-0000-0000-0000000006b3', 'brigadista3@prueba.local', false),
  ('00000000-0000-0000-0000-0000000006a1', 'ciudadano6@prueba.local', false),
  ('00000000-0000-0000-0000-0000000006a2', null, true);

update public.perfiles set rol = 'coordinador' where id = '00000000-0000-0000-0000-0000000006c1';
update public.perfiles set rol = 'brigadista'
where id in ('00000000-0000-0000-0000-0000000006b1', '00000000-0000-0000-0000-0000000006b2',
             '00000000-0000-0000-0000-0000000006b3');

-- ---------------------------------------------------------------------------
-- Coordinador: brigadas, miembros e incidentes
-- ---------------------------------------------------------------------------
select pg_temp.como('00000000-0000-0000-0000-0000000006c1');

insert into ids values
  ('A', public.guardar_brigada(null, 'Prueba Alfa', 'Pickup', -103.35, 20.67)),
  ('B', public.guardar_brigada(null, 'Prueba Bravo', null, -103.40, 20.70));
select pg_temp.anotar('1. El coordinador crea dos brigadas disponibles',
  (select count(*) from public.brigadas_vista
   where nombre like 'Prueba %' and estado = 'disponible' and longitud in (-103.35, -103.40)) = 2);

select pg_temp.debe_fallar('2. Nombre de brigada repetido',
  $q$ select public.guardar_brigada(null, 'Prueba Alfa', null, -103.3, 20.6) $q$, 'NOMBRE_REPETIDO');

select public.asignar_miembro('00000000-0000-0000-0000-0000000006b1', pg_temp.id('A'));
select public.asignar_miembro('00000000-0000-0000-0000-0000000006b2', pg_temp.id('B'));
select pg_temp.debe_fallar('3. Un ciudadano no puede ser miembro de una brigada',
  $q$ select public.asignar_miembro('00000000-0000-0000-0000-0000000006a1', pg_temp.id('A')) $q$,
  'NO_ES_BRIGADISTA');

select pg_temp.anotar('4. brigadistas() lista las 3 cuentas con su correo',
  (select count(*) from public.brigadistas() where correo like 'brigadista_@prueba.local') = 3);

insert into ids values
  ('I1', public.crear_incidente(-103.36, 20.68, 'rescate', 1, 'Persona atrapada')),
  ('I2', public.crear_incidente(-103.37, 20.69, 'derrumbe', 3)),
  ('I3', public.crear_incidente(-103.38, 20.66, 'incendio', 2));
select pg_temp.anotar('5. Incidentes creados en [longitud, latitud] y pendientes',
  exists (select 1 from public.incidentes_vista
          where id = pg_temp.id('I1') and longitud = -103.36 and latitud = 20.68
            and estado = 'pendiente' and prioridad = 1));

select pg_temp.debe_fallar('6. Incidente fuera de México',
  $q$ select public.crear_incidente(-3.7, 40.4, 'otro', 3) $q$, 'FUERA_DE_MEXICO');
select pg_temp.debe_fallar('7. Prioridad fuera de 1 a 5',
  $q$ select public.crear_incidente(-103.3, 20.6, 'otro', 9) $q$, 'incidentes_prioridad_check');

-- ---------------------------------------------------------------------------
-- Asignar sin duplicidades
-- ---------------------------------------------------------------------------
select public.asignar_brigada(pg_temp.id('I1'), pg_temp.id('A'));
select pg_temp.anotar('8. Asignar: brigada asignada, incidente asignado e historial abierto',
  exists (select 1 from public.brigadas_vista where id = pg_temp.id('A') and estado = 'asignada'
          and incidente_id = pg_temp.id('I1'))
  and exists (select 1 from public.incidentes_vista where id = pg_temp.id('I1') and estado = 'asignado'
              and brigada_nombre = 'Prueba Alfa')
  and (select count(*) from public.asignaciones where incidente_id = pg_temp.id('I1') and terminado_en is null) = 1);

select pg_temp.debe_fallar('9. Una brigada ocupada no recibe otro incidente',
  $q$ select public.asignar_brigada(pg_temp.id('I2'), pg_temp.id('A')) $q$, 'BRIGADA_OCUPADA');
select pg_temp.debe_fallar('10. Un incidente asignado no recibe otra brigada',
  $q$ select public.asignar_brigada(pg_temp.id('I1'), pg_temp.id('B')) $q$, 'INCIDENTE_ASIGNADO');

-- Aunque alguien se saltara las funciones, la base de datos lo impide
reset role;
select pg_temp.debe_fallar('11. El índice único impide dos brigadas en un incidente',
  $q$ update public.brigadas set estado = 'asignada', incidente_id = pg_temp.id('I1')
      where id = pg_temp.id('B') $q$,
  'brigadas_incidente_unico');
select pg_temp.debe_fallar('12. Una brigada no puede quedar asignada sin incidente',
  $q$ update public.brigadas set estado = 'en_camino', incidente_id = null where id = pg_temp.id('B') $q$,
  'brigadas_estado_coherente');

-- ---------------------------------------------------------------------------
-- Brigadistas
-- ---------------------------------------------------------------------------
-- B2 (brigada Bravo, sin incidente) no puede mover la asignación de Alfa
select pg_temp.como('00000000-0000-0000-0000-0000000006b2');
select pg_temp.debe_fallar('13. Una brigada sin incidente no puede avanzar',
  $q$ select public.avanzar_asignacion('en_camino') $q$, 'TRANSICION_INVALIDA');
select pg_temp.anotar('14. B2 ve su brigada sin incidente en mi_asignacion()',
  (select count(*) from public.mi_asignacion() where brigada_nombre = 'Prueba Bravo' and incidente_id is null) = 1);

-- B3 no pertenece a ninguna brigada
select pg_temp.como('00000000-0000-0000-0000-0000000006b3');
select pg_temp.debe_fallar('15. Un brigadista sin brigada no puede avanzar',
  $q$ select public.avanzar_asignacion('en_camino') $q$, 'SIN_BRIGADA');
select pg_temp.anotar('16. Sin brigada, mi_asignacion() no devuelve nada',
  not exists (select 1 from public.mi_asignacion()));

-- B1 (brigada Alfa, con I1)
select pg_temp.como('00000000-0000-0000-0000-0000000006b1');
select pg_temp.anotar('17. B1 ve su incidente en mi_asignacion() y su brigada como suya',
  exists (select 1 from public.mi_asignacion()
          where incidente_id = pg_temp.id('I1') and tipo = 'rescate'
            and incidente_longitud = -103.36 and incidente_latitud = 20.68)
  and exists (select 1 from public.brigadas_vista where id = pg_temp.id('A') and es_mia and miembros = 1));
select pg_temp.debe_fallar('18. No se puede saltar de asignada a terminado',
  $q$ select public.avanzar_asignacion('terminado') $q$, 'TRANSICION_INVALIDA');

select public.avanzar_asignacion('en_camino');
select public.avanzar_asignacion('en_sitio');
select pg_temp.anotar('19. En el lugar: el incidente pasa a en_atencion',
  exists (select 1 from public.incidentes_vista where id = pg_temp.id('I1') and estado = 'en_atencion'));
select public.avanzar_asignacion('terminado');

select pg_temp.debe_fallar('20. Un brigadista no puede crear incidentes',
  $q$ select public.crear_incidente(-103.3, 20.6, 'otro', 3) $q$, 'SIN_PERMISO');
select pg_temp.debe_fallar('21. Un brigadista no puede crear brigadas',
  $q$ select public.guardar_brigada(null, 'Prueba Charlie', null, -103.3, 20.6) $q$, 'SIN_PERMISO');
select pg_temp.debe_fallar('22. Un brigadista no puede cambiarse de brigada',
  $q$ select public.asignar_miembro('00000000-0000-0000-0000-0000000006b1', pg_temp.id('B')) $q$, 'SIN_PERMISO');
select pg_temp.debe_fallar('23. Un brigadista no ve la lista de cuentas',
  $q$ select * from public.brigadistas() $q$, 'SIN_PERMISO');

reset role;
select pg_temp.anotar('24. Terminado: incidente atendido, brigada disponible e historial cerrado',
  (select estado from public.incidentes where id = pg_temp.id('I1')) = 'atendido'
  and (select estado = 'disponible' and incidente_id is null from public.brigadas where id = pg_temp.id('A'))
  and (select resultado from public.asignaciones where incidente_id = pg_temp.id('I1')) = 'atendido');

-- ---------------------------------------------------------------------------
-- Cancelar, liberar y fuera de servicio
-- ---------------------------------------------------------------------------
select pg_temp.como('00000000-0000-0000-0000-0000000006c1');
select public.asignar_brigada(pg_temp.id('I2'), pg_temp.id('B'));
select public.cancelar_incidente(pg_temp.id('I2'));
select pg_temp.anotar('25. Cancelar un incidente libera su brigada y cierra el historial',
  (select estado from public.brigadas where id = pg_temp.id('B')) = 'disponible'
  and (select resultado from public.asignaciones where incidente_id = pg_temp.id('I2')) = 'cancelado'
  and not exists (select 1 from public.incidentes_vista where id = pg_temp.id('I2')));

select public.asignar_brigada(pg_temp.id('I3'), pg_temp.id('A'));
select pg_temp.debe_fallar('26. No se pone fuera de servicio una brigada ocupada',
  $q$ select public.cambiar_servicio_brigada(pg_temp.id('A'), false) $q$, 'BRIGADA_OCUPADA');
select public.liberar_brigada(pg_temp.id('A'));
select pg_temp.anotar('27. Liberar: el incidente vuelve a pendiente y el historial dice liberada',
  (select estado from public.incidentes where id = pg_temp.id('I3')) = 'pendiente'
  and (select resultado from public.asignaciones where incidente_id = pg_temp.id('I3')) = 'liberada');

select public.cambiar_servicio_brigada(pg_temp.id('B'), false);
select pg_temp.debe_fallar('28. A una brigada fuera de servicio no se le asigna nada',
  $q$ select public.asignar_brigada(pg_temp.id('I3'), pg_temp.id('B')) $q$, 'BRIGADA_OCUPADA');

-- ---------------------------------------------------------------------------
-- Ciudadanos y visitantes no ven nada
-- ---------------------------------------------------------------------------
select pg_temp.como('00000000-0000-0000-0000-0000000006a1');
select pg_temp.anotar('29a. Un ciudadano no ve incidentes ni brigadas',
  not exists (select 1 from public.incidentes_vista) and not exists (select 1 from public.brigadas_vista)
  and not exists (select 1 from public.asignaciones));
select pg_temp.debe_fallar('29b. Un ciudadano no puede crear incidentes',
  $q$ select public.crear_incidente(-103.3, 20.6, 'otro', 3) $q$, 'SIN_PERMISO');

select pg_temp.como('00000000-0000-0000-0000-0000000006a2', true);
select pg_temp.anotar('29c. Una sesión anónima no ve incidentes ni brigadas',
  not exists (select 1 from public.incidentes_vista) and not exists (select 1 from public.brigadas_vista));
select pg_temp.debe_fallar('29d. Una sesión anónima no puede asignar',
  $q$ select public.asignar_brigada(pg_temp.id('I3'), pg_temp.id('A')) $q$, 'SIN_PERMISO');

select pg_temp.como(null);
select pg_temp.anotar('30a. Sin sesión no se ven incidentes ni brigadas',
  not exists (select 1 from public.incidentes_vista) and not exists (select 1 from public.brigadas_vista));
select pg_temp.debe_fallar('30b. Sin sesión no se puede crear un incidente',
  $q$ select public.crear_incidente(-103.3, 20.6, 'otro', 3) $q$, 'permission denied');

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
