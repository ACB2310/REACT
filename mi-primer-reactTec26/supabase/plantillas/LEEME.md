# Importar la lista oficial de refugios

1. Acomoda la lista oficial con las columnas de `refugios.csv`:
   `clave_oficial,nombre,direccion,municipio,entidad,capacidad,fuente`.
   - `fuente` es obligatoria: la dependencia y la fecha de la lista, por ejemplo
     `Protección Civil de Jalisco, lista 2026`.
   - `clave_oficial` puede quedar vacía si la lista no trae clave.
2. En Supabase: **Table Editor → refugios → Insert → Import data from CSV**.
3. Los refugios entran **sin ubicación**. El coordinador los ubica en la app,
   en la pantalla **Refugios** (filtro "Sin ubicación").

Si la lista oficial ya trae coordenadas, no las pongas en el CSV: avísale al equipo
para cargarlas con SQL (`ubicacion = st_makepoint(longitud, latitud)`, en ese orden).
Nunca se inventan coordenadas ni se cargan refugios de ejemplo en la base real.
