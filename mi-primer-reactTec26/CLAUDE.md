# CLAUDE.md

Instrucciones para Claude Code en este repositorio. Responde y escribe comentarios en **español**.

## Qué es este proyecto

Plataforma web y app móvil para la **gestión de recursos y evacuación durante y después de desastres naturales** (sismos, huracanes, inundaciones) en México.

Funciones principales:

1. **Mapa en vivo** con sismos, huracanes, zonas de peligro y capa de satélite.
2. **Rutas seguras de evacuación** hacia el refugio más cercano *por tiempo de llegada*, evitando calles bloqueadas y zonas de peligro.
3. **Ruta combinada**: si un vehículo no puede llegar al destino, calcular el punto más cercano y rápido al que sí llega, y desde ahí la ruta a pie.
4. **Reporte de bloqueos** por brigadistas y ciudadanos (calles cerradas, inundaciones, derrumbes).
5. **Asignación de brigadas y vehículos** a incidentes según prioridad, evitando duplicidades.
6. **Alertas** a usuarios dentro de una zona de peligro.
7. Funcionar **sin conexión** con mapas, refugios y rutas guardados.

## Stack

- **React 19 + Vite 8**, JavaScript con JSX (no TypeScript). Módulos ES (`"type": "module"`).
- **CSS sin frameworks** (`index.css`, `App.css` y CSS por componente).
- **ESLint 10** con reglas de hooks de React.
- **MapLibre GL** para mapas.
- **Turf.js** para cálculos geográficos en el navegador.
- **React Router** para las páginas.
- **Supabase** como backend: PostgreSQL + PostGIS, autenticación, tiempo real y Edge Functions.
- **vite-plugin-pwa** para modo offline e instalación.
- Fase posterior: **Capacitor** (Android/iOS) y **Firebase Cloud Messaging** (push).

No agregues librerías nuevas sin explicar por qué hacen falta. Prefiere las que ya están en el stack.

## Comandos

```bash
npm install        # instalar dependencias
npm run dev        # servidor de desarrollo
npm run build      # compilar para producción
npm run lint       # revisar el código con ESLint
npm run preview    # probar la versión compilada
```

Ejecuta `npm run lint` y `npm run build` antes de dar una tarea por terminada.

## Estructura de carpetas

```
src/
  pages/         Pantallas: Mapa, Refugios, ReportarBloqueo, PanelBrigadas
  components/    Componentes reutilizables: MapaBase, CapaSismos, CapaHuracanes, RutaCombinada
  services/      Llamadas a APIs y a Supabase (usgs.js, gdacs.js, rutas.js, supabase.js)
  utils/         Funciones puras (geo.js con Turf, formatos de fecha, etc.)
  hooks/         Hooks propios (useSismos, useUbicacion, useBloqueos)
supabase/
  migrations/    SQL de tablas, índices espaciales y políticas RLS
  functions/     Edge Functions (rutas, huracanes, alertas)
```

Reglas:
- Los componentes **no** hacen `fetch` directo: usan funciones de `src/services/` o hooks de `src/hooks/`.
- Un componente por archivo, nombre en PascalCase (`CapaSismos.jsx`).
- Funciones y variables en camelCase, en español cuando describen el dominio (`calcularRutaCombinada`, `refugiosDisponibles`).

## Fuentes de datos

| Fuente | Datos | Llave | Dónde se consume |
|---|---|---|---|
| USGS (`earthquake.usgs.gov/earthquakes/feed/v1.0/`) | Sismos en GeoJSON | No | Frontend |
| GDACS (`gdacs.org/gdacsapi`, `geteventlist`) | Huracanes (nivel de alerta), inundaciones, alertas globales | No | Frontend (tiene CORS) |
| NOAA mapservices `NHC_tropical_weather_summary` (ArcGIS, GeoJSON, CORS) | Huracanes del NHC: cono, trayectoria, puntos de pronóstico, avisos en costa | No | Frontend |
| SMN – Conagua (feed CAP) | Avisos oficiales de ciclones en México | No | Edge Function |
| Open-Meteo (Marine y Forecast API) | Clima, oleaje, corrientes | No | Frontend |
| NASA GIBS (WMTS) | Teselas de satélite `GOES-East_ABI_GeoColor`; la hora se obtiene con `HEAD` + cabecera `Layer-Time-Actual` | No | Frontend (capa del mapa) |
| NASA FIRMS | Incendios | Sí | Edge Function |
| OpenRouteService | Rutas en carro y a pie, `avoid_polygons`, matrices, isócronas | Sí | **Edge Function** |

Notas sobre ciclones (decisión del 2026-10-16):
- `nhc.noaa.gov/CurrentStorms.json` **no tiene CORS**, por eso no se usa. Los mismos datos del NHC se leen desde el servicio de NOAA en `mapservices.weather.noaa.gov`, capas 5 a 8 del servicio de resumen.
- Una tormenta puede aparecer solo en NHC o solo en GDACS; `utils/ciclones.js` las combina sin duplicar.
- Nunca mostrar "Sin ciclones activos" si alguna de las dos fuentes falló o sigue cargando.

Toda geometría se maneja en **GeoJSON con coordenadas `[longitud, latitud]`** (EPSG:4326). Cuidado con no invertir el orden.

## Seguridad y llaves

- **Nunca** pongas llaves privadas (OpenRouteService, FIRMS, Secret key `sb_secret_…` de Supabase, antes "service role") en el código del frontend ni en variables `VITE_*`. Solo van en las Edge Functions como secretos.
- En el frontend solo se permiten `VITE_SUPABASE_URL` (URL base, sin `/rest/v1`) y `VITE_SUPABASE_PUBLISHABLE_KEY` (la Publishable key `sb_publishable_…`, que reemplaza a la anon key).
- Las llaves van en `.env.local`, que **no** se sube al repo. Mantén actualizado `.env.example` sin valores reales.
- Toda tabla de Supabase debe tener **RLS activado** con políticas por rol: `ciudadano`, `brigadista`, `coordinador`.

## Modelo de datos (Supabase / PostGIS)

- **perfiles**: `id` (= `auth.users.id`), `nombre`, `rol` (`ciudadano` | `brigadista` | `coordinador`), `creado_en`. Solo para cuentas con correo; los anónimos no tienen perfil y cuentan como ciudadano (`rol_actual()`).
- **refugios**: `id`, `clave_oficial`, `nombre`, `direccion`, `municipio`, `entidad`, `ubicacion geography(Point)` (puede ser nula hasta que el coordinador lo ubique), `capacidad`, `ocupacion`, `estado` (`abierto` | `lleno` | `cerrado`), `fuente`, `actualizado_en`.
- **bloqueos**: `id`, `geometria geography(Point)`, `tipo` (`solo_vehiculos` | `total`), `descripcion` (máx. 280), `reportado_por`, `es_anonimo`, `confirmado`, `expira_en`, `renovado_en`, `creado_en`.
- **incidentes**: `id`, `ubicacion geography(Point)`, `tipo`, `prioridad` (1–5), `estado`, `creado_en`.
- **brigadas**: `id`, `nombre`, `vehiculo`, `ubicacion_actual geography(Point)`, `incidente_id`, `estado`.
- **zonas_peligro**: `id`, `geometria geography(Polygon)`, `origen` (`nhc` | `gdacs` | `sismo` | `inundacion` | `manual`), `severidad`, `expira_en`.

Crea **índices GIST** en todas las columnas geográficas. Los cambios de esquema van como migraciones en `supabase/migrations/` (se aplican pegándolas en el SQL Editor, en orden). Después de cambiar políticas, corre `supabase/pruebas/verificar_rls.sql`.

La app lee de las vistas `refugios_vista` y `bloqueos_vista` (traen `longitud` y `latitud`) y escribe con RPC: `reportar_bloqueo`, `renovar_bloqueo`, `eliminar_bloqueo` y `actualizar_refugio`. Los errores de esas funciones son códigos (`LIMITE_REPORTES`, `FUERA_DE_MEXICO`, `SIN_PERMISO`, `NO_EXISTE`, `SIN_SESION`) que `src/services/erroresSupabase.js` traduce.

Decisiones de la etapa 3 (2026-10-16):
- **Cualquiera puede reportar**, con o sin cuenta. Sin cuenta se usa la sesión **anónima** de Supabase, que se crea solo al enviar el primer reporte. Límite: 5 reportes por hora por sesión.
- Un bloqueo es **un punto**: `solo_vehiculos` = **parcial** (se puede pasar a pie) o `total`.
- Un bloqueo **dura 24 h**. Lo pueden **renovar** (24 h más desde ese momento) o **eliminar** quien lo reportó, los brigadistas y los coordinadores. El servidor fija el vencimiento; la app no puede mandarlo.
- Los refugios vienen de la **lista oficial** (CSV, ver `supabase/plantillas/`) y el **coordinador los ubica** en el mapa. Nunca se inventan coordenadas.
- Los roles se asignan desde el SQL Editor (ver `supabase/pruebas/LEEME.md`).

## Lógica de rutas (importante)

- **Bloqueo `total`**: ni vehículos ni peatones pasan.
- **Bloqueo `solo_vehiculos`**: se evita en la ruta en carro, pero se permite a pie.
- Los bloqueos con `expira_en` vencido o sin confirmar por un coordinador se tratan con menos peso o se ignoran según la configuración.
- **Refugio más cercano**: se elige por **tiempo de llegada** (matriz de ORS), no por distancia en línea recta. Se descartan los refugios `lleno`, `cerrado` o dentro de una zona de peligro.
- **Ruta combinada** (carro + a pie):
  1. Obtener puntos candidatos de transbordo alcanzables en carro cerca del destino (por ejemplo, la isócrona a pie del destino intersectada con la red vehicular).
  2. Calcular `tiempo_carro(origen → candidato) + tiempo_descenso + tiempo_a_pie(candidato → destino)`.
  3. Elegir el candidato con el **menor tiempo total**, no el más cercano.
  4. Mostrar el tramo en carro y el tramo a pie con colores distintos y con instrucciones claras.
- Si no existe ninguna ruta posible, decirlo explícitamente en la interfaz. Nunca mostrar una ruta que cruce un bloqueo `total`.

## Interfaz

- Diseño **móvil primero**: la mayoría de los usuarios estarán en el celular, con prisa y posiblemente con poca batería y señal.
- Botones grandes, alto contraste, texto claro y en español. Funcionar también en modo oscuro.
- Mostrar siempre la **fuente y la hora de actualización** de cada dato.
- Incluir el aviso de que la plataforma es **informativa** y que las indicaciones oficiales (Protección Civil, SMN, SSN) tienen prioridad.
- Manejar los estados de **cargando**, **error** y **sin conexión** en cada pantalla que use datos externos.

## Roadmap

1. Mapa con sismos de USGS. ✅
2. Capa de huracanes (GDACS + NHC) y capa de satélite (NASA GIBS). ✅
3. Supabase: tablas de refugios y bloqueos, y pantalla para reportar bloqueos tocando el mapa. ✅ ← siguiente: 4
4. Ruta al refugio más cercano con OpenRouteService evitando bloqueos y zonas de peligro.
5. Ruta combinada carro + a pie.
6. Panel de brigadas: asignación de equipos a incidentes por prioridad.
7. PWA offline, notificaciones push y app con Capacitor.
8. Detección automática de zonas inundadas (Copernicus Global Flood Monitoring) y reconocimiento con drones.

## Cómo trabajar en este repo

- Antes de cambios grandes, explica brevemente el plan y qué archivos vas a tocar.
- Haz cambios pequeños y que funcionen; no reescribas archivos completos si basta con editar una parte.
- Si una API externa no responde o cambió su formato, avísame en lugar de inventar datos.
- No uses datos falsos en producción. Para pruebas, pon los datos de ejemplo en `src/mocks/` y márcalos claramente.
- Explica el código nuevo de forma sencilla: el equipo está aprendiendo React.