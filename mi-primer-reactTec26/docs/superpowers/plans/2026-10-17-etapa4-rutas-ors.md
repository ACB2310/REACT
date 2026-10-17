# Etapa 4: ruta al refugio más cercano con OpenRouteService – Plan de implementación

> **Para agentes:** SUB-SKILL REQUERIDA: usa superpowers:subagent-driven-development (recomendado) o superpowers:executing-plans para implementar este plan tarea por tarea. Los pasos usan casillas (`- [ ]`) para seguimiento.

**Objetivo:** con conexión, llevar a la persona al **refugio abierto al que llega más rápido**, a pie o en carro, **evitando bloqueos y zonas de peligro**. Sin conexión, o si ORS falla, usar la ruta a pie sin conexión de la tarea 10 (Dijkstra) que ya existe.

**Decisiones del usuario (2026-10-17):**
1. **A pie y en carro**: la persona elige.
   - A pie se evitan solo los bloqueos `total`.
   - En carro se evitan los `total` y los `solo_vehiculos`.
2. **Zonas de peligro marcadas por el coordinador**: polígonos que dibuja en el mapa. Los sismos y los ciclones no generan zonas en esta etapa.
3. **Un solo botón, que elige solo**:
   - "Ruta a refugio" usa ORS si hay conexión;
   - sin conexión, o si ORS falla, usa el Dijkstra guardado (solo a pie);
   - en carro y sin conexión dice que hace falta internet.

**Restricciones de ORS que dan forma al diseño** (openrouteservice.org/restrictions, consultado el 2026-10-17):
- **Directions**: `avoid_polygons` hasta **200 km²** de área total y **20 km** de lado.
- **Matrix**: hasta 3,500 pares, y **no acepta `avoid_polygons`**.
- Plan gratuito: alrededor de 2,000 rutas y 500 matrices al día.

**Por eso la Edge Function hace esto:**
1. **Matriz** del origen a los 10 refugios abiertos más cercanos en línea recta (a 30 km o menos), para ordenarlos por tiempo.
2. **Directions** con `avoid_polygons` para los **3 primeros**.
3. Se queda con el de **menor tiempo real**. Así una consulta cuesta 1 matriz + 3 rutas.

**Arquitectura:**
- **Edge Function `rutas`** (Deno), en `supabase/functions/rutas/`. La llave `ORS_API_KEY` es un secreto de Supabase y **nunca** llega al navegador.
  - La lógica pura vive en `logica.js` (sin APIs de Deno), así que Vitest la prueba.
  - `index.ts` solo arma la petición, la sesión, Supabase y ORS.
- **Migración 6**: la tabla `zonas_peligro` y un límite de consultas de ruta por usuario (`consultas_ruta`, 20 por hora) para cuidar la cuota de ORS.
- **Frontend**:
  - `services/rutasOrs.js` llama a `supabase.functions.invoke('rutas')`.
  - `useRutaRefugio` decide entre ORS y Dijkstra.
  - `PanelRuta` reemplaza al botón actual y muestra el panel de ORS o el `PanelEvacuacion` existente.
  - `CapaRutaOrs` dibuja la ruta y `CapaZonasPeligro` las zonas.
  - Pantalla `/zonas` para que el coordinador dibuje zonas.

**Stack:** lo actual. **Sin librerías nuevas** en el frontend: Turf ya está. La Edge Function usa `@supabase/supabase-js` por `npm:`, que Deno resuelve solo.

## Pendiente del usuario
- [x] Crear la llave de ORS y guardarla en Supabase → Edge Functions → Secrets como `ORS_API_KEY` (hecho el 2026-10-17).
- [ ] Aplicar `20261017000006_zonas_y_rutas.sql` y correr `verificar_zonas.sql` (tareas 1 y 2).
- [ ] Desplegar la Edge Function `rutas` desde el panel: **Edge Functions → Deploy a new function → Via Editor**, con el nombre `rutas`, pegando `index.ts` y `logica.js` (tarea 4).

## Restricciones globales
- Todo en español. Los commits terminan con `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- GeoJSON en `[longitud, latitud]`. En el enlace a Google Maps, `lat,lng`.
- **Nunca mostrar una ruta que cruce un bloqueo `total` o una zona de peligro**: la Edge Function revisa la línea que devuelve ORS y la descarta si cruza. La interfaz lo vuelve a revisar.
- Si no hay ruta, se dice explícitamente con el motivo.
- Rama `etapa4`, que sale de `etapa6`. Pruebas, lint y build al terminar cada tarea.

## Modelo de datos (migración 6)
- **zonas_peligro**: `id`, `geometria geography(Polygon)`, `origen` (`manual`; los valores `sismo`, `nhc`, `gdacs` e `inundacion` quedan reservados), `severidad` (1 = evitar siempre; 2 = precaución, solo se avisa), `descripcion` (≤ 300), `activa`, `expira_en` (puede ser nula), `creado_por`, `creado_en`.
  - Validaciones: polígono válido (`st_isvalid`), dentro de México y **≤ 20 km²** cada uno (para no rebasar el límite de ORS).
  - **Todos la pueden ver**, porque la gente necesita saber dónde está el peligro. Solo el coordinador crea o desactiva, por RPC: `crear_zona_peligro(geojson text, severidad, descripcion, expira_en)` y `desactivar_zona_peligro(id)`.
  - Vista `zonas_peligro_vista`: las activas y no vencidas, con `geojson` (`st_asgeojson`).
  - Tiempo real: tema privado `zonas-cambios`, que todos pueden escuchar y solo el servidor envía, igual que `bloqueos-cambios`.
- **consultas_ruta**: `usuario`, `creado_en`. `registrar_consulta_ruta()` (security definer) inserta un renglón y lanza `LIMITE_RUTAS` si hay 20 o más en la última hora. No es legible por nadie.

## Puntos de revisión
1. **Ninguna ruta mostrada cruza un bloqueo `total` ni una zona de severidad 1.** Pruebas en `logica.test.js` y en la interfaz.
2. **En carro también se evitan los bloqueos parciales; a pie no.** Pruebas en `logica.test.js`.
3. **La llave de ORS nunca aparece en el frontend** (`grep` de `ORS_API_KEY` y `openrouteservice` en `src/` y `dist/`).
4. **Origen dentro de una zona**: no se evita esa zona (si no, ORS no encuentra ruta) y se avisa "Estás dentro de una zona de peligro: sal de ella por la ruta indicada".
5. **Las zonas a evitar nunca rebasan los límites de ORS**: solo se mandan las que tocan la caja origen–destino + 2 km. Si aun así se rebasan, se avisa y no se inventa la ruta.
6. **Sin conexión, a pie usa Dijkstra; en carro avisa.** Si ORS falla (cuota, red), a pie también cae a Dijkstra, con el aviso "Ruta calculada sin conexión".
7. **Abuso de cuota**: 20 consultas por hora por sesión (`LIMITE_RUTAS`).

---

### Tarea 0: Plan y rama
- [ ] Commit: `docs: plan de la etapa 4 (rutas con OpenRouteService)`

### Tarea 1: Migración 6 (`supabase/migrations/20261017000006_zonas_y_rutas.sql`)
- [ ] Tablas `zonas_peligro` y `consultas_ruta`, índice GIST, RLS, la vista, las RPC, el tiempo real y los disparadores, como dice "Modelo de datos".
- [ ] Commit: `feat: zonas de peligro y límite de consultas de ruta`

### Tarea 2: Verificación SQL (`supabase/pruebas/verificar_zonas.sql`)
Mismo formato que `verificar_brigadas.sql`.
- [ ] Un coordinador crea una zona válida y aparece en la vista con su GeoJSON.
- [ ] Un ciudadano o un anónimo la ve, pero no puede crear ni desactivar zonas (`SIN_PERMISO`).
- [ ] Un polígono inválido (moño), fuera de México o de más de 20 km² se rechaza (`ZONA_INVALIDA`, `FUERA_DE_MEXICO`, `ZONA_GRANDE`).
- [ ] Una zona desactivada o vencida desaparece de la vista.
- [ ] La consulta 21 en una hora da `LIMITE_RUTAS`.
- [ ] Nadie puede leer `consultas_ruta`.
- [ ] Commit: `test: verificación de zonas de peligro en SQL`

### Tarea 3: Lógica de rutas (`supabase/functions/rutas/logica.js` + `logica.test.js`)
Son funciones puras, que se prueban con Vitest:
- [ ] `circuloAlrededor([lng, lat], metros = 25, lados = 8)` devuelve un Polygon.
- [ ] `obstaculosParaRuta({ bloqueos, zonas, modo, origen, destino })`:
  - a pie: solo bloqueos `total`; en carro: `total` + `solo_vehiculos`;
  - zonas de severidad 1;
  - solo los que tocan la caja origen–destino + 2 km;
  - quita (y reporta) la zona que contiene el origen;
  - devuelve `{ multipolygon, evitados: { bloqueos, zonas }, origenEnZona }` o un error `DEMASIADAS_ZONAS` si se rebasa el límite de ORS.
- [ ] `refugiosCandidatos(origen, refugios, zonas, maximo = 10, radioKm = 30)`: abiertos, con ubicación y fuera de zonas de severidad 1, del más cercano al más lejano.
- [ ] `ordenarPorTiempo(candidatos, duraciones)`: descarta los `null` (sin ruta).
- [ ] `rutaCruzaObstaculos(lineString, obstaculos)` usa `@turf/boolean-intersects`.
- [ ] `resumirRuta(featureOrs)` devuelve `{ distanciaM, duracionS, pasos: [{ instruccion, distanciaM }] }`.
- [ ] Pruebas:
  - en carro evita el bloqueo parcial y a pie no;
  - el origen dentro de una zona;
  - el filtro por caja;
  - el límite de área;
  - un refugio dentro de una zona se descarta;
  - una ruta que cruza un bloqueo total se descarta;
  - `[lng, lat]` en todo.
- [ ] Commit: `feat: lógica de rutas con OpenRouteService (probada)`

### Tarea 4: Edge Function (`supabase/functions/rutas/index.ts`)
- [ ] CORS (incluido `OPTIONS`), solo `POST`. El cuerpo es `{ origen: [lng, lat], modo: 'a_pie' | 'carro' }` y se valida (números, dentro de México).
- [ ] Sesión obligatoria, también anónima: cliente de Supabase con el `Authorization` de la persona, `getUser()`; si no hay, `SIN_SESION`. Luego `registrar_consulta_ruta()`.
- [ ] Lee `refugios_vista`, `bloqueos_vista` y `zonas_peligro_vista` con la sesión de la persona (respeta RLS).
- [ ] ORS:
  - `POST /v2/matrix/{foot-walking|driving-car}` con `sources: [0]`;
  - luego `POST /v2/directions/{perfil}/geojson` con `options.avoid_polygons`, `language: 'es'` e `instructions: true` para los 3 mejores;
  - tiempo límite de 15 s por petición;
  - los errores de ORS se traducen: 2009/2010 = sin ruta; 401/403 = `ORS_LLAVE`; 429 = `ORS_LIMITE`.
- [ ] Descarta las rutas que cruzan obstáculos y devuelve la de menor tiempo. Respuesta: `{ estado: 'ruta', destino, ruta, resumen, evitados, origenEnZona, consultadoEn }` o `{ estado: 'sin-ruta', motivo }`.
- [ ] `supabase/functions/rutas/LEEME.md`: cómo desplegarla desde el panel (o con la CLI) y cómo revisar los registros.
- [ ] Commit: `feat: Edge Function de rutas con OpenRouteService`

### Tarea 5: Servicios y errores del frontend
- [ ] `services/rutasOrs.js`: `calcularRutaRefugio({ origen, modo, signal })` usa `supabase.functions.invoke('rutas', { body })` y traduce `FunctionsHttpError` o `FunctionsFetchError` con los códigos del cuerpo.
- [ ] `services/zonas.js`: `obtenerZonas`, `crearZona({ poligono, severidad, descripcion, expiraEn })`, `desactivarZona(id)` y `suscribirseAZonas`.
- [ ] Códigos nuevos en `erroresSupabase.js`:

  | Código | Mensaje |
  |---|---|
  | `LIMITE_RUTAS` | Ya pediste muchas rutas en la última hora. Espera unos minutos. |
  | `ZONA_INVALIDA` | La zona no es válida: revisa que sus lados no se crucen. |
  | `ZONA_GRANDE` | La zona es demasiado grande (máximo 20 km²). Divídela en varias. |
  | `ORS_LIMITE` | El servicio de rutas llegó a su límite de hoy. |
  | `ORS_LLAVE` | El servicio de rutas no está configurado. |
  | `DEMASIADAS_ZONAS` | Hay demasiadas zonas de peligro en el camino para calcular la ruta en línea. |

- [ ] Pruebas con `supabaseFalso` (agregarle `functions.invoke`).
- [ ] Commit: `feat: servicios de rutas en línea y zonas de peligro`

### Tarea 6: Hooks
- [ ] `useZonasPeligro()`: periódico (5 min) más tiempo real, para todos.
- [ ] `useRutaRefugio({ modo, evacuacion })`:
  - con conexión: asegura la sesión, obtiene la ubicación (`services/ubicacion.js`) y llama a ORS;
  - si falla por red o por ORS y el modo es a pie: `evacuacion.buscarRuta()` (Dijkstra) y marca `respaldo: true`;
  - en carro y sin conexión: estado `sin-conexion-carro`.
  
  Devuelve `{ estado, fuente: 'ors' | 'dijkstra', resultado, error, buscar, limpiar }`.
- [ ] Pruebas:
  - con conexión usa ORS;
  - sin conexión a pie usa Dijkstra;
  - sin conexión en carro avisa;
  - `ORS_LIMITE` cae a Dijkstra;
  - cancelar al desmontar.
- [ ] Commit: `feat: hook que elige ruta en línea o sin conexión`

### Tarea 7: Capas
- [ ] `CapaZonasPeligro`: relleno rojo semitransparente con borde punteado y un popup con descripción, severidad y "Marcada por coordinación · hora". Va debajo de los bloqueos.
- [ ] `CapaRutaOrs`: línea azul (a pie) o morada (en carro) con borde blanco, más los marcadores de origen y destino. Va encima de todo, como `CapaRutasEvacuacion`.
- [ ] Leyenda y la opción "Zonas de peligro" en `PanelCapas` para todos.
- [ ] Pruebas con `mapaFalso`.
- [ ] Commit: `feat: capas de zonas de peligro y ruta en línea`

### Tarea 8: Panel de ruta (reemplaza el botón actual)
- [ ] `PanelRuta`:
  - selector grande **A pie / En carro** (se recuerda en `localStorage`);
  - un solo botón **Ruta a refugio**.
- [ ] Con resultado de ORS:
  - "Refugio <nombre>: 12 min en carro · 4.3 km";
  - "Evita 2 bloqueos y 1 zona de peligro";
  - las instrucciones paso a paso (plegables);
  - **Abrir en mapas** (con `travelmode` según el modo);
  - "Ruta: OpenRouteService · hora".
- [ ] Con respaldo de Dijkstra: se muestra el `PanelEvacuacion` existente, con el aviso "Sin conexión con el servicio de rutas: ruta a pie calculada en tu teléfono".
- [ ] Mensajes de "sin ruta" con su motivo, "Estás dentro de una zona de peligro…" y el aviso oficial.
- [ ] Pruebas de cada estado.
- [ ] Commit: `feat: panel de ruta a refugio (en línea o sin conexión)`

### Tarea 9: Pantalla Zonas de peligro (`/zonas`, solo coordinador)
- [ ] `DibujarPoligono`: se toca el mapa para agregar vértices (con marcadores) y hay botones **Deshacer punto**, **Cerrar zona** (mínimo 3 puntos) y **Borrar**. Muestra el área en km² y avisa si pasa de 20.
- [ ] Formulario: severidad (Evitar / Precaución), descripción y vencimiento opcional (6 h, 24 h, 72 h o sin vencimiento).
- [ ] Lista de zonas activas con **Desactivar** (pide confirmación).
- [ ] Pruebas: el polígono sale cerrado y en `[lng, lat]`, el aviso de área y `ZONA_GRANDE`.
- [ ] Commit: `feat: pantalla para que el coordinador marque zonas de peligro`

### Tarea 10: Integración, documentación y prueba
- [ ] `Mapa.jsx`: `PanelRuta` en lugar del botón y del panel actuales, `CapaZonasPeligro`, `CapaRutaOrs` y "Zonas" en la navegación del coordinador.
- [ ] `CLAUDE.md`: la tabla `zonas_peligro`, la Edge Function, las decisiones y el roadmap 4 ✅. `README.md`: el despliegue de la función.
- [ ] Comprobar que `ORS_API_KEY` no aparece en `src/` ni en `dist/`.
- [ ] Verificación en el navegador con la función desplegada:
  - una ruta a pie y una en carro desde Guadalajara;
  - un bloqueo `solo_vehiculos` en medio cambia la ruta en carro y no la de a pie;
  - una zona del coordinador desvía la ruta;
  - en modo avión, a pie usa Dijkstra.
- [ ] Commit: `feat: ruta al refugio más cercano en el mapa y documentación`
