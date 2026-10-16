# Etapa 2: ciclones (NHC + GDACS) y satélite (NASA GIBS) – Plan de implementación

> **Para agentes:** SUB-SKILL REQUERIDA: usa superpowers:subagent-driven-development (recomendado) o superpowers:executing-plans para implementar este plan tarea por tarea. Los pasos usan casillas (`- [ ]`) para seguimiento.

**Objetivo:** Agregar al mapa de la etapa 1:
- los ciclones tropicales activos cerca de México: cono de pronóstico, trayectoria, puntos de pronóstico, avisos en la costa y nivel de alerta de GDACS;
- una capa opcional de satélite GOES-East;
- botones para prender y apagar capas, y la fuente y hora de cada dato.

**Arquitectura:**
- Se repite el patrón de la etapa 1: `services/` descarga, `utils/` tiene funciones puras, `hooks/` maneja el estado y `components/` dibuja.
- Antes de agregar cosas nuevas se extrae lo que hoy está repetido o va a repetirse:
  - la petición con tiempo límite y errores en español (`services/http.js`);
  - la carga periódica con conexión y reintento (`useDatosPeriodicos`);
  - el alta y baja de capas en MapLibre, que sobrevive al cambio de estilo (`useCapasMapa`).
- NHC se lee **directo** del servicio ArcGIS oficial de NOAA en GeoJSON. Este servicio sí permite CORS; lo decidió el usuario el 2026-10-16 y se actualiza `CLAUDE.md`.

**Stack:** React 19, Vite 8, MapLibre GL 6.14, Vitest 5 + Testing Library. **Sin librerías nuevas.**

**Spec:** `CLAUDE.md` (Fuentes de datos, Interfaz, Roadmap punto 2) más la decisión del usuario sobre NHC.

## Restricciones globales

- Todo el texto de la interfaz, los comentarios y los commits van en **español**. Los commits terminan con `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- GeoJSON siempre en **`[longitud, latitud]`**.
- Los componentes no hacen `fetch`; todo pasa por `src/services/`.
- Al terminar cada tarea: `npm test`, `npm run lint` y `npm run build`. Los tres deben pasar.
- Ninguna tarea toca Supabase ni rutas, así que no se lanza revisión por subagente en cada tarea. Al final sí hay una revisión independiente de toda la rama.
- Se trabaja en la rama `feat/etapa2-ciclones-satelite`, que sale de `main`.
- **Endpoints, verificados el 2026-10-16:**
  - NHC (NOAA, GeoJSON con CORS): `https://mapservices.weather.noaa.gov/tropical/rest/services/tropical/NHC_tropical_weather_summary/MapServer/{capa}/query?where=1%3D1&outFields=*&f=geojson`, con las capas `5` puntos de pronóstico, `6` trayectoria, `7` cono y `8` avisos en la costa.
  - GDACS (CORS `*`): `https://www.gdacs.org/gdacsapi/api/events/geteventlist/SEARCH?eventlist=TC`
  - GIBS (CORS `*`): teselas en `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/GOES-East_ABI_GeoColor/default/{HORA}/GoogleMapsCompatible_Level7/{z}/{y}/{x}.png`, con `maxzoom` 7. Para saber la hora más reciente se hace un `HEAD` a la misma ruta con `default` en lugar de `{HORA}` y `0/0/0`; la cabecera `Layer-Time-Actual` trae la hora.
- Zona de interés para ciclones: `BBOX_CICLONES = [-130, 5, -70, 35]`, con el formato `[oeste, sur, este, norte]`.
- Intervalos de actualización: ciclones (NHC y GDACS) cada **15 min**, satélite cada **10 min** y solo mientras la capa esté prendida. Sismos se queda en 5 min.
- Tiempo límite de cada petición: 15 s (ya existe).
- Las fechas de GDACS vienen **sin zona horaria** y están en UTC: se leen agregando `Z`.
- MapLibre convierte en texto las propiedades anidadas. Por eso los servicios **aplanan** lo que los popups necesitan, por ejemplo `urlReporte` en lugar de `url.report`.
- Los datos de ejemplo solo viven en `src/mocks/`, con la marca `// DATOS DE EJEMPLO SOLO PARA PRUEBAS`.

## Puntos de revisión

1. **NOAA responde 200 con `{"error": …}`** (así fallan los servicios ArcGIS). Debe mostrarse un error y **nunca** "Sin ciclones activos", porque eso tranquilizaría a alguien en peligro. Pruebas en las tareas 5 y 11.
2. **Una tormenta aparece en una sola fuente** (hoy: Simon solo en GDACS y Trudy solo en NOAA) **o en las dos.** Se muestran todas y sin duplicados. Pruebas en la tarea 4.
3. **Falla una fuente y la otra no.** Se muestran los datos que sí llegaron, más el error de la que falló. Pruebas en la tarea 11.
4. **Fechas de GDACS sin zona horaria.** Se interpretan como UTC y no como hora local. Prueba en la tarea 6.
5. **GIBS no manda `Layer-Time-Actual`.** Debe ser un error y no la hora actual inventada. Prueba en la tarea 7.

---

### Tarea 1: Petición común con tiempo límite (`services/http.js`)

**Archivos:**
- Crear: `src/services/http.js`, `src/services/http.test.js`
- Modificar: `src/services/usgs.js` (usar `obtenerJson`; quitar su propio tiempo límite y su manejo de errores)

**Interfaces:**
- Produce:
  - `TIEMPO_LIMITE_MS = 15000`
  - `pedir(url, { signal, fuente, metodo = 'GET' }) => Promise<Response>`. Lanza `` `${fuente} respondió ${status}` ``, `` `No se pudo conectar con ${fuente}` `` o `` `${fuente} tardó demasiado en responder` ``. Un `AbortError` de quien llama se relanza sin cambios.
  - `obtenerJson(url, { signal, fuente }) => Promise<any>`. Lanza `` `Formato inesperado de ${fuente}` `` si el cuerpo no es JSON.

- [ ] **Paso 1: Pruebas que fallan** (`http.test.js`, con el mismo `fetch` falso que respeta `signal` que ya usa `usgs.test.js`):
  - `'usa el nombre de la fuente en los mensajes'`: con `fuente: 'GDACS'` y estado 500, el mensaje es `'GDACS respondió 500'`.
  - `'hace HEAD cuando se pide'`: `fetch` recibe `method: 'HEAD'`.
  - `'se rinde a los 15 segundos'`: el mensaje es `'NOAA tardó demasiado en responder'`.
  - `'traduce el fallo de red'`: el mensaje es `'No se pudo conectar con NASA GIBS'`.
  - `'respeta la cancelación de quien llama'`: el error tiene `name: 'AbortError'`.
  - `'obtenerJson avisa si no es JSON'`: el mensaje es `'Formato inesperado de NOAA'`.
- [ ] **Paso 2:** `npm test`. Resultado esperado: FALLA porque `http.js` no existe.
- [ ] **Paso 3:** Implementa `http.js` moviendo la lógica que hoy está en `usgs.js`. `usgs.js` queda así: `obtenerJson(URL_SISMOS_USGS, { signal, fuente: 'USGS' })`, después se valida `features` y se prepara la colección.
- [ ] **Paso 4:** `npm test`. Resultado esperado: PASA, **incluidas sin cambios** las pruebas que ya existían en `usgs.test.js`.
- [ ] **Paso 5: Commit:** `refactor: petición común con tiempo límite para todas las fuentes`

### Tarea 2: Hook genérico `useDatosPeriodicos`

**Archivos:**
- Crear: `src/hooks/useDatosPeriodicos.js`, `src/hooks/useDatosPeriodicos.test.js`
- Modificar: `src/hooks/useSismos.js` (pasa a ser una envoltura del hook genérico)

**Interfaces:**
- Produce: `useDatosPeriodicos(obtener, intervaloMs, { activo = true } = {}) => { datos, estado, error, actualizadoEn, sinConexion, recargar }`.
  - `obtener({ signal }) => Promise<{ datos, actualizadoEn: number | null }>` debe estar definida fuera del componente para que no cambie en cada render. El hook guarda la última versión en una ref.
  - Con `activo: false` no pide nada ni programa el intervalo. Al pasar a `true`, carga en ese momento.
  - Mantiene **todo** el comportamiento actual de `useSismos`: conserva los datos si falla una recarga, recarga al volver la conexión, aborta al desmontar e ignora el `AbortError`, y una descarga exitosa quita el aviso de sin conexión.
- `useSismos()` mantiene su forma actual (`sismos`, …). Internamente usa `useDatosPeriodicos(cargarSismos, INTERVALO_ACTUALIZACION_MS)`, donde `cargarSismos` adapta `{ coleccion, generadoEn }` a `{ datos, actualizadoEn }`.

- [ ] **Paso 1: Pruebas que fallan** (`useDatosPeriodicos.test.js`, con temporizadores falsos como en `useSismos.test.js`):
  - `'respeta el intervalo que recibe'`: con 60000 ms, hay 2 llamadas a los 60 s.
  - `'no pide nada mientras activo es false'`: 0 llamadas después de 10 min.
  - `'carga en cuanto activo pasa a true'`: 1 llamada después de `rerender`.
  - `'deja de pedir al pasar activo a false'`
- [ ] **Paso 2:** `npm test`. Resultado esperado: FALLA.
- [ ] **Paso 3:** Implementa el hook moviendo el efecto de `useSismos`. Comenta cada efecto.
- [ ] **Paso 4:** `npm test`. Resultado esperado: PASA, incluidas **sin cambios** las 9 pruebas de `useSismos.test.js`.
- [ ] **Paso 5: Commit:** `refactor: hook genérico para datos que se actualizan solos`

### Tarea 3: Hook `useCapasMapa` y `CapaSismos` con `visible`

**Archivos:**
- Crear: `src/hooks/useCapasMapa.js`, `src/hooks/useCapasMapa.test.js`
- Modificar: `src/components/CapaSismos.jsx` (usar el hook y aceptar `visible`), `src/components/CapaSismos.test.jsx`

**Interfaces:**
- Produce: `useCapasMapa(mapa, { fuentes, capas, clics = {}, visible = true })`
  - `fuentes`: `[{ id, definicion: () => objetoFuente }]`. Es una función para que siempre lea los datos más recientes.
  - `capas`: objetos de capa de MapLibre. Cada uno puede traer `antesDe`, que es un id de capa o `(mapa) => id | undefined`. Si la capa indicada existe, la capa nueva se inserta debajo de ella; si no, va hasta arriba. `antesDe` se quita antes de llamar a `addLayer`.
  - `clics`: `{ idCapa: (evento) => void }`
  - Agrega todo al montar y otra vez en cada `'style.load'`, solo si la primera fuente no existe todavía.
  - Aplica `visibility: visible ? 'visible' : 'none'` a todas sus capas cuando cambia `visible` y después de volver a agregarlas.
  - Al desmontar quita los listeners, las capas en orden inverso y las fuentes, con el mismo `try/catch` que hoy tiene `CapaSismos`.
  - Usa la última configuración guardada en una ref, y su efecto principal depende solo de `[mapa]`.
- `CapaSismos({ mapa, sismos, visible = true })` mantiene sus ids (`sismos`, `sismos-circulos`, `sismos-toque`), su popup y el efecto de `setData`.

- [ ] **Paso 1: Pruebas que fallan** (`useCapasMapa.test.js`, con el mapa falso de `CapaSismos.test.jsx` más `setLayoutProperty`; muévelo a `src/test/mapaFalso.js` y reúsalo en los dos archivos):
  - `'agrega fuentes y capas en orden'`
  - `'inserta debajo de antesDe si esa capa existe'`: `addLayer` recibe `(capa, 'sismos-circulos')`.
  - `'va hasta arriba si antesDe no existe'`
  - `'vuelve a agregar todo en style.load con datos frescos'`
  - `'oculta y muestra todas sus capas con visible'`: `setLayoutProperty(id, 'visibility', 'none')`.
  - `'limpia todo al desmontar y no falla si el mapa ya se eliminó'`
  - En `CapaSismos.test.jsx`: `'oculta los sismos con visible false'`
- [ ] **Paso 2:** `npm test`. Resultado esperado: FALLA.
- [ ] **Paso 3:** Implementa el hook y cambia `CapaSismos` para usarlo.
- [ ] **Paso 4:** `npm test`. Resultado esperado: PASA, incluidas sin cambios las pruebas que ya existían de `CapaSismos` y de la integración.
- [ ] **Paso 5: Commit:** `refactor: hook para capas del mapa que sobreviven al cambio de estilo`

### Tarea 4: Utilidades de geografía y ciclones, y datos de ejemplo

**Archivos:**
- Crear: `src/utils/geo.js`, `src/utils/geo.test.js`, `src/utils/ciclones.js`, `src/utils/ciclones.test.js`, `src/mocks/ciclonesEjemplo.js`
- Modificar: `src/utils/sismos.js` (`filtrarSismosMexico` usa `dentroDeCaja`)

**Interfaces:**
- Produce en `geo.js`: `dentroDeCaja([longitud, latitud], [oeste, sur, este, norte]) => boolean`
- Produce en `ciclones.js`:
  - `BBOX_CICLONES`
  - `nudosAKmh(nudos) => number | null`, redondeado
  - `nombreTipoCiclon(codigo) => string`. Equivalencias: `HU` Huracán, `MH` Huracán mayor, `TS` Tormenta tropical, `TD` Depresión tropical, `STS` Tormenta subtropical, `STD` Depresión subtropical, `PTC` Ciclón tropical potencial, `PT` Ciclón postropical. Cualquier otro código: Ciclón tropical.
  - `nombreAlertaGdacs(nivel) => 'verde' | 'naranja' | 'roja' | null`
  - `nombreCorto(texto) => string`: la última palabra de `"Hurricane Trudy"`, o lo que va antes del guion en `"SIMON-26"`, con mayúscula inicial. Resultados: `'Trudy'` y `'Simon'`.
  - `combinarCiclones(puntosNhc, eventosGdacs) => Ciclon[]`, donde `Ciclon = { id, nombre, tipo, vientoKmh, categoria, posicion, fuente: 'NHC' | 'GDACS', alertaGdacs }`. Cada argumento es un `FeatureCollection` o `null`.
    - De NHC salen los puntos con `tau === 0`.
    - De GDACS salen los eventos cuyo `nombreCorto` no está ya en NHC.
    - Se ordenan por `vientoKmh` de mayor a menor; los `null` van al final.
  - `eventosGdacsSinNhc(puntosNhc, eventosGdacs) => FeatureCollection`
- `ciclonesEjemplo.js` exporta `puntosNhcEjemplo` y `eventosGdacsEjemplo`:
  - `puntosNhcEjemplo`: Trudy, `EP1`, `HU`, 75 kt, `ssnum` 1, `tau` 0 en `[-102, 15]`, más un punto `tau` 12. Las propiedades copian las de la capa 5 de NOAA.
  - `eventosGdacsEjemplo`: `SIMON-26` en `[-110.3, 21.5]` con `episodealertlevel: 'Green'` y `TRUDY-26` en `[-102, 15]` con `'Orange'`, ya aplanados como los deja la tarea 6.

- [ ] **Paso 1: Pruebas que fallan:**
  - `geo.test.js`: un punto en el borde cuenta como dentro, y `[lat, lon]` invertido queda fuera.
  - `ciclones.test.js`:
    - `nudosAKmh(75) === 139`, `nudosAKmh(65) === 120` y `nudosAKmh(null) === null`
    - `nombreTipoCiclon('PTC') === 'Ciclón tropical potencial'` y `nombreTipoCiclon('XX') === 'Ciclón tropical'`
    - `nombreCorto('Hurricane Trudy') === 'Trudy'` y `nombreCorto('SIMON-26') === 'Simon'`
    - `'combina NHC y GDACS sin duplicar'`: el resultado es `[{ nombre: 'Trudy', fuente: 'NHC', vientoKmh: 139, categoria: 1, alertaGdacs: 'naranja', posicion: [-102, 15] }, { nombre: 'Simon', fuente: 'GDACS', vientoKmh: null, alertaGdacs: 'verde' }]`. Compara con `toMatchObject`.
    - `'si NHC no llegó usa solo GDACS'` y `'si nada llegó devuelve []'`
    - `'eventosGdacsSinNhc deja solo a Simon'`
- [ ] **Paso 2:** `npm test`. Resultado esperado: FALLA.
- [ ] **Paso 3:** Implementa las utilidades.
- [ ] **Paso 4:** `npm test`. Resultado esperado: PASA, incluidas las pruebas de sismos.
- [ ] **Paso 5: Commit:** `feat: utilidades para combinar ciclones de NHC y GDACS`

### Tarea 5: Servicio NHC (NOAA)

**Archivos:**
- Crear: `src/services/nhc.js`, `src/services/nhc.test.js`

**Interfaces:**
- Consume: `obtenerJson` (tarea 1) y `dentroDeCaja` y `BBOX_CICLONES` (tarea 4).
- Produce: `URL_NHC_BASE`, `CAPAS_NHC = { puntos: 5, trayectorias: 6, conos: 7, avisos: 8 }` y `obtenerCiclonesNhc({ signal }) => Promise<{ puntos, trayectorias, conos, avisos, actualizadoEn }>`.
  - Hace las 4 consultas en paralelo con `fuente: 'NOAA'`.
  - Si **cualquiera** de las 4 respuestas no trae `features` como arreglo (por ejemplo `{"error": …}`), lanza `'Formato inesperado de NOAA'`.
  - Filtra los puntos con `dentroDeCaja` y conserva conos, trayectorias y avisos solo de las tormentas (`binnumber`) que quedaron.
  - `actualizadoEn` es el `idp_filedate` más alto, o `null` si no hay tormentas.

- [ ] **Paso 1: Pruebas que fallan** (simula `fetch` por URL):
  - `'pide las 4 capas del servicio de resumen'`: comprueba las URLs con `/5/query`, `/6/query`, `/7/query` y `/8/query`, y que incluyan `f=geojson`.
  - `'falla si NOAA responde con error de ArcGIS'`: con `{ error: { code: 400, message: 'Invalid' } }` en la capa 7, el mensaje es `'Formato inesperado de NOAA'`.
  - `'quita tormentas fuera de la zona y sus conos'`: con un punto en `[150, 12]` y `binnumber` `'WP1'`, ese bin no aparece en ninguna colección.
  - `'actualizadoEn es el idp_filedate más reciente'` y `'sin tormentas actualizadoEn es null'`
- [ ] **Paso 2:** `npm test`. Resultado esperado: FALLA.
- [ ] **Paso 3:** Implementa el servicio.
- [ ] **Paso 4:** `npm test`. Resultado esperado: PASA.
- [ ] **Paso 5: Commit:** `feat: servicio de ciclones del NHC desde NOAA`

### Tarea 6: Servicio GDACS

**Archivos:**
- Crear: `src/services/gdacs.js`, `src/services/gdacs.test.js`

**Interfaces:**
- Consume: `obtenerJson`, `dentroDeCaja` y `BBOX_CICLONES`.
- Produce: `URL_GDACS_CICLONES` y `obtenerCiclonesGdacs({ signal }) => Promise<{ eventos: FeatureCollection, actualizadoEn }>`.
  - Deja solo los eventos con `iscurrent === 'true'` que están dentro de la caja.
  - Cada evento queda con propiedades planas: `eventid`, `eventname`, `episodealertlevel`, `alertlevel`, `fechaModificacion` y `urlReporte`. `fechaModificacion` es `datemodified` leído como UTC, en milisegundos. `urlReporte` es `url.report`, solo si empieza con `https://`.
  - `actualizadoEn` es la `fechaModificacion` más alta, o `null`.
  - Si `features` no es un arreglo, lanza `'Formato inesperado de GDACS'`.

- [ ] **Paso 1: Pruebas que fallan:**
  - `'deja solo ciclones actuales cerca de México'`: con SIMON (actual, dentro), POLO (no actual, dentro) y CHAMPI (actual, en `[150.2, 11.9]`), solo queda `[1001335]`.
  - `'lee datemodified como UTC'`: `'2026-10-16T20:53:55'` da `Date.UTC(2026, 9, 16, 20, 53, 55)`.
  - `'aplana url.report en urlReporte'`
  - `'falla si cambia el formato'`
- [ ] **Paso 2:** `npm test`. Resultado esperado: FALLA.
- [ ] **Paso 3:** Implementa el servicio.
- [ ] **Paso 4:** `npm test`. Resultado esperado: PASA.
- [ ] **Paso 5: Commit:** `feat: servicio de ciclones de GDACS`

### Tarea 7: Servicio de satélite (GIBS) y hook `useSatelite`

**Archivos:**
- Crear: `src/services/gibs.js`, `src/services/gibs.test.js`, `src/hooks/useSatelite.js`, `src/hooks/useSatelite.test.js`

**Interfaces:**
- Consume: `pedir` (tarea 1, con `metodo: 'HEAD'`) y `useDatosPeriodicos` (tarea 2).
- Produce:
  - `urlTeselasSatelite(hora: string) => string`, con la plantilla de las restricciones globales.
  - `obtenerHoraSatelite({ signal }) => Promise<{ datos: string, actualizadoEn: number }>`. `datos` es el valor de `Layer-Time-Actual`, por ejemplo `'2026-10-16T21:30:00Z'`. Si falta la cabecera, lanza `'Formato inesperado de NASA GIBS'`.
  - `INTERVALO_SATELITE_MS = 600000` y `useSatelite(activo: boolean)`, que devuelve lo mismo que `useDatosPeriodicos`.

- [ ] **Paso 1: Pruebas que fallan:**
  - `'arma la URL de teselas con la hora y {z}/{y}/{x}'`: compara con el texto exacto de la plantilla y la hora `2026-10-16T21:30:00Z`.
  - `'lee la hora de Layer-Time-Actual con un HEAD'`: `actualizadoEn` es `Date.UTC(2026, 9, 16, 21, 30)`.
  - `'falla si no viene la cabecera'`
  - `'useSatelite no pide nada si la capa está apagada'`
- [ ] **Paso 2:** `npm test`. Resultado esperado: FALLA.
- [ ] **Paso 3:** Implementa el servicio y el hook.
- [ ] **Paso 4:** `npm test`. Resultado esperado: PASA.
- [ ] **Paso 5: Commit:** `feat: hora de la imagen de satélite GOES-East desde NASA GIBS`

### Tarea 8: Hook `useCiclones`

**Archivos:**
- Crear: `src/hooks/useCiclones.js`, `src/hooks/useCiclones.test.js`

**Interfaces:**
- Consume: `obtenerCiclonesNhc`, `obtenerCiclonesGdacs` y `useDatosPeriodicos` (cada fuente con su propio estado), además de `combinarCiclones` y `eventosGdacsSinNhc`.
- Produce: `INTERVALO_CICLONES_MS = 900000` y `useCiclones() => { nhc, gdacs, ciclones: Ciclon[], eventosGdacsSinNhc: FeatureCollection }`.
  - `nhc` y `gdacs` tienen la forma que devuelve `useDatosPeriodicos`.
  - `ciclones` se calcula con `useMemo` a partir de lo que haya llegado.

- [ ] **Paso 1: Pruebas que fallan** (simula los dos servicios):
  - `'combina las dos fuentes cuando ambas responden'`: el resultado es `['Trudy', 'Simon']`.
  - `'si GDACS falla conserva los ciclones de NHC y reporta el error de GDACS'`
  - `'pide cada fuente cada 15 minutos'`
- [ ] **Paso 2:** `npm test`. Resultado esperado: FALLA.
- [ ] **Paso 3:** Implementa el hook.
- [ ] **Paso 4:** `npm test`. Resultado esperado: PASA.
- [ ] **Paso 5: Commit:** `feat: hook useCiclones que combina NHC y GDACS`

### Tarea 9: Componente `CapaCiclones`

**Archivos:**
- Crear: `src/components/CapaCiclones.jsx`, `src/components/CapaCiclones.test.jsx`

**Interfaces:**
- Consume: `useCapasMapa` (tarea 3), las utilidades de la tarea 4 y `formatearFechaHora`.
- Produce: `<CapaCiclones mapa nhc={datos de NHC | null} eventosGdacs={FeatureCollection | null} visible />`, que devuelve `null`.
  - Fuentes: `ciclones-conos`, `ciclones-trayectorias`, `ciclones-avisos`, `ciclones-puntos` y `ciclones-gdacs`. Cuando cambian los datos se actualizan con `setData`.
  - Capas, de abajo hacia arriba, todas con `antesDe: 'sismos-circulos'`:
    - `ciclones-conos-relleno` (fill `#ffffff`, opacidad 0.25)
    - `ciclones-conos-borde` (line `#374151`, 1.5)
    - `ciclones-avisos` (line de 4 px con `match` sobre `tcww`: `HWR` `#dc2626`, `HWA` `#f472b6`, `TWR` `#2563eb`, `TWA` `#facc15`, cualquier otro `#6b7280`)
    - `ciclones-trayectorias` (line `#111827`, 2 px, `line-dasharray [2, 2]`)
    - `ciclones-puntos` (circle `#7c3aed`, borde blanco, radio 9 si `tau == 0` y 5 si no)
    - `ciclones-nombres` (symbol con `filter ['==', ['get', 'tau'], 0]`, `text-field ['get', 'stormname']`, `text-font ['Noto Sans Bold']`, `text-offset [0, 1.4]`)
    - `ciclones-gdacs` (circle de radio 9, borde `#111827` de 2 px y color con `match` sobre `episodealertlevel`: Green `#16a34a`, Orange `#f97316`, Red `#dc2626`)
    - `ciclones-puntos-toque` y `ciclones-gdacs-toque` (radio 18, opacidad 0)
  - Popup de NHC, armado con `textContent`:
    - título `${nombreTipoCiclon(stormtype)} ${nombreCorto(stormname)}`
    - `Posición actual` o `` `Pronóstico a ${tau} h` ``
    - `` `Viento: ${kmh} km/h (ráfagas ${kmhRafaga} km/h)` ``
    - `` `Presión: ${mslp} hPa` `` solo si `mslp > 0`
    - `` `Aviso NHC ${advisnum}` ``
    - el enlace `Ver avisos del NHC` a `https://www.nhc.noaa.gov/?epac` si `basin === 'EP'` o a `?atlc` en otro caso
  - Popup de GDACS:
    - título `` `Ciclón tropical ${nombreCorto(eventname)}` ``
    - `` `Alerta GDACS: ${nombreAlertaGdacs(episodealertlevel)}` ``
    - `` `Actualizado: ${formatearFechaHora(fechaModificacion)}` ``
    - el enlace `Ver reporte de GDACS` (solo si hay `urlReporte`)

- [ ] **Paso 1: Pruebas que fallan** (usa `src/test/mapaFalso.js` y features con la forma que devuelve MapLibre, es decir, propiedades planas y coordenadas 2D):
  - `'agrega las capas de ciclones debajo de los sismos'`: cada `addLayer` recibe `'sismos-circulos'` cuando esa capa existe.
  - `'pinta los avisos con los colores del NHC'`: compara la expresión `match` exacta.
  - `'popup de NHC en español con km/h'`: Trudy da `'Huracán Trudy'`, `'Posición actual'` y `'Viento: 139 km/h (ráfagas 167 km/h)'`.
  - `'popup de GDACS con la alerta en español'`: Simon da `'Alerta GDACS: verde'`.
  - `'no pone enlace de GDACS si no hay urlReporte'`
  - `'actualiza los datos con setData'`
- [ ] **Paso 2:** `npm test`. Resultado esperado: FALLA.
- [ ] **Paso 3:** Implementa el componente.
- [ ] **Paso 4:** `npm test`. Resultado esperado: PASA.
- [ ] **Paso 5: Commit:** `feat: capa de ciclones con cono, trayectoria y avisos`

### Tarea 10: Componente `CapaSatelite`

**Archivos:**
- Crear: `src/components/CapaSatelite.jsx`, `src/components/CapaSatelite.test.jsx`

**Interfaces:**
- Consume: `useCapasMapa` y `urlTeselasSatelite`.
- Produce: `<CapaSatelite mapa hora={string | null} visible />`.
  - No agrega nada mientras `hora` sea `null`.
  - Fuente `satelite`: `{ type: 'raster', tiles: [urlTeselasSatelite(hora)], tileSize: 256, maxzoom: 7, attribution: 'Imágenes: NASA GIBS / NOAA GOES-East' }`.
  - Capa `satelite`: raster con `raster-opacity` 0.8 y `antesDe` igual a la primera capa `symbol` de `mapa.getStyle().layers`, para que los nombres de las ciudades queden encima.
  - Cuando cambia `hora`, llama `getSource('satelite').setTiles([nuevaUrl])`.

- [ ] **Paso 1: Pruebas que fallan:**
  - `'no agrega nada sin hora'`
  - `'agrega el satélite debajo de la primera capa de nombres'`
  - `'cambia las teselas cuando llega una hora nueva'`
  - `'se oculta con visible false'`
- [ ] **Paso 2:** `npm test`. Resultado esperado: FALLA.
- [ ] **Paso 3:** Implementa el componente.
- [ ] **Paso 4:** `npm test`. Resultado esperado: PASA.
- [ ] **Paso 5: Commit:** `feat: capa de satélite GOES-East`

### Tarea 11: Página "Mapa en vivo", panel de capas, mensajes por fuente y `CLAUDE.md`

**Archivos:**
- Crear:
  - `src/components/MensajeFuente.jsx`, `src/components/MensajeFuente.test.jsx`
  - `src/components/PanelCapas.jsx`, `src/components/PanelCapas.test.jsx`
  - `src/components/LeyendaCiclones.jsx`
- Modificar:
  - `src/pages/Mapa.jsx`, `src/pages/Mapa.css`
  - `src/pages/Mapa.test.jsx`: se actualizan los textos que cambian
  - `src/pages/Mapa.integracion.test.jsx`
  - `index.html`: `<title>Mapa en vivo</title>`
  - `CLAUDE.md`

**Interfaces:**
- Consume: los hooks y componentes de las tareas 2 a 10.
- `MensajeFuente({ etiqueta, plural, estado, error, hayDatos, hora, recargar })`:
  - Si todo está bien, devuelve `null`.
  - Con `verbo = plural ? 'pudieron' : 'pudo'`, los textos son:
    - cargando sin datos: `` `Cargando ${etiqueta}…` ``
    - cargando con datos: `` `Actualizando ${etiqueta}…` ``
    - error sin datos: `` `No se ${verbo} cargar ${etiqueta}: ${error}` ``
    - error con datos: `` `No se ${verbo} actualizar ${etiqueta}. Mostrando datos del ${hora}.` ``
  - Con error muestra el botón `Reintentar` (48 px).
  - Etiquetas: `los sismos` (plural), `los ciclones de NHC` (plural), `los ciclones de GDACS` (plural), `la imagen de satélite` (singular).
- `PanelCapas({ capas: { sismos, ciclones, satelite }, alCambiar(nombre, valor) })`: tres casillas con las etiquetas `Sismos`, `Ciclones` y `Satélite`, de al menos 48 px de alto. Los valores iniciales en `Mapa` son `true`, `true` y `false`.
- La página `Mapa`:
  - Título `Mapa en vivo`.
  - El aviso de sin conexión aparece **una sola vez** si cualquier hook lo marca: `Sin conexión. Se muestran los últimos datos descargados.`
  - Un `MensajeFuente` por fuente. El de satélite solo aparece si su capa está prendida.
  - Lista de ciclones: un renglón por ciclón, `` `${tipo ?? 'Ciclón tropical'} ${nombre}` ``, más `` ` · categoría ${categoria}` ``, `` ` · ${vientoKmh} km/h` `` y `` ` · alerta GDACS ${alertaGdacs}` `` cuando existan.
  - `Sin ciclones activos cerca de México según NHC y GDACS.` **solo** si `nhc.estado === 'listo'`, `gdacs.estado === 'listo'` y la lista está vacía.
  - El mensaje de sismos sin datos de la semana y el conteo se quedan como están.
  - Pie: `` `Sismos: USGS · ${hora}` ``, `` `Ciclones: NHC/NOAA · ${horaNhc} · GDACS · ${horaGdacs}` `` y, si el satélite está prendido, `` `Satélite: NASA GIBS (GOES-East) · ${horaSatelite}` ``. Se usa `—` cuando no hay hora. El aviso oficial se queda igual.
  - `LeyendaCiclones`: cono, trayectoria, aviso de huracán, vigilancia de huracán, aviso de tormenta tropical, vigilancia de tormenta tropical, y las alertas GDACS verde, naranja y roja, con los colores de la tarea 9.
- En `CLAUDE.md`, sección "Fuentes de datos":
  - la fila de NHC pasa a ser `NOAA mapservices NHC_tropical_weather_summary (ArcGIS, GeoJSON, CORS) | Huracanes: cono, trayectoria, puntos, avisos | No | Frontend`;
  - debajo va una nota: `CurrentStorms.json no tiene CORS; no se usa.`;
  - la fila de GIBS indica `GOES-East_ABI_GeoColor, hora con HEAD + Layer-Time-Actual`.

- [ ] **Paso 1: Pruebas que fallan:**
  - `MensajeFuente.test.jsx`: un caso por cada texto, incluida la concordancia `'No se pudo cargar la imagen de satélite: …'`, y `'Reintentar llama recargar'`.
  - `PanelCapas.test.jsx`: `'marcar Satélite llama alCambiar("satelite", true)'`.
  - `Mapa.test.jsx` (simula los 3 hooks):
    - `'muestra el título Mapa en vivo'`
    - `'nunca dice "Sin ciclones activos" si NOAA falló'`: con `nhc.estado: 'error'` y `gdacs` listo y vacío, no aparece ese texto y sí aparece `'No se pudieron cargar los ciclones de NHC: Formato inesperado de NOAA'`.
    - `'si GDACS falla igual lista los ciclones de NHC'`
    - `'lista Huracán Trudy · categoría 1 · 139 km/h · alerta GDACS naranja'`
    - `'sin conexión se avisa una sola vez'`
    - `'el pie muestra la hora de cada fuente'`
    - `'el mensaje de satélite solo aparece con la capa prendida'`
  - Actualiza las pruebas de la página que ya existían para los textos nuevos de sismos, por ejemplo `'Cargando los sismos…'` y `'No se pudieron actualizar los sismos. Mostrando datos del …'`.
- [ ] **Paso 2:** `npm test`. Resultado esperado: FALLA.
- [ ] **Paso 3:** Implementa los componentes, la página, los estilos (el panel arriba a la izquierda sobre el mapa y la leyenda plegable en el pie), `index.html` y `CLAUDE.md`.
- [ ] **Paso 4:** `npm test`, `npm run lint` y `npm run build`. Resultado esperado: todo PASA.
- [ ] **Paso 5: Verificación en navegador:** con `npm run dev` y el script de Chrome sin ventana de la etapa 1 (en el scratchpad), en ancho de celular, revisa:
  - aparecen el cono y la trayectoria de cualquier ciclón activo, y el punto de GDACS de las tormentas que NHC no tiene;
  - al prender Satélite se ven las nubes debajo de los nombres de las ciudades;
  - el pie trae las 3 horas;
  - la consola no muestra errores.
  
  Si no hay ciclones activos ese día, confirma el mensaje `Sin ciclones activos…` y avisa al usuario en lugar de inventar datos.
- [ ] **Paso 6: Commit:** `feat: mapa en vivo con ciclones, satélite y panel de capas`
