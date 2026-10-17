# Rutas de evacuación a pie con Dijkstra (riesgo sísmico) – Plan de implementación

> **Para agentes:** SUB-SKILL REQUERIDA: usa superpowers:executing-plans (modo Native elegido por el usuario). Cada tarea termina con una **revisión por subagente independiente** (ver Restricciones globales). Los pasos usan casillas (`- [ ]`).

**Objetivo:**
- Calcular **en el teléfono, sin conexión**, la ruta a pie más segura hacia el punto de reunión más conveniente.
- Usar Dijkstra con un costo ponderado por riesgo sísmico y por vulnerabilidad de la vía.
- Respetar los bloqueos `total` y dibujar la ruta en MapLibre.

**Arquitectura:**
- **Calles y puntos de reunión:** salen de OpenStreetMap vía la API Overpass.
- **Descarga:** solo cuando la persona toca un botón. Tarda hasta ~40 s en el servidor público (medido el 2026-10-16).
- **Caché:** la zona descargada se guarda en `localStorage`, así que después la ruta se calcula sin red.
- **Capas de código:** algoritmo, riesgo, grafo y caché son funciones puras en `src/utils/`. La descarga y la ubicación van en `src/services/`, el flujo en un hook y el dibujo en `CapaRutasEvacuacion`.
- **OpenRouteService:** sigue siendo el motor principal en línea (etapa 4). Este módulo es el **complemento sin conexión**, por decisión del usuario del 2026-10-16.

**Stack:**
- React 19, Vite 8, MapLibre GL 6.14, Vitest 5.
- **Turf.js** (ya está en el stack de `CLAUDE.md`), con los paquetes modulares `@turf/distance`, `@turf/point-to-line-distance`, `@turf/boolean-intersects` y `@turf/helpers`. Sirven para medir distancias y detectar si una calle cruza un bloqueo.

**Spec:** `CLAUDE.md` (Lógica de rutas, Interfaz, Seguridad) más los requerimientos del usuario del 2026-10-16:
- costo `distanciaBase * (1 + factorRiesgoSismico + factorVulnerabilidadVia)`;
- la firma `calcularRutaEvacuacion(grafo, nodoOrigenId, idsRefugios, sismosActivos)`;
- el mock `grafoEvacuacionEjemplo.js` y los 5 casos de prueba.

**Relación con planes anteriores:** las etapas 1 y 2 ya están terminadas y en `main`. Su plan (`2026-10-16-mapa-sismos-usgs.md`) **no se modifica**.

## Restricciones globales

- Todo en **español**: código (camelCase), componentes (PascalCase), comentarios, textos y commits. Los commits **no llevan líneas de atribución**.
- GeoJSON siempre `[longitud, latitud]`. **Ojo:** Overpass usa `around:radio,LAT,LON`, el orden inverso.
- Los componentes no hacen `fetch` ni piden la ubicación directamente: todo pasa por `src/services/` y los hooks.
- **Revisión por subagente en CADA tarea** (regla del usuario, porque todo este plan es lógica de rutas). Después del commit de cada tarea:
  - Se lanza un subagente revisor que no haya visto la implementación.
  - Revisa: que la tarea cumpla exactamente lo pedido; las reglas de `CLAUDE.md` (sin llaves privadas en el frontend; RLS si hubiera tablas); y que **nunca se muestre una ruta que cruce un bloqueo `total`**.
  - Lo que encuentre se corrige antes de pasar a la siguiente tarea.
- Al cerrar cada tarea: `npm test`, `npm run lint` y `npm run build` sin errores.
- Rama: `feat/rutas-evacuacion`, desde `main`.
- **Modo a pie:** se ignoran los sentidos únicos. Los bloqueos `solo_vehiculos` se permiten y los `total` bloquean la arista (`Infinity`).
- **Constantes:**
  - `radioInfluenciaKm(mag) = 10 ** (0.5 * mag - 1.5)`. Ejemplos: M 6.3 → 44.67 km, M 5.2 → 12.59 km, M 2.5 → 0.562 km.
  - `radioCriticoKm(mag) = radioInfluenciaKm(mag) / 4` (M 6.3 → 11.17 km).
  - `MAGNITUD_FUERTE = 6.0`: solo los sismos de esta magnitud o más bloquean dentro del radio crítico.
  - Aporte de cada sismo dentro del radio de influencia: `(mag / 2) * (1 - dKm / radioInfluenciaKm(mag))`. Se suman todos los aportes.
  - Sismos con `mag` que no es número: no aportan nada y no rompen el cálculo.
  - `SISMOS_ACTIVOS_HORAS = 72`: ventana de tiempo para considerar un sismo "activo".
  - `VULNERABILIDAD_VIA` (por `highway`): `footway`/`pedestrian` 0, `living_street` 0.05, `residential`/`unclassified`/`service` 0.1, `tertiary` 0.15, `secondary`/`path`/`cycleway` 0.2, `primary` 0.25, `steps` 0.3, cualquier otra 0.2. Se suma **+0.5** si `bridge=yes` o `tunnel=yes`, porque tras un sismo son tramos de mayor riesgo.
  - Nivel de riesgo de la ruta, según el mayor `factorRiesgoSismico + vulnerabilidad` de sus aristas: `bajo` < 0.5 ≤ `medio` < 1.5 ≤ `alto`.
  - Caminando: 70 m/min, con minutos = `Math.ceil(distanciaM / 70)`.
  - Radios de Overpass: 1500 m para calles y 2500 m para puntos de reunión. Tiempo límite 60 s.
  - Distancia máxima para pegar al grafo el origen o un punto de reunión: 300 m.
  - Caché válida si el centro guardado está a ≤ 500 m de la ubicación actual y tiene ≤ 7 días. Clave: `zonaEvacuacion:v1`.
- **Overpass:** solo se consulta cuando la persona toca el botón, nunca con intervalos. Así se respeta la política de uso justo. Atribución obligatoria: `© OpenStreetMap`.
- Puntos de reunión: solo `emergency=assembly_point`. **No** se usa `amenity=shelter`, que en OSM suele ser una parada de autobús.
- Datos de ejemplo solo en `src/mocks/`, y su primera línea es `// DATOS DE EJEMPLO SOLO PARA PRUEBAS – no usar en producción`.

## Puntos de revisión

1. **Orden de coordenadas en Overpass** (`around:radio,lat,lon`). Si se invierte, se piden calles en otro lugar del mundo. La prueba compara el texto exacto de la consulta (tarea 4).
2. **Bloqueo `total` en el único camino.** Debe dar el estado controlado `sin-ruta`, nunca una ruta que lo cruce. En cambio, `solo_vehiculos` sí se puede cruzar a pie (tarea 3).
3. **Todos los puntos de reunión dentro del radio crítico o inalcanzables.** Debe dar `sin-ruta` con aviso y nunca una ruta parcial (tareas 3 y 9).
4. **Overpass lento, caído o con 429.** Debe mostrarse el error, y si ya hay una zona guardada se usa sin red (tareas 4 y 8).
5. **`localStorage` lleno o bloqueado** (modo privado). La ruta se calcula igual, solo que no se guarda, y la app no se rompe (tareas 6 y 8).

---

### Tarea 1: Turf, distancias y cola de prioridad

**Archivos:**
- Modificar: `package.json` (`npm install @turf/distance @turf/point-to-line-distance @turf/boolean-intersects @turf/helpers`)
- Modificar: `src/utils/geo.js`, `src/utils/geo.test.js`
- Crear: `src/utils/colaPrioridad.js`, `src/utils/colaPrioridad.test.js`

**Interfaces:**
- Produce en `geo.js`:
  - `distanciaMetros(a, b)`: distancia entre dos `[lon, lat]`, con `@turf/distance` en metros.
  - `distanciaPuntoSegmentoKm(punto, a, b)`: con `@turf/point-to-line-distance`.
- Produce en `colaPrioridad.js`: `crearColaPrioridad()`, que devuelve `{ agregar(valor, prioridad), sacarMinimo() => { valor, prioridad } | undefined, estaVacia() }`. Es un montículo binario (min-heap).

- [ ] **Paso 1: Pruebas que fallan:**
  - `distanciaMetros([-100.31, 25.67], [-100.305, 25.67])` ≈ 501.1, con `toBeCloseTo(501.1, 0)`.
  - `distanciaPuntoSegmentoKm([-99.9, 17.0], [-99.70, 16.92], [-99.90, 16.95])` ≈ 5.56, con `toBeCloseTo(5.56, 1)`.
  - `'una distancia con [lat, lon] invertido da otro valor'`: protege el orden de coordenadas.
  - `'la cola saca siempre el de menor prioridad'`: al agregar 5, 1, 3, 1 sale en el orden 1, 1, 3, 5.
  - `'la cola vacía devuelve undefined'`
- [ ] **Paso 2:** `npm test`. Resultado esperado: FALLA.
- [ ] **Paso 3:** Implementa las funciones.
- [ ] **Paso 4:** `npm test`, `npm run lint` y `npm run build`. Resultado esperado: PASA.
- [ ] **Paso 5: Commit:** `feat: distancias con Turf y cola de prioridad para rutas`
- [ ] **Paso 6: Revisión por subagente** y correcciones.

### Tarea 2: Riesgo sísmico de una arista

**Archivos:**
- Crear: `src/utils/riesgoSismico.js`, `src/utils/riesgoSismico.test.js`

**Interfaces:**
- Consume: `distanciaPuntoSegmentoKm` (tarea 1).
- Produce:
  - `MAGNITUD_FUERTE`, `SISMOS_ACTIVOS_HORAS`, `radioInfluenciaKm(mag)` y `radioCriticoKm(mag)`.
  - `factorRiesgoSismico([a, b], sismos) => number`. `sismos` es un `FeatureCollection`. Devuelve `Infinity` si un sismo con `mag >= 6.0` está a ≤ `radioCriticoKm` del segmento.
  - `filtrarSismosActivos(coleccion, ahoraMs, horas = 72) => FeatureCollection`, que usa `properties.time`.

- [ ] **Paso 1: Pruebas que fallan:**
  - `radioInfluenciaKm(6.3)` ≈ 44.67 y `radioCriticoKm(6.3)` ≈ 11.17
  - `'bloquea un tramo a 5.56 km de gro1'`: el segmento `[-99.70, 16.92]`→`[-99.90, 16.95]` con `sismosEjemplo` da `Infinity`.
  - `'penaliza sin bloquear a 18.84 km de gro1'`: el segmento `[-99.70, 16.92]`→`[-99.90, 16.80]` da ≈ 1.821 (`toBeCloseTo(1.821, 1)`).
  - `'un sismo menor a 6 nunca bloquea'`: un M 5.9 encima del tramo da un número finito mayor que 0.
  - `'lejos de todo sismo el factor es 0'`: el tramo de Monterrey `[-100.31, 25.67]`→`[-100.305, 25.67]` da 0.
  - `'mag null no aporta y no rompe'`: un sismo con `mag: null` encima del tramo da 0.
  - `'filtrarSismosActivos deja solo los de las últimas 72 h'`
- [ ] **Paso 2:** `npm test`. Resultado esperado: FALLA.
- [ ] **Paso 3:** Implementa el módulo.
- [ ] **Paso 4:** `npm test`, `npm run lint` y `npm run build`. Resultado esperado: PASA.
- [ ] **Paso 5: Commit:** `feat: factor de riesgo sísmico para tramos de calle`
- [ ] **Paso 6: Revisión por subagente** y correcciones.

### Tarea 3: Dijkstra adaptado a evacuación y grafo de ejemplo

**Archivos:**
- Crear: `src/mocks/grafoEvacuacionEjemplo.js`
- Crear: `src/utils/dijkstraEvacuacion.js`, `src/utils/dijkstraEvacuacion.test.js`

**Interfaces:**
- Consume: `distanciaMetros` y `crearColaPrioridad` (tarea 1), y `factorRiesgoSismico` (tarea 2).
- **Formato del grafo** (lo comparten las tareas 5 y 8): `{ nodos: { [id]: { id, coordenadas: [lon, lat] } }, aristas: [{ id, desde, hasta, vulnerabilidad, tipoVia }] }`. Las aristas se recorren en los dos sentidos.
- Produce: `calcularRutaEvacuacion(grafo, nodoOrigenId, idsRefugios, sismosActivos, { bloqueos = [] } = {})`.
  - `bloqueos` es una lista de `Feature` con `properties.tipo` igual a `'total'` o `'solo_vehiculos'`. Una arista se bloquea si su línea toca un bloqueo `total` (`@turf/boolean-intersects`).
  - El costo de cada arista es `distanciaMetros * (1 + factorRiesgoSismico + vulnerabilidad)`.
  - Se corre un solo Dijkstra desde el origen y se elige el refugio con **menor costo total**, no el más cercano.
  - Si encuentra ruta devuelve `{ estado: 'ok', refugioId, nodos: string[], distanciaM, distanciaKm, costo, riesgoMaximo, nivelRiesgo, ruta }`:
    - `distanciaM` es la distancia física real, redondeada.
    - `distanciaKm` lleva 1 decimal.
    - `ruta` es un `Feature<LineString>` con `[lon, lat]` y `properties: { refugioId, distanciaM, nivelRiesgo }`.
  - Si no encuentra ruta devuelve `{ estado: 'sin-ruta', motivo }`, con `motivo` igual a `'origen-desconocido'`, `'sin-refugios'`, `'origen-aislado'` o `'refugios-inalcanzables'`.
- `grafoEvacuacionEjemplo.js` (primera línea obligatoria) exporta estos grafos con estas coordenadas exactas. Todas las aristas son `residential` (0.1) salvo donde se indica:
  - `grafoMonterrey`:
    - nodos `m1` [-100.31, 25.67] (origen), `m2` [-100.305, 25.67], `m3` [-100.31, 25.675], `m4` [-100.30, 25.67] (refugio) y `m5` [-100.31, 25.685] (refugio)
    - aristas m1-m2, m2-m4, m1-m3 y m3-m5
  - `grafoAcapulco`:
    - nodos `a1` [-99.70, 16.92] (origen), `a2` [-99.90, 16.95], `a3` [-99.90, 16.80] y `a4` [-100.10, 16.92] (refugio)
    - aristas a1-a2, a2-a4, a1-a3 y a3-a4
  - `grafoDosRefugios`:
    - nodos `c1` [-99.80, 16.88] (origen), `c2` [-99.90, 16.97] (refugio cercano, a 3.3 km de gro1) y `c3` [-99.60, 16.80] (refugio alternativo)
    - aristas c1-c2 y c1-c3
  - `grafoPuente`:
    - nodos `p1` [-100.31, 25.70] (origen), `p2` [-100.30, 25.70] (refugio) y `p3` [-100.305, 25.7015]
    - aristas p1-p2 (`residential` con `bridge`, vulnerabilidad 0.6), p1-p3 y p3-p2
  - `grafoAislado`: nodo `x1` sin aristas, más el grafo de Monterrey

- [ ] **Paso 1: Pruebas que fallan** (los valores esperados se calcularon a mano con haversine):
  - `'elige la ruta más rápida al refugio más cercano cuando no hay sismos cercanos'`: en Monterrey con `sismosEjemplo`, el resultado es `refugioId: 'm4'`, `nodos: ['m1', 'm2', 'm4']`, `distanciaM` ≈ 1002 (±5) y `nivelRiesgo: 'bajo'`.
  - `'sin sismos va por el camino directo'`: en Acapulco con una colección vacía, `nodos: ['a1', 'a2', 'a4']` y `distanciaM` ≈ 43070 (±50).
  - `'desvía la ruta si gro1 (M 6.3) afecta el camino directo'`: en Acapulco con `sismosEjemplo`, `nodos: ['a1', 'a3', 'a4']`, `distanciaM` ≈ 50240 (±50) y `nivelRiesgo: 'alto'`. La ruta es más larga, pero más segura.
  - `'elige un segundo refugio si el más cercano queda en riesgo crítico'`: en Dos refugios con `sismosEjemplo`, `refugioId: 'c3'` y `distanciaM` ≈ 23069 (±50).
  - `'evita un puente si hay un camino poco más largo'`: en Puente con una colección vacía, `nodos: ['p1', 'p3', 'p2']`.
  - `'devuelve LineString en orden [lon, lat]'`: en Monterrey, `ruta.geometry` es `{ type: 'LineString', coordinates: [[-100.31, 25.67], [-100.305, 25.67], [-100.30, 25.67]] }`.
  - `'un sismo con mag null no rompe ni cambia la ruta'`: el resultado es igual al caso sin sismos.
  - `'origen aislado da un estado controlado'`: `{ estado: 'sin-ruta', motivo: 'origen-aislado' }`.
  - `'todos los refugios inalcanzables da sin-ruta y nunca una ruta parcial'`: en Dos refugios con c1-c3 bloqueado en `total`, el motivo es `'refugios-inalcanzables'`.
  - `'nunca cruza un bloqueo total'`: con un polígono `total` sobre m1-m2, va a `m5` por m1-m3-m5.
  - `'a pie sí cruza un bloqueo solo_vehiculos'`: el mismo polígono con `solo_vehiculos` da `['m1', 'm2', 'm4']`.
  - `'origen desconocido'` y `'lista de refugios vacía'`: dan los motivos correspondientes.
- [ ] **Paso 2:** `npm test`. Resultado esperado: FALLA.
- [ ] **Paso 3:** Implementa el algoritmo. Comenta cada paso de Dijkstra en español sencillo.
- [ ] **Paso 4:** `npm test`, `npm run lint` y `npm run build`. Resultado esperado: PASA.
- [ ] **Paso 5: Commit:** `feat: Dijkstra adaptado a evacuación con riesgo sísmico y bloqueos`
- [ ] **Paso 6: Revisión por subagente** y correcciones.

### Tarea 4: Servicio Overpass (calles y puntos de reunión)

**Archivos:**
- Modificar: `src/services/http.js` (opción `tiempoLimiteMs`, que vale `TIEMPO_LIMITE_MS` si no se indica), `src/services/http.test.js`
- Crear: `src/services/overpass.js`, `src/services/overpass.test.js`

**Interfaces:**
- Produce:
  - `URL_OVERPASS = 'https://overpass-api.de/api/interpreter'`
  - `consultaOverpass([lon, lat]) => string`
  - `obtenerCallesYPuntosReunion([lon, lat], { signal }) => Promise<{ elementos, descargadoEn }>`, con `fuente: 'OpenStreetMap'`. Hace un GET a `?data=<consulta codificada>` con tiempo límite de 60 s.
- Texto exacto de la consulta para `[-99.1332, 19.4326]`:
  `[out:json][timeout:60];way["highway"~"^(primary|secondary|tertiary|unclassified|residential|living_street|service|footway|pedestrian|path|steps|cycleway)$"](around:1500,19.4326,-99.1332);out body geom qt;node["emergency"="assembly_point"](around:2500,19.4326,-99.1332);out qt;`
- Si `elements` no es un arreglo, lanza `'Formato inesperado de OpenStreetMap'`.

- [ ] **Paso 1: Pruebas que fallan:**
  - `'arma la consulta con around:radio,lat,lon'`: compara con el texto exacto de arriba.
  - `'pide con GET y la consulta codificada'`
  - `'usa 60 segundos de tiempo límite'`: con temporizadores falsos, no falla a los 59 s y sí a los 60 s con `'OpenStreetMap tardó demasiado en responder'`.
  - `'429 da un error claro'`: el mensaje es `'OpenStreetMap respondió 429'`.
  - `'falla si cambia el formato'`
  - En `http.test.js`: `'respeta tiempoLimiteMs'`.
- [ ] **Paso 2:** `npm test`. Resultado esperado: FALLA.
- [ ] **Paso 3:** Implementa el servicio.
- [ ] **Paso 4:** `npm test`, `npm run lint` y `npm run build`, más una prueba en vivo con Node contra Overpass para CDMX. Resultado esperado: PASA. La prueba en vivo puede tardar ~40 s.
- [ ] **Paso 5: Commit:** `feat: servicio Overpass para calles y puntos de reunión`
- [ ] **Paso 6: Revisión por subagente** y correcciones.

### Tarea 5: Construir el grafo desde OpenStreetMap

**Archivos:**
- Crear: `src/mocks/overpassEjemplo.js` (primera línea obligatoria; una respuesta recortada con la forma real de `out body geom`)
- Crear: `src/utils/grafoOsm.js`, `src/utils/grafoOsm.test.js`

**Interfaces:**
- Consume: el formato de grafo de la tarea 3 y `distanciaMetros`.
- Produce:
  - `VULNERABILIDAD_VIA`
  - `vulnerabilidadDeVia(tags) => number`
  - `nodoMasCercano(grafo, [lon, lat], maxM = 300) => string | null`
  - `construirZonaEvacuacion(elementos) => { grafo, puntosReunion: [{ id, nombre, coordenadas, nodoId }] }`. Las aristas se crean entre nodos consecutivos de cada `way`, con las coordenadas de `geometry`, que viene como `{ lat, lon }` y se convierte a `[lon, lat]`. Se omiten las vías con `foot=no` o `access=private|no`. Los puntos de reunión que quedan a más de 300 m del grafo se descartan. El nombre es `tags.name`, o `'Punto de reunión'` si no hay.
- `overpassEjemplo.js` trae 3 vías que comparten nodos: una `residential`, una `footway` y una `residential` con `bridge=yes`. Además, una `service` con `access=private`, un `assembly_point` con nombre y otro a 1 km de las calles.

- [ ] **Paso 1: Pruebas que fallan:**
  - `'convierte {lat, lon} a [lon, lat]'`
  - `'une vías que comparten un nodo'`
  - `'omite vías privadas o sin paso peatonal'`
  - `'vulnerabilidad de un puente residencial = 0.6'`
  - `'pega el punto de reunión al nodo más cercano'`
  - `'descarta puntos de reunión lejos de las calles'`
  - `'nodoMasCercano devuelve null a más de 300 m'`
  - `'el grafo construido funciona con calcularRutaEvacuacion'`: una prueba de integración con el mock.
- [ ] **Paso 2:** `npm test`. Resultado esperado: FALLA.
- [ ] **Paso 3:** Implementa el constructor del grafo.
- [ ] **Paso 4:** `npm test`, `npm run lint` y `npm run build`. Resultado esperado: PASA.
- [ ] **Paso 5: Commit:** `feat: grafo peatonal desde OpenStreetMap`
- [ ] **Paso 6: Revisión por subagente** y correcciones.

### Tarea 6: Guardar la zona para usarla sin conexión

**Archivos:**
- Crear: `src/utils/almacenZona.js`, `src/utils/almacenZona.test.js`

**Interfaces:**
- Produce:
  - `CLAVE_ZONA = 'zonaEvacuacion:v1'`
  - `guardarZona({ centro, descargadoEn, grafo, puntosReunion }) => boolean`: devuelve `false` si falla, por ejemplo con el almacenamiento lleno.
  - `leerZona(centroActual, ahoraMs) => zona | null`: devuelve `null` si no hay zona, si está a más de 500 m, si tiene más de 7 días, si el JSON está roto o si `localStorage` lanza un error.

- [ ] **Paso 1: Pruebas que fallan:**
  - `'guarda y lee la misma zona'`
  - `'ignora una zona a más de 500 m'`
  - `'ignora una zona de más de 7 días'`
  - `'JSON roto da null'`
  - `'si localStorage lanza error, guardar da false y leer da null'`
- [ ] **Paso 2:** `npm test`. Resultado esperado: FALLA.
- [ ] **Paso 3:** Implementa el módulo.
- [ ] **Paso 4:** `npm test`, `npm run lint` y `npm run build`. Resultado esperado: PASA.
- [ ] **Paso 5: Commit:** `feat: guardar zona de evacuación para usarla sin conexión`
- [ ] **Paso 6: Revisión por subagente** y correcciones.

### Tarea 7: Servicio de ubicación

**Archivos:**
- Crear: `src/services/ubicacion.js`, `src/services/ubicacion.test.js`

**Interfaces:**
- Produce: `obtenerUbicacionActual({ tiempoLimiteMs = 15000 } = {}) => Promise<[lon, lat]>`. Usa `navigator.geolocation.getCurrentPosition` con `enableHighAccuracy: true` y `maximumAge: 60000`.
- Errores (mensajes exactos):
  - `'Este dispositivo no permite obtener la ubicación'`: no existe `geolocation`.
  - `'Permiso de ubicación denegado'`: código 1.
  - `'No se pudo obtener tu ubicación'`: códigos 2 y 3.

- [ ] **Paso 1: Pruebas que fallan:**
  - `'devuelve [longitud, latitud]'`: con `coords: { latitude: 19.43, longitude: -99.13 }`, el resultado es `[-99.13, 19.43]`.
  - Una prueba por cada error.
- [ ] **Paso 2:** `npm test`. Resultado esperado: FALLA.
- [ ] **Paso 3:** Implementa el servicio.
- [ ] **Paso 4:** `npm test`, `npm run lint` y `npm run build`. Resultado esperado: PASA.
- [ ] **Paso 5: Commit:** `feat: servicio de ubicación del usuario`
- [ ] **Paso 6: Revisión por subagente** y correcciones.

### Tarea 8: Hook `useRutaEvacuacion`

**Archivos:**
- Crear: `src/hooks/useRutaEvacuacion.js`, `src/hooks/useRutaEvacuacion.test.js`

**Interfaces:**
- Consume: las tareas 2 a 7.
- Produce: `useRutaEvacuacion({ sismos })`, que devuelve `{ estado, error, resultado, zona, origen, buscarRuta(), limpiar() }`.
  - Estados: `'inactivo'`, `'ubicando'`, `'descargando'`, `'calculando'`, `'listo'`, `'sin-ruta'`, `'sin-puntos'`, `'lejos-de-calles'`, `'sin-zona-offline'` y `'error'`.
  - Flujo de `buscarRuta()`:
    1. Obtener la ubicación.
    2. Leer la zona guardada (`leerZona`).
    3. Si no hay zona: si `navigator.onLine` es `false`, el estado es `'sin-zona-offline'`; si hay red, descargar, construir la zona y guardarla.
    4. Si no hay puntos de reunión, el estado es `'sin-puntos'`.
    5. Pegar el origen al grafo. Si queda a más de 300 m, el estado es `'lejos-de-calles'`.
    6. Calcular con `filtrarSismosActivos(sismos, Date.now())` y `idsRefugios` sacados de los `nodoId` de los puntos de reunión.
  - `resultado` incluye el punto de reunión elegido (`nombre`, `coordenadas`).
  - Si Overpass falla pero hay zona guardada, se usa la zona guardada. Una zona vieja o lejana no sirve; en ese caso el error se reporta.

- [ ] **Paso 1: Pruebas que fallan** (simula los servicios y `localStorage`):
  - `'calcula y guarda la zona la primera vez'`
  - `'la segunda vez usa la zona guardada sin descargar'`
  - `'sin conexión y sin zona guardada avisa sin-zona-offline'`
  - `'si localStorage está bloqueado igual calcula la ruta'`
  - `'error de Overpass sin zona da estado error con el mensaje'`
  - `'origen lejos de calles'`, `'sin puntos de reunión'` y `'sin-ruta cuando todo queda bloqueado'`
  - `'ignora sismos de hace más de 72 h'`
- [ ] **Paso 2:** `npm test`. Resultado esperado: FALLA.
- [ ] **Paso 3:** Implementa el hook.
- [ ] **Paso 4:** `npm test`, `npm run lint` y `npm run build`. Resultado esperado: PASA.
- [ ] **Paso 5: Commit:** `feat: hook para buscar la ruta de evacuación`
- [ ] **Paso 6: Revisión por subagente** y correcciones.

### Tarea 9: `CapaRutasEvacuacion`

**Archivos:**
- Crear: `src/components/CapaRutasEvacuacion.jsx`, `src/components/CapaRutasEvacuacion.test.jsx`

**Interfaces:**
- Consume: `useCapasMapa`.
- Produce: `<CapaRutasEvacuacion mapa ruta={Feature | null} origen={[lon, lat] | null} destino={[lon, lat] | null} />`.
  - Fuentes: `evacuacion-ruta` y `evacuacion-puntos`. Esta última tiene dos `Point` con `properties.rol` igual a `'origen'` o `'destino'`.
  - Capas, siempre hasta arriba (sin `antesDe`):
    - `evacuacion-ruta-borde` (line blanca de 9 px)
    - `evacuacion-ruta` (line de 5 px con `match` sobre `nivelRiesgo`: `bajo` `#16a34a`, `medio` `#f59e0b`, `alto` `#dc2626`, cualquier otro `#6b7280`)
    - `evacuacion-puntos` (circle de radio 9 y borde blanco, con `origen` `#2563eb` y `destino` `#16a34a`)
  - Cuando llega una ruta nueva hace `mapa.fitBounds(cajaDeLaRuta, { padding: 48, maxZoom: 17 })`. Con `ruta: null` vacía las fuentes.

- [ ] **Paso 1: Pruebas que fallan** (con el mapa falso, más `fitBounds`):
  - `'dibuja la ruta con el color de su riesgo'`
  - `'marca origen y destino'`
  - `'encuadra la ruta al llegar'`: comprueba que la caja va en el orden `[[oeste, sur], [este, norte]]`.
  - `'con ruta null vacía las fuentes'`
  - `'va encima de las demás capas'`
- [ ] **Paso 2:** `npm test`. Resultado esperado: FALLA.
- [ ] **Paso 3:** Implementa el componente.
- [ ] **Paso 4:** `npm test`, `npm run lint` y `npm run build`. Resultado esperado: PASA.
- [ ] **Paso 5: Commit:** `feat: capa de la ruta de evacuación en el mapa`
- [ ] **Paso 6: Revisión por subagente** y correcciones.

### Tarea 10: Panel de evacuación en la página, `CLAUDE.md` y verificación

**Archivos:**
- Crear: `src/components/PanelEvacuacion.jsx`, `src/components/PanelEvacuacion.test.jsx`
- Modificar: `src/pages/Mapa.jsx`, `src/pages/Mapa.css`, `src/pages/Mapa.test.jsx`, `src/pages/Mapa.integracion.test.jsx` (simula `useRutaEvacuacion`)
- Modificar: `CLAUDE.md`
  - Fuentes de datos: una fila para `OpenStreetMap (Overpass API) | Calles y puntos de reunión | No | Frontend, solo a petición`.
  - Lógica de rutas: una nota de **"Ruta a pie sin conexión (Dijkstra con riesgo sísmico)"** con la fórmula de costo. Debe decir que ORS sigue siendo el motor principal en línea.

**Interfaces:**
- `PanelEvacuacion({ estado, error, resultado, zona, buscarRuta, limpiar })`:
  - **Botón** `Ruta a punto de reunión`, de 48 px, que llama `buscarRuta`. Cuando hay ruta aparece además `Quitar ruta`.
  - **Textos por estado:**
    - `ubicando`: `Buscando tu ubicación…`
    - `descargando`: `Descargando calles y puntos de reunión de tu zona (puede tardar hasta 1 minuto)…`
    - `calculando`: `Calculando la ruta más segura…`
    - `listo`: `` `${nombre}: ${distancia} · unos ${minutos} min a pie · riesgo ${nivelRiesgo}` ``. La distancia va como `650 m` si es menor a 1000 m, o como `1.2 km`.
    - `sin-ruta`: `No encontramos una ruta segura a un punto de reunión. Sigue las indicaciones de Protección Civil.`
    - `sin-puntos`: `No hay puntos de reunión registrados en OpenStreetMap cerca de ti. Sigue las indicaciones de Protección Civil.`
    - `lejos-de-calles`: `Estás lejos de las calles registradas; no se pudo calcular una ruta.`
    - `sin-zona-offline`: `Sin conexión y sin calles guardadas de esta zona. Cuando tengas señal, toca "Ruta a punto de reunión" para guardarlas.`
    - `error`: `` `No se pudo calcular la ruta: ${error}` ``
  - **Siempre que hay ruta:** `` `Calles y puntos de reunión © OpenStreetMap · descargado ${fecha}` `` y `Ruta calculada en tu teléfono; puede no reflejar daños recientes. Sigue las indicaciones oficiales.`
- En `Mapa.jsx`: `useRutaEvacuacion({ sismos: sismos.sismos })`, `<PanelEvacuacion …/>` en la barra superior y `<CapaRutasEvacuacion …/>` dentro del contenedor del mapa.

- [ ] **Paso 1: Pruebas que fallan:**
  - `PanelEvacuacion.test.jsx`: un caso por cada texto, más `'el botón llama buscarRuta'` y `'Quitar ruta llama limpiar'`.
  - `Mapa.test.jsx`: `'muestra el botón Ruta a punto de reunión'` y `'pasa la ruta a CapaRutasEvacuacion'`.
- [ ] **Paso 2:** `npm test`. Resultado esperado: FALLA.
- [ ] **Paso 3:** Implementa el panel, la integración, los estilos y `CLAUDE.md`.
- [ ] **Paso 4:** `npm test`, `npm run lint` y `npm run build`. Resultado esperado: PASA.
- [ ] **Paso 5: Verificación en navegador:** con `npm run dev` y Chrome sin ventana a 412 px, con la geolocalización simulada en CDMX (`Emulation.setGeolocationOverride` en `19.4326, -99.1332`), revisa:
  - aparece la ruta verde hasta un punto de reunión real;
  - el panel muestra la distancia, los minutos y el riesgo;
  - en modo sin conexión (`Network.emulateNetworkConditions offline`), una segunda búsqueda funciona con la zona guardada;
  - la consola no muestra errores.
  
  Si Overpass no responde, avisa al usuario en lugar de inventar datos.
- [ ] **Paso 6: Commit:** `feat: ruta de evacuación a pie en el mapa en vivo`
- [ ] **Paso 7: Revisión por subagente** y correcciones. Después va la revisión final de toda la rama.

---

### Tarea 10 (actualizada el 2026-10-16, después de fusionar la etapa 3)

La etapa 3 ya trajo bloqueos y refugios reales (Supabase), React Router y un `Mapa.jsx` nuevo. Esta versión reemplaza la tarea 10 de arriba. Se trabaja directo en `main`, por decisión del usuario.

**Datos que ahora existen:**
- `useBloqueos()` entrega `bloqueos`, un FeatureCollection de `Point` en `[lon, lat]` con `properties.tipo` igual a `'total'` o `'solo_vehiculos'`, y ya sin los vencidos.
- `useRefugios()` entrega `refugios`, un FeatureCollection de `Point` con `properties.estado` igual a `'abierto'`, `'lleno'` o `'cerrado'`.

**10a. `useRutaEvacuacion({ sismos, bloqueos, refugios })`:**
- Los refugios con `estado === 'abierto'` se suman como destinos, junto con los puntos de reunión de OSM. Cada refugio se pega al nodo de calle más cercano (≤ 300 m) y su posición real se revisa igual que la de los puntos.
- Los refugios `lleno` y `cerrado` se descartan, como pide `CLAUDE.md`.
- `resultado.puntoReunion` incluye `tipo: 'refugio' | 'punto-reunion'`.
- **Bloqueos sin confirmar:** todos los bloqueos vigentes cuentan, confirmados o no. Ante la duda no se pasa.

**10b. `PanelEvacuacion`:** un texto por cada estado y motivo. Además:
- si `sinDatosSismos`, avisa "riesgo sísmico desconocido" y no dice "riesgo bajo";
- el riesgo siempre va con palabras;
- muestra de cuándo son la zona guardada y la ubicación;
- con `ubicacion-imprecisa`, muestra el margen en metros;
- todo estado sin ruta termina con "Sigue las indicaciones de Protección Civil".

**10c. `Mapa.jsx`:**
- Los bloqueos y refugios que se pasan a la ruta deben ser estables (`useMemo`).
- `<CapaRutasEvacuacion>` va **al final**, para quedar encima.
- Si `sinDatosSismos`, la ruta se dibuja gris (`nivelRiesgo: 'desconocido'`).
- `CLAUDE.md` agrega la fila de Overpass y la nota de la ruta a pie sin conexión.

**10d.** Verificación en navegador con la geolocalización simulada y Overpass real. Después, la revisión por subagente (es lógica de rutas).
