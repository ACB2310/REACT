# Mapa con sismos de USGS – Plan de implementación

> **Para agentes:** SUB-SKILL REQUERIDA: usa superpowers:subagent-driven-development (recomendado) o superpowers:executing-plans para implementar este plan tarea por tarea. Los pasos usan casillas (`- [ ]`) para seguimiento.

**Objetivo:** Una pantalla móvil con un mapa MapLibre que muestra los sismos recientes de USGS en México y alrededores, con color por magnitud, popup de detalle, fuente y hora de actualización, y estados de cargando / error / sin conexión.

**Arquitectura:** `services/usgs.js` descarga el feed GeoJSON; `utils/sismos.js` filtra por la caja de México y define los colores; el hook `useSismos` maneja carga, refresco cada 5 min y conexión; `MapaBase` crea el mapa y `CapaSismos` dibuja una capa de círculos; la página `Mapa` junta todo. Los componentes nunca hacen `fetch` directo.

**Stack:** React 19, Vite 8, JavaScript + JSX, MapLibre GL, CSS sin frameworks, Vitest + Testing Library (nuevo, solo para desarrollo).

**Spec:** `CLAUDE.md` (secciones Stack, Estructura de carpetas, Fuentes de datos, Interfaz, Roadmap punto 1).

## Restricciones globales

- Todo el texto de la interfaz, los comentarios y los mensajes de commit van en **español**.
- Geometría en GeoJSON con coordenadas **`[longitud, latitud]`** (EPSG:4326). Nunca invertir.
- Los componentes **no** hacen `fetch`: usan `src/services/` o `src/hooks/`.
- Un componente por archivo, PascalCase; funciones y variables en camelCase, en español.
- Feed: `https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_week.geojson` (magnitud 2.5+, últimos 7 días, sin llave).
- Caja de México: `BBOX_MEXICO = [-118.5, 14.0, -86.0, 33.0]` (`[oeste, sur, este, norte]`).
- Horas mostradas en zona `America/Mexico_City`, locale `es-MX`.
- Mapa base: OpenFreeMap (sin llave) `https://tiles.openfreemap.org/styles/liberty`, y `https://tiles.openfreemap.org/styles/dark` en modo oscuro.
- Aviso fijo, texto exacto: `Plataforma informativa. Las indicaciones oficiales de Protección Civil, SMN y SSN tienen prioridad.`
- Diseño móvil primero: botones de al menos 48 px de alto, alto contraste y modo oscuro con `prefers-color-scheme`.
- Sin datos falsos en producción: los datos de ejemplo solo viven en `src/mocks/` y se usan solo en pruebas.
- Librerías nuevas: `maplibre-gl` (ya está en el stack). Para desarrollo: `vitest`, `jsdom`, `@testing-library/react`, `@testing-library/jest-dom`. **Por qué:** el proyecto no tiene pruebas, y Vitest usa la misma configuración de Vite. Hay que avisarle esto al equipo.
- React Router todavía **no** se instala: en esta etapa solo hay una pantalla. Se agrega en la etapa 3.
- Antes de cerrar cada tarea, ejecuta `npm run lint`, `npm test` y `npm run build`. Los tres deben terminar sin errores.

## Puntos de revisión

1. **Orden de coordenadas invertido**: un sismo con `[lat, lon]` no debe aparecer en México y el popup debe abrirse en `[coordinates[0], coordinates[1]]`. Pruebas en las tareas 2 y 6.
2. **USGS falla o cambia de formato** (HTTP 503, JSON sin `features`): mostrar el error real y "Reintentar", nunca datos inventados. Pruebas en las tareas 3 y 7.
3. **Se pierde la señal después de cargar**: conservar los últimos datos y mostrar "Sin conexión" con la hora de esos datos. Pruebas en las tareas 4 y 7.
4. **Semana sin sismos en la zona**: mostrar un mensaje claro en lugar de un mapa vacío sin explicación. Prueba en la tarea 7.
5. **`mag` en `null`** (USGS lo envía a veces) o un `place` con HTML: no se rompe la app, se muestra "M ?" y el texto se trata como texto, no como HTML. Pruebas en las tareas 2 y 6.

---

### Tarea 1: Configurar pruebas, limpiar `App.jsx` y formato de fecha

**Archivos:**
- Modificar: `package.json` (script `"test": "vitest run"`, dependencias de desarrollo)
- Modificar: `vite.config.js` (bloque `test`)
- Crear: `src/test/setup.js` (`import '@testing-library/jest-dom/vitest'`)
- Crear: `src/utils/fechas.js`, `src/utils/fechas.test.js`
- Modificar: `src/App.jsx` (quitar imports y `count` sin usar; por ahora renderiza solo `<main>` con el título)

**Interfaces:**
- Produce: `formatearFechaHora(ms: number) => string`, por ejemplo `"14 nov 2023, 16:13"`.

- [ ] **Paso 1:** `npm install -D vitest jsdom @testing-library/react @testing-library/jest-dom`. Si `npm` marca conflicto de *peer dependencies* con Vite 8, instala la versión de Vitest que declara soporte para Vite 8 (`npm view vitest peerDependencies`). No uses `--force`.
- [ ] **Paso 2:** En `vite.config.js` agrega `test: { environment: 'jsdom', setupFiles: './src/test/setup.js' }`. Agrega `"test": "vitest run"` a `scripts`.
- [ ] **Paso 3: Escribir la prueba que falla** (`src/utils/fechas.test.js`)

```js
import { describe, it, expect } from 'vitest'
import { formatearFechaHora } from './fechas.js'

describe('formatearFechaHora', () => {
  it('usa la hora de Ciudad de México en formato 24 h', () => {
    // 1700000000000 = 2023-11-14 22:13:20 UTC = 16:13 en CDMX (UTC-6)
    const texto = formatearFechaHora(1700000000000)
    expect(texto).toContain('16:13')
    expect(texto).toContain('2023')
    expect(texto).toMatch(/nov/i)
  })
  it('devuelve "sin fecha" si no recibe un número', () => {
    expect(formatearFechaHora(null)).toBe('sin fecha')
  })
})
```

- [ ] **Paso 4:** `npm test`. Resultado esperado: FALLA porque `fechas.js` no existe.
- [ ] **Paso 5:** Implementa `formatearFechaHora` con `Intl.DateTimeFormat('es-MX', { timeZone: 'America/Mexico_City', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })`. Crea el formateador una sola vez, fuera de la función.
- [ ] **Paso 6:** `npm test`, `npm run lint` y `npm run build`. Resultado esperado: todo PASA y el lint ya no marca variables sin usar en `App.jsx`.
- [ ] **Paso 7: Commit:** `git add -A && git commit -m "chore: configurar Vitest y formato de fecha en hora de CDMX"`

### Tarea 2: Utilidades de sismos y datos de ejemplo

**Archivos:**
- Crear: `src/utils/sismos.js`, `src/utils/sismos.test.js`
- Crear: `src/mocks/sismosEjemplo.js` (primera línea: `// DATOS DE EJEMPLO SOLO PARA PRUEBAS – no usar en producción`)

**Interfaces:**
- Produce:
  - `BBOX_MEXICO` (constante de las restricciones globales)
  - `UMBRALES_MAGNITUD = [{ min: 6, color: '#dc2626', etiqueta: '6.0 o más' }, { min: 4, color: '#f97316', etiqueta: '4.0 a 5.9' }, { min: 0, color: '#eab308', etiqueta: 'menos de 4.0' }]`
  - `filtrarSismosMexico(coleccion: FeatureCollection) => FeatureCollection` (devuelve una colección nueva sin modificar la original)
  - `expresionColorMagnitud() => Array` (expresión de MapLibre)
  - `etiquetaMagnitud(mag: number | null) => string`
- `sismosEjemplo`: un `FeatureCollection` con `metadata.generated = 1700000000000` y 4 sismos con `id`, `properties.{mag, place, time, url}` y `geometry.coordinates [lon, lat, profundidad]`:
  - `'oax1'`: mag 5.2 en `[-96.7, 16.1, 30]`
  - `'gro1'`: mag 6.3 en `[-99.9, 17.0, 20]`
  - `'jpn1'`: mag 4.8 en `[142.0, 38.0, 10]`
  - `'bc1'`: mag `null` en `[-115.5, 32.0, 5]`

- [ ] **Paso 1: Escribir las pruebas que fallan**

```js
it('conserva solo los sismos dentro de la caja de México', () => {
  const ids = filtrarSismosMexico(sismosEjemplo).features.map((f) => f.id)
  expect(ids).toEqual(['oax1', 'gro1', 'bc1'])
})
it('descarta un sismo con las coordenadas invertidas [lat, lon]', () => {
  const invertido = { type: 'FeatureCollection', features: [{ id: 'x', geometry: { type: 'Point', coordinates: [17.0, -99.9] }, properties: {} }] }
  expect(filtrarSismosMexico(invertido).features).toHaveLength(0)
})
it('no modifica la colección original', () => {
  filtrarSismosMexico(sismosEjemplo)
  expect(sismosEjemplo.features).toHaveLength(4)
})
it('arma la expresión de color por magnitud', () => {
  expect(expresionColorMagnitud()).toEqual(['step', ['coalesce', ['get', 'mag'], 0], '#eab308', 4, '#f97316', 6, '#dc2626'])
})
it('etiqueta la magnitud con un decimal o "M ?"', () => {
  expect(etiquetaMagnitud(5.234)).toBe('M 5.2')
  expect(etiquetaMagnitud(null)).toBe('M ?')
})
```

- [ ] **Paso 2:** `npm test`. Resultado esperado: FALLA porque no existen los módulos.
- [ ] **Paso 3:** Implementa `sismos.js`. Para `expresionColorMagnitud`, recorre `UMBRALES_MAGNITUD` en orden inverso para que los colores no estén escritos en dos lugares.
- [ ] **Paso 4:** `npm test`. Resultado esperado: PASA.
- [ ] **Paso 5: Commit:** `git commit -m "feat: utilidades para filtrar y colorear sismos"`

### Tarea 3: Servicio de USGS

**Archivos:**
- Crear: `src/services/usgs.js`, `src/services/usgs.test.js`

**Interfaces:**
- Consume: `filtrarSismosMexico` (tarea 2).
- Produce: `URL_SISMOS_USGS` y `obtenerSismos({ signal } = {}) => Promise<{ coleccion: FeatureCollection, generadoEn: number }>`. `generadoEn` viene de `metadata.generated`.
- Errores (mensajes exactos): `` `USGS respondió ${status}` `` cuando `!response.ok`, y `'Formato inesperado de USGS'` cuando `features` no es un arreglo.

- [ ] **Paso 1: Escribir las pruebas que fallan** (simula `fetch` con `vi.stubGlobal('fetch', vi.fn())` y restáuralo en `afterEach`)
  - `'devuelve solo sismos de México y la hora de generación'`: con `sismosEjemplo`, espera los ids `['oax1','gro1','bc1']` y `generadoEn === 1700000000000`. También verifica que `fetch` se llamó con `URL_SISMOS_USGS` y `{ signal }`.
  - `'lanza error con el código HTTP'`: con `{ ok: false, status: 503 }`, espera `rejects.toThrow('USGS respondió 503')`.
  - `'lanza error si cambia el formato'`: con un JSON `{}`, espera `rejects.toThrow('Formato inesperado de USGS')`.
- [ ] **Paso 2:** `npm test`. Resultado esperado: FALLA.
- [ ] **Paso 3:** Implementa `obtenerSismos` en `usgs.js`.
- [ ] **Paso 4:** `npm test`. Resultado esperado: PASA.
- [ ] **Paso 5: Commit:** `git commit -m "feat: servicio para descargar sismos de USGS"`

### Tarea 4: Hook `useSismos`

**Archivos:**
- Crear: `src/hooks/useSismos.js`, `src/hooks/useSismos.test.js`

**Interfaces:**
- Consume: `obtenerSismos` (tarea 3).
- Produce: `INTERVALO_ACTUALIZACION_MS = 300000` y `useSismos() => { sismos: FeatureCollection | null, estado: 'cargando' | 'listo' | 'error', error: string | null, actualizadoEn: number | null, sinConexion: boolean, recargar: () => void }`.
- Reglas:
  - Carga al montar y luego cada `INTERVALO_ACTUALIZACION_MS`.
  - Si una carga falla, **conserva** `sismos` y `actualizadoEn` anteriores y pone `estado: 'error'`.
  - `sinConexion` empieza en `!navigator.onLine` y escucha los eventos `online` y `offline`. Al volver `online`, recarga.
  - Usa un `AbortController` por petición y aborta al desmontar. Un `AbortError` no cambia el estado.

- [ ] **Paso 1: Escribir las pruebas que fallan** (`vi.mock('../services/usgs.js')`, `renderHook`, `waitFor` y `vi.useFakeTimers({ shouldAdvanceTime: true })` donde haga falta)
  - `'empieza cargando y luego queda listo con los datos'`
  - `'pasa a error con el mensaje del servicio y sismos null en la primera carga'`
  - `'vuelve a pedir datos cada 5 minutos'`: avanza `300000` ms y espera 2 llamadas a `obtenerSismos`.
  - `'conserva los datos si falla una recarga'`: la primera llamada resuelve y la segunda rechaza. Espera `estado: 'error'` y que `sismos` siga con los ids anteriores.
  - `'marca sinConexion con el evento offline y recarga con online'`
  - `'aborta la petición al desmontar'`: guarda el `signal` recibido y espera `signal.aborted === true` después de `unmount()`.
  - `'recargar vuelve a llamar al servicio'`
- [ ] **Paso 2:** `npm test`. Resultado esperado: FALLA.
- [ ] **Paso 3:** Implementa el hook. Comenta brevemente cada `useEffect`, porque el equipo está aprendiendo React.
- [ ] **Paso 4:** `npm test` y `npm run lint` (sin advertencias de `react-hooks`). Resultado esperado: PASA.
- [ ] **Paso 5: Commit:** `git commit -m "feat: hook useSismos con refresco y estado de conexión"`

### Tarea 5: Componente `MapaBase`

**Archivos:**
- Modificar: `package.json` (`npm install maplibre-gl`)
- Crear: `src/components/MapaBase.jsx`, `src/components/MapaBase.css`, `src/components/MapaBase.test.jsx`

**Interfaces:**
- Produce: `<MapaBase alCargar={(mapa) => void} />`. Llena el contenedor que lo envuelve, crea `new maplibregl.Map({ container, style, center: [-102.5, 23.6], zoom: 4 })`, llama `alCargar(mapa)` en el evento `'load'` y ejecuta `mapa.remove()` al desmontar (importante en `StrictMode`).
- Estilo: `/styles/dark` si `matchMedia('(prefers-color-scheme: dark)').matches`; si no, `/styles/liberty`. Agrega `NavigationControl` y `AttributionControl` (la atribución de OpenFreeMap/OSM es obligatoria).
- Importa `'maplibre-gl/dist/maplibre-gl.css'`.

- [ ] **Paso 1: Escribir las pruebas que fallan** (`vi.mock('maplibre-gl')` con una clase falsa `Map` que guarda sus opciones y tiene `on`, `addControl` y `remove`; también simula `window.matchMedia`)
  - `'crea el mapa centrado en México con [lon, lat]'`: espera `center` igual a `[-102.5, 23.6]`.
  - `'usa el estilo oscuro cuando el sistema está en modo oscuro'`
  - `'llama alCargar con el mapa al dispararse load'`
  - `'elimina el mapa al desmontar'`
- [ ] **Paso 2:** `npm test`. Resultado esperado: FALLA.
- [ ] **Paso 3:** Implementa `MapaBase` con `useRef` para el contenedor y para el mapa. Guarda `alCargar` en una ref para que el mapa no se vuelva a crear si cambia la función.
- [ ] **Paso 4:** `npm test`. Resultado esperado: PASA.
- [ ] **Paso 5: Commit:** `git commit -m "feat: componente MapaBase con MapLibre"`

### Tarea 6: Componente `CapaSismos`

**Archivos:**
- Crear: `src/components/CapaSismos.jsx`, `src/components/CapaSismos.test.jsx`

**Interfaces:**
- Consume: `expresionColorMagnitud`, `etiquetaMagnitud` (tarea 2); `formatearFechaHora` (tarea 1); el `mapa` de `MapaBase` (tarea 5).
- Produce: `<CapaSismos mapa={Map | null} sismos={FeatureCollection | null} />`. No dibuja nada en React (devuelve `null`).
  - Fuente `'sismos'` (geojson). Si ya existe, usa `getSource('sismos').setData(sismos)`.
  - Capa `'sismos-circulos'` de tipo `circle`: `circle-color` igual a `expresionColorMagnitud()`; `circle-radius` con `['interpolate', ['linear'], ['coalesce', ['get','mag'], 0], 2.5, 4, 7, 18]`; borde blanco de 1 px.
  - Al hacer clic en la capa abre `maplibregl.Popup` con `setLngLat([coords[0], coords[1]])` y `setDOMContent(...)`. El contenido es: etiqueta de magnitud, `place`, fecha formateada, `Profundidad: N km` y el enlace "Ver en USGS" (`target="_blank" rel="noopener noreferrer"`). El texto se arma **solo** con `textContent`.
  - Al desmontar o cambiar de mapa, quita el listener, la capa y la fuente.

- [ ] **Paso 1: Escribir las pruebas que fallan** (usa un mapa falso con `vi.fn()` para `getSource`, `addSource`, `addLayer`, `on`, `off`, `getLayer`, `removeLayer` y `removeSource`; simula `maplibre-gl` para capturar el `Popup`)
  - `'no hace nada si mapa es null'`
  - `'agrega la fuente y la capa con el color por magnitud'`
  - `'actualiza con setData cuando la fuente ya existe'`
  - `'abre el popup en [lon, lat] del sismo'`: con un clic en `gro1`, espera `setLngLat([-99.9, 17.0])`.
  - `'muestra el texto de place sin interpretarlo como HTML'`: con `place: '<img src=x onerror=alert(1)>'`, espera que el contenido no tenga `img` y que su `textContent` incluya el texto literal.
  - `'muestra "M ?" cuando mag es null'`
  - `'limpia capa, fuente y listener al desmontar'`
- [ ] **Paso 2:** `npm test`. Resultado esperado: FALLA.
- [ ] **Paso 3:** Implementa `CapaSismos`.
- [ ] **Paso 4:** `npm test`. Resultado esperado: PASA.
- [ ] **Paso 5: Commit:** `git commit -m "feat: capa de sismos con popup de detalle"`

### Tarea 7: Página `Mapa`, leyenda y estilos

**Archivos:**
- Crear: `src/pages/Mapa.jsx`, `src/pages/Mapa.css`, `src/pages/Mapa.test.jsx`
- Crear: `src/components/LeyendaMagnitud.jsx` (lista generada desde `UMBRALES_MAGNITUD`)
- Modificar: `src/App.jsx` (renderiza `<Mapa />`)
- Modificar: `src/index.css` (pantalla completa, variables de color en `:root`, modo oscuro con `prefers-color-scheme`). Quita los estilos de la tarjeta centrada de `main`.

**Interfaces:**
- Consume: `useSismos` (tarea 4), `MapaBase` (tarea 5), `CapaSismos` (tarea 6), `formatearFechaHora` (tarea 1).
- Textos exactos:
  - Título: `Sismos recientes`
  - Cargando (sin datos todavía): `Cargando sismos…`
  - Error sin datos: `` `No se pudieron cargar los sismos: ${error}` `` y el botón `Reintentar` (llama `recargar`)
  - Error con datos: `` `No se pudo actualizar. Mostrando datos de las ${hora}.` `` y el botón `Reintentar`
  - Sin conexión: `` `Sin conexión. Mostrando datos de las ${hora}.` `` (si no hay datos: `Sin conexión. No hay datos guardados.`)
  - Vacío: `No hay sismos de magnitud 2.5 o más en México y alrededores en los últimos 7 días.`
  - Conteo: `` `${n} sismos en los últimos 7 días` `` (`1 sismo` en singular)
  - Pie: `` `Fuente: USGS · Actualizado: ${hora}` `` y el aviso de las restricciones globales (siempre visible)
- Diseño: barra superior con título, conteo y mensaje de estado; mapa que llena el resto (`100dvh`); leyenda y aviso abajo; botón `Reintentar` de al menos 48 px.

- [ ] **Paso 1: Escribir las pruebas que fallan** (`vi.mock('../hooks/useSismos.js')`; simula `MapaBase` con un `<div data-testid="mapa" />` y `CapaSismos` con `null`)
  - `'muestra el aviso informativo en todos los estados'`
  - `'muestra Cargando sismos… al inicio'`
  - `'muestra el error real y Reintentar llama recargar'`
  - `'con error y datos previos mantiene el mapa y avisa'`
  - `'sin conexión muestra la hora de los últimos datos'`
  - `'muestra el mensaje de semana sin sismos'`
  - `'muestra el conteo en singular y plural'`
  - `'muestra Fuente: USGS y la hora de actualización'`
- [ ] **Paso 2:** `npm test`. Resultado esperado: FALLA.
- [ ] **Paso 3:** Implementa `Mapa.jsx`, `LeyendaMagnitud.jsx`, los estilos y el cambio en `App.jsx`.
- [ ] **Paso 4:** `npm test`, `npm run lint` y `npm run build`. Resultado esperado: todo PASA.
- [ ] **Paso 5: Verificación manual:** `npm run dev`. Abre la app con el ancho de un celular en las herramientas del navegador y confirma:
  - aparecen círculos en México;
  - el clic en un círculo abre el popup;
  - al activar "Offline" en DevTools aparece el aviso de sin conexión;
  - el modo oscuro del sistema cambia el mapa y los colores.
  
  Si el feed de USGS no responde, **avisa** en lugar de usar datos de ejemplo.
- [ ] **Paso 6: Commit:** `git commit -m "feat: pantalla de mapa con sismos de USGS"`
