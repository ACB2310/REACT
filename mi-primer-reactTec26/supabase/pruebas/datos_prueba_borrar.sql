-- Borra los refugios de prueba que cargó datos_prueba_cargar.sql.
-- Solo toca los que tienen clave PRUEBA-… y la fuente de datos de prueba:
-- los refugios de la lista oficial no se tocan.
--
-- Cómo usarlo: Supabase → SQL Editor → pega todo → Run.

delete from public.refugios
where clave_oficial like 'PRUEBA-%'
  and fuente = 'DATOS DE PRUEBA — NO ES UN REFUGIO REAL';

-- Debe salir 0
select count(*) as refugios_de_prueba_que_quedan
from public.refugios
where clave_oficial like 'PRUEBA-%';
