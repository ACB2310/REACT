# Etapa 5: ruta combinada carro + a pie

**Meta:** si en carro no hay ruta a ningún refugio cercano (bloqueos, zonas), proponer bajar del
vehículo en el punto de transbordo con **menor tiempo total** y seguir a pie (CLAUDE.md, "Lógica de rutas").

**Arquitectura:** todo en la Edge Function `rutas` (la llave de ORS no sale de Supabase).
`logica.js` sigue sin dependencias y probado con funciones de ORS falsas inyectadas.
El frontend solo muestra los dos tramos.

## Decisiones (2026-10-17, el usuario pidió terminar la etapa sin más preguntas)

- **Cuándo:** solo en modo **carro**, cuando la ruta normal da `sin-ruta` por `bloqueada` o
  `sin-acceso` (no si no hay refugios). A pie nunca.
- **Destinos:** los 2 refugios abiertos más cercanos (línea recta, ≤ 30 km, fuera de zonas).
- **Candidatos de transbordo:** isócrona **a pie** de 15 min (900 s) alrededor del refugio, evitando
  bloqueos `total` y zonas; 12 puntos de su borde + 12 a medio camino hacia el refugio. Se descartan
  los que caen en una zona de severidad 1 o a ≤ 25 m de cualquier bloqueo.
- **Orden:** `tiempo_carro(matriz origen→candidato) + 120 s para bajar + tiempo_a_pie(matriz refugio→candidato)`
  (a pie no hay sentidos únicos). Se prueban las 3 mejores combinaciones con rutas reales.
- **Rutas reales:** tramo en carro origen→candidato (evita `total` y `solo_vehiculos`), luego tramo a
  pie desde **donde terminó el carro** hasta el refugio (evita `total`). Cualquier tramo que cruce un
  obstáculo se descarta. Gana el menor tiempo total real.
- **Tiempo:** la función tiene un presupuesto de 13 s (la app espera 15 s): cada petición a ORS usa
  como máximo lo que queda. Si la combinada falla por un error de ORS, se responde el `sin-ruta` original.
- **Respuesta:** `modo: 'combinada'`, `ruta` = FeatureCollection con 2 tramos (`properties.modo`
  `carro` / `a_pie`), `transbordo` [lng, lat], `tramos: { carro, aPie, descensoS }`, `resumen`
  con el total y los pasos de ambos con "Bájate del vehículo…" en medio.
- **Interfaz:** tramo en carro morado y a pie azul (los colores que ya existen), punto ámbar en el
  transbordo, texto con el total y cada tramo, dos enlaces "Abrir en mapas" (carro y a pie).
- Cuota de ORS (plan gratuito): isócronas 500/día, matrices 500/día, rutas 2000/día. Una combinada
  usa hasta 2 isócronas, 4 matrices y 6 rutas, además de la ruta normal.

## Tareas

1. `logica.js`: `puntosDeTransbordo`, `planificarRutaCombinada` y su uso en `planificarRuta` (con pruebas).
2. `index.ts`: `pedirIsocrona` y presupuesto de tiempo. Volver a desplegar `rutas`.
3. Frontend: `PanelRuta` (textos y enlaces), `CapaRutasEvacuacion` (FeatureCollection y punto de
   transbordo), `Mapa` (pasa el transbordo). Pruebas de cada uno.
4. CLAUDE.md (decisiones y roadmap ✅), lint, build y revisión independiente (lógica de rutas).
