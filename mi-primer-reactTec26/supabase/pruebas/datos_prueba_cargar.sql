-- ⚠️ DATOS DE PRUEBA — NO SON REFUGIOS REALES ⚠️
--
-- Refugios inventados en León y Purísima del Rincón (Guanajuato) para probar la ruta
-- al refugio mientras llega la lista oficial de Protección Civil.
-- - Todos se llaman "[PRUEBA] …", su clave empieza con PRUEBA- y su fuente lo dice.
-- - Cualquiera que abra la app los ve: BÓRRALOS antes de mostrarla a usuarios reales
--   con supabase/pruebas/datos_prueba_borrar.sql.
-- - Las ubicaciones son puntos de la ciudad elegidos solo para probar; no son
--   edificios designados como refugio.
--
-- Cómo usarlo: Supabase → SQL Editor → pega todo → Run. Se puede correr varias veces
-- (no duplica). Incluye uno 'lleno' y uno 'cerrado' para comprobar que la ruta los descarta.

insert into public.refugios
  (clave_oficial, nombre, direccion, municipio, entidad, ubicacion, capacidad, ocupacion, estado, fuente)
values
  ('PRUEBA-01', '[PRUEBA] Refugio Centro León', 'Dato de prueba (zona centro)', 'León', 'Guanajuato',
   extensions.st_setsrid(extensions.st_makepoint(-101.6826, 21.1221), 4326)::extensions.geography,
   200, 0, 'abierto', 'DATOS DE PRUEBA — NO ES UN REFUGIO REAL'),
  ('PRUEBA-02', '[PRUEBA] Refugio Norte León', 'Dato de prueba (zona norte)', 'León', 'Guanajuato',
   extensions.st_setsrid(extensions.st_makepoint(-101.6930, 21.1600), 4326)::extensions.geography,
   150, 20, 'abierto', 'DATOS DE PRUEBA — NO ES UN REFUGIO REAL'),
  ('PRUEBA-03', '[PRUEBA] Refugio Sur León', 'Dato de prueba (zona sur)', 'León', 'Guanajuato',
   extensions.st_setsrid(extensions.st_makepoint(-101.6680, 21.1050), 4326)::extensions.geography,
   300, 0, 'abierto', 'DATOS DE PRUEBA — NO ES UN REFUGIO REAL'),
  ('PRUEBA-04', '[PRUEBA] Refugio Oriente León (lleno)', 'Dato de prueba (zona oriente)', 'León', 'Guanajuato',
   extensions.st_setsrid(extensions.st_makepoint(-101.6350, 21.1300), 4326)::extensions.geography,
   100, 100, 'lleno', 'DATOS DE PRUEBA — NO ES UN REFUGIO REAL'),
  ('PRUEBA-05', '[PRUEBA] Refugio Centro Purísima', 'Dato de prueba (zona centro)', 'Purísima del Rincón', 'Guanajuato',
   extensions.st_setsrid(extensions.st_makepoint(-101.8778, 21.0339), 4326)::extensions.geography,
   120, 0, 'abierto', 'DATOS DE PRUEBA — NO ES UN REFUGIO REAL'),
  ('PRUEBA-06', '[PRUEBA] Refugio Norte Purísima (cerrado)', 'Dato de prueba (zona norte)', 'Purísima del Rincón', 'Guanajuato',
   extensions.st_setsrid(extensions.st_makepoint(-101.8700, 21.0420), 4326)::extensions.geography,
   80, 0, 'cerrado', 'DATOS DE PRUEBA — NO ES UN REFUGIO REAL')
on conflict (clave_oficial) do nothing;

-- Muestra lo que quedó cargado
select clave_oficial, nombre, estado, capacidad, ocupacion
from public.refugios
where clave_oficial like 'PRUEBA-%'
order by clave_oficial;
