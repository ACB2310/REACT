# Etapa 6: panel de brigadas – Plan de implementación

> **Para agentes:** SUB-SKILL REQUERIDA: usa superpowers:subagent-driven-development (recomendado) o superpowers:executing-plans para implementar este plan tarea por tarea. Los pasos usan casillas (`- [ ]`) para seguimiento.

**Objetivo:**
- Que el **coordinador** registre **incidentes** y **brigadas**, y asigne brigadas a incidentes **por prioridad**, sin duplicidades.
- Que cada **brigadista** vea la asignación de su brigada y avise su avance.

**Decisiones del usuario (2026-10-17):**
1. **Solo el coordinador crea incidentes**: tocando el mapa o convirtiendo un bloqueo reportado.
2. **Asignación sugerida y confirmada**: la app propone la brigada disponible más cercana a cada incidente, empezando por la prioridad más alta, y el coordinador acepta o cambia la propuesta con un toque.
3. **Base fija**: el coordinador marca la base de cada brigada. **No se rastrea a nadie por GPS.**
4. **Los brigadistas tienen su pantalla**: cada cuenta de brigadista pertenece a una brigada, ve su incidente asignado y cambia el estado (en camino, en el lugar, terminado).

**Decisiones de diseño (se pueden cambiar en la revisión del plan):**
- **Prioridad**: `1` es la más urgente y `5` la menos urgente, igual que en el triaje. Las etiquetas son 1 Crítica, 2 Alta, 3 Media, 4 Baja y 5 Mínima.
- **"Sin duplicidades"** cubre tres casos:
  - **una brigada no puede tener dos incidentes** a la vez;
  - **un incidente no recibe dos brigadas** (en esta etapa una brigada por incidente; los refuerzos quedan para después);
  - al crear un incidente, la app **avisa si ya hay uno abierto del mismo tipo a ≤ 150 m**.
  
  Los dos primeros casos los garantiza la base de datos (índice único y bloqueo de renglón), aunque dos coordinadores asignen al mismo tiempo.
- **Brigada más cercana = distancia en línea recta** desde su base, con Turf. Cuando exista la etapa 4 (OpenRouteService) se cambia por **tiempo de llegada**, que es lo que pide `CLAUDE.md`. La función queda separada para poder cambiarla.
- **Los ciudadanos no ven incidentes ni brigadas**: pueden traer datos sensibles, como "persona atrapada en…". Solo los ven brigadistas y coordinadores.
- **Historial**: cada asignación queda en la tabla `asignaciones` (quién asignó, cuándo y cómo terminó).

**Arquitectura:** el mismo patrón de la etapa 3:
- las escrituras pasan por RPC que validan rol y estado;
- las lecturas, por vistas con `longitud` y `latitud`;
- el tiempo real usa un **canal privado** que solo escuchan brigadistas y coordinadores, con avisos de "cambió", igual que en la migración 4;
- la lógica de sugerencia es una **función pura** en `src/utils/asignacion.js`.

**Stack:** lo actual. **Sin librerías nuevas**: `@turf/distance` ya está instalado.

## Pendiente del usuario

- [ ] Aplicar `supabase/migrations/20261017000005_brigadas.sql` en el SQL Editor (tarea 1).
- [ ] Correr `supabase/pruebas/verificar_brigadas.sql` (tarea 2) y mandar el resultado.
- [ ] Tener al menos una cuenta de coordinador y una de brigadista para la prueba final.

## Restricciones globales

- Todo en **español**: interfaz, comentarios y commits. Los commits terminan con `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- GeoJSON en **`[longitud, latitud]`**. En SQL: `st_makepoint(longitud, latitud)`.
- Los componentes no llaman a Supabase directamente: todo pasa por `services/` o `hooks/`.
- RLS activado en cada tabla nueva desde su migración. Las funciones `security definer` llevan `set search_path = ''` y nombres completos.
- Las migraciones 1 a 4 **no se modifican**; la 5 solo agrega.
- Al terminar cada tarea: `npm test`, `npm run lint` y `npm run build`.
- Rama: `etapa6`, que sale de `main`.
- Los datos de ejemplo solo van en `src/mocks/`, marcados `// DATOS DE EJEMPLO SOLO PARA PRUEBAS`.

## Modelo de datos (migración 5)

- **brigadas**:
  - `id`, `nombre` (único), `vehiculo` (texto libre, por ejemplo "Pickup 4x4")
  - `base geography(Point)`
  - `estado` (`disponible` | `asignada` | `en_camino` | `en_sitio` | `fuera_de_servicio`)
  - `incidente_id` (único cuando no es nulo)
  - `actualizado_en`
- **incidentes**:
  - `id`, `ubicacion geography(Point)`
  - `tipo` (`rescate` | `atencion_medica` | `incendio` | `derrumbe` | `inundacion` | `bloqueo` | `otro`)
  - `prioridad` (1–5), `descripcion` (≤ 500)
  - `estado` (`pendiente` | `asignado` | `en_atencion` | `atendido` | `cancelado`)
  - `bloqueo_id` (opcional, `on delete set null`)
  - `creado_por`, `creado_en`, `actualizado_en`
- **asignaciones** (historial): `id`, `incidente_id`, `brigada_id`, `asignado_por`, `asignado_en`, `terminado_en`, `resultado` (`atendido` | `liberada` | `cancelado`).
- **perfiles**: nueva columna `brigada_id` (opcional), que dice a qué brigada pertenece un brigadista.

### Transiciones (solo por RPC)

| RPC | Quién | Qué hace |
|---|---|---|
| `crear_incidente(lng, lat, tipo, prioridad, descripcion, bloqueo_id)` | coordinador | Crea en `pendiente`. Valida `dentro_de_mexico`. Devuelve el `id`. |
| `actualizar_incidente(id, prioridad, descripcion)` | coordinador | Solo si está abierto (`pendiente`, `asignado` o `en_atencion`). |
| `cancelar_incidente(id)` | coordinador | Pasa a `cancelado`. Si tenía brigada, la libera (`disponible`) y cierra la asignación con `cancelado`. |
| `asignar_brigada(incidente_id, brigada_id)` | coordinador | Bloquea los dos renglones (`for update`). La brigada debe estar `disponible` y el incidente `pendiente`; si no, lanza `BRIGADA_OCUPADA` o `INCIDENTE_ASIGNADO`. Brigada → `asignada`, incidente → `asignado`, y escribe en el historial. |
| `liberar_brigada(brigada_id)` | coordinador | Quita la asignación. Incidente → `pendiente`, brigada → `disponible` y el historial queda con `liberada`. |
| `avanzar_asignacion(estado)` | brigadista de esa brigada | `en_camino` → brigada `en_camino`. `en_sitio` → brigada `en_sitio` e incidente `en_atencion`. `terminado` → incidente `atendido`, brigada `disponible` y el historial con `atendido`. Solo en orden hacia adelante; si no, `TRANSICION_INVALIDA`. |
| `guardar_brigada(id, nombre, vehiculo, lng, lat)` | coordinador | Crea o edita (con `id` nulo, crea). |
| `cambiar_servicio_brigada(id, en_servicio)` | coordinador | `disponible` ↔ `fuera_de_servicio`. Solo si no tiene incidente; si no, `BRIGADA_OCUPADA`. |
| `asignar_miembro(usuario_id, brigada_id)` | coordinador | Solo a perfiles con rol `brigadista`; `brigada_id` nulo lo saca de la brigada. |
| `brigadistas()` | coordinador | Devuelve `id`, `correo`, `nombre` y `brigada_id` de los perfiles brigadistas. Lee `auth.users`, por eso es `security definer`. |

### Lectura y RLS

- `incidentes`, `brigadas` y `asignaciones`: `select` **solo** para brigadista o coordinador (`rol_actual()`). No hay políticas de insert, update ni delete: todo se hace por RPC.
- Vistas `incidentes_vista` y `brigadas_vista` (`security_invoker`):
  - traen `longitud` y `latitud`;
  - `brigadas_vista` agrega `miembros` (cuántos) y `es_mia` (`perfiles.brigada_id` del usuario).
- `mi_asignacion()`: para el brigadista, devuelve su brigada y su incidente activo, o nada.
- **Tiempo real**: el tema privado `brigadas-cambios`. Se escucha solo si `rol_actual()` es brigadista o coordinador (política en `realtime.messages`). Hay disparadores en `incidentes` y `brigadas` que hacen `realtime.send(..., 'cambio', 'brigadas-cambios', true)`.

### Errores nuevos para `erroresSupabase.js`

| Código | Mensaje |
|---|---|
| `BRIGADA_OCUPADA` | La brigada ya tiene un incidente o no está disponible. |
| `INCIDENTE_ASIGNADO` | Ese incidente ya tiene una brigada asignada. |
| `INCIDENTE_CERRADO` | El incidente ya no existe o ya está atendido o cancelado. |
| `TRANSICION_INVALIDA` | Ese cambio de estado no es posible ahora. |
| `SIN_BRIGADA` | Tu cuenta no pertenece a ninguna brigada. Pide al coordinador que te agregue. |
| `NOMBRE_REPETIDO` | Ya existe una brigada con ese nombre. |
| `BRIGADA_NO_EXISTE` | La brigada ya no existe. |
| `NO_ES_BRIGADISTA` | Esa cuenta no tiene rol de brigadista. |

## Puntos de revisión

1. **Dos coordinadores asignan al mismo tiempo**: solo una asignación gana y la otra recibe un mensaje claro. Se verifica en SQL (tarea 2) y en la interfaz (tarea 9).
2. **Un ciudadano o un anónimo** no puede leer incidentes ni brigadas, ni escuchar su canal. Verificación en la tarea 2.
3. **Un brigadista no puede avanzar la asignación de otra brigada** ni saltarse pasos. Verificación en la tarea 2.
4. **La sugerencia nunca propone** una brigada ocupada o fuera de servicio, ni la misma brigada para dos incidentes. Pruebas en la tarea 4.
5. **Las coordenadas no se invierten** en las vistas, las RPC ni la sugerencia. Pruebas en las tareas 3 y 4.
6. **Sin conexión**: los botones de asignar o avanzar dicen que no hay conexión y no fingen el cambio.

---

### Tarea 0: Plan y rama
- [ ] Crear la rama `etapa6` desde `main` y hacer commit de este plan: `docs: plan de la etapa 6 (panel de brigadas)`

### Tarea 1: Migración 5 (`supabase/migrations/20261017000005_brigadas.sql`)
- [ ] Tablas, índices (GIST en `base` y `ubicacion`; único parcial `brigadas(incidente_id) where incidente_id is not null`; `incidentes(estado, prioridad)`), RLS, vistas, RPC, `mi_asignacion()`, `brigadistas()`, la política de tiempo real y los disparadores, todo como dice "Modelo de datos".
- [ ] Commit: `feat: tablas de brigadas, incidentes y asignaciones con RLS y RPC`

### Tarea 2: Verificación SQL (`supabase/pruebas/verificar_brigadas.sql`)
Usa el mismo formato que `verificar_rls.sql`: `begin`, usuarios de prueba, `pg_temp.como(...)`, `debe_fallar(...)` y un error final con el resumen.
- [ ] El coordinador crea un incidente, una brigada y la asigna. El historial tiene 1 renglón.
- [ ] Segunda asignación de la misma brigada a otro incidente: `BRIGADA_OCUPADA`.
- [ ] Otra brigada al mismo incidente: `INCIDENTE_ASIGNADO`.
- [ ] Insertar directo `incidente_id` repetido en `brigadas` (como `postgres`) choca con el índice único.
- [ ] Un brigadista de la brigada avanza `en_camino` → `en_sitio` → `terminado`. El incidente queda `atendido`, la brigada `disponible` y el historial cerrado.
- [ ] Un brigadista de **otra** brigada intenta avanzar: `SIN_BRIGADA` o `SIN_PERMISO`. Saltar de `asignada` a `terminado`: `TRANSICION_INVALIDA`.
- [ ] Un ciudadano o un anónimo: 0 renglones en `incidentes_vista` y `brigadas_vista`. `crear_incidente` da `SIN_PERMISO`.
- [ ] Un brigadista no puede crear incidentes ni brigadas, ni cambiarse de brigada.
- [ ] `cancelar_incidente` con brigada: la libera y cierra el historial con `cancelado`.
- [ ] Un incidente en Madrid da `FUERA_DE_MEXICO`.
- [ ] Commit: `test: verificación de permisos y duplicidades de brigadas en SQL`

### Tarea 3: Servicios
**Archivos:** `src/services/incidentes.js`, `src/services/brigadas.js` y sus pruebas, más códigos nuevos en `erroresSupabase.js`. Mocks en `src/mocks/brigadasEjemplo.js`.
- [ ] `obtenerIncidentes({ signal })` devuelve un FeatureCollection (solo los abiertos, ordenados por prioridad y fecha) y `actualizadoEn`.
- [ ] `obtenerBrigadas({ signal })` devuelve un FeatureCollection de las bases, con `estado`, `incidenteId`, `miembros` y `esMia`.
- [ ] `obtenerMiAsignacion()`.
- [ ] `obtenerBrigadistas()`.
- [ ] Una función por RPC: `crearIncidente`, `actualizarIncidente`, `cancelarIncidente`, `asignarBrigada`, `liberarBrigada`, `avanzarAsignacion`, `guardarBrigada`, `cambiarServicioBrigada` y `asignarMiembro`. Todas reciben `posicion` como `[longitud, latitud]`.
- [ ] `suscribirseABrigadas(alCambiar)`: canal privado `brigadas-cambios`, evento `cambio`.
- [ ] Pruebas:
  - el orden `[lng, lat]` en cada RPC;
  - las traducciones de los errores nuevos;
  - el canal privado.
- [ ] Commit: `feat: servicios de incidentes y brigadas`

### Tarea 4: Sugerencia de asignaciones (`src/utils/asignacion.js`)
- [ ] `sugerirAsignaciones(incidentes, brigadas) => [{ incidenteId, brigadaId | null, distanciaKm }]`:
  - toma solo incidentes `pendiente` y brigadas `disponible`;
  - recorre los incidentes por prioridad (1 primero) y luego por antigüedad;
  - a cada uno le da la brigada **libre** más cercana a su base, con `@turf/distance`;
  - una brigada ya sugerida **no se repite**;
  - si no quedan brigadas, devuelve `brigadaId: null`.
- [ ] `incidentesCercanos(posicion, tipo, incidentes, metros = 150)` sirve para el aviso de posible duplicado.
- [ ] Etiquetas y colores en `src/utils/incidentes.js`: `PRIORIDADES`, `TIPOS_INCIDENTE`, `ESTADOS_INCIDENTE` y `ESTADOS_BRIGADA`.
- [ ] Pruebas:
  - un incidente de prioridad 1 recibe la brigada más cercana aunque otro de prioridad 3 esté más cerca de ella;
  - nunca se sugiere la misma brigada dos veces;
  - se ignoran las brigadas fuera de servicio u ocupadas;
  - con más incidentes que brigadas, los de menor prioridad quedan con `null`;
  - las coordenadas invertidas dan otra distancia (sirve para detectar si alguien las voltea);
  - empates por antigüedad;
  - listas vacías.
- [ ] Commit: `feat: sugerencia de brigada más cercana por prioridad`

### Tarea 5: Hooks
- [ ] `useIncidentes()` y `useBrigadas()`:
  - usan `useDatosPeriodicos` (respaldo cada 2 min);
  - tiempo real con recarga silenciosa, a lo más una vez cada 5 s (igual que `useBloqueos`);
  - solo se activan si `rol` es brigadista o coordinador.
- [ ] `useMiAsignacion()` para el brigadista: se recarga con el mismo canal.
- [ ] Pruebas: no piden nada para ciudadanos, el tiempo real recarga y se cancela la suscripción al desmontar.
- [ ] Commit: `feat: hooks de incidentes, brigadas y mi asignación`

### Tarea 6: Capas del mapa
- [ ] `CapaIncidentes`: círculos con un color por prioridad y un número (`symbol` con `text-field` = prioridad). El popup muestra tipo, prioridad, estado, descripción (`textContent`), antigüedad y la brigada asignada.
- [ ] `CapaBasesBrigadas`: cuadrados o íconos por estado de brigada, con un popup de nombre, vehículo, estado y miembros.
- [ ] Leyenda.
- [ ] Pruebas con `mapaFalso`, incluida la descripción sin HTML.
- [ ] Commit: `feat: capas de incidentes y bases de brigadas`

### Tarea 7: Pantalla Panel de brigadas (`/brigadas`, solo coordinador)
- [ ] **Mapa** con incidentes y bases. **Nuevo incidente**: tocar el mapa, elegir tipo, prioridad y descripción, y guardar. Si `incidentesCercanos` encuentra uno del mismo tipo, avisa `Ya hay un incidente de <tipo> abierto a <n> m. ¿Crear otro de todos modos?`.
- [ ] **Lista "Por atender"** ordenada por prioridad. Cada renglón muestra la brigada sugerida y su distancia, con dos botones:
  - **Asignar <brigada>** (un toque);
  - **Cambiar**, que abre una lista de brigadas disponibles ordenadas por distancia.
  
  Si no hay brigada libre: `Sin brigadas disponibles`.
- [ ] **Lista "En curso"**: incidente, brigada y estado, con **Liberar brigada** y **Cancelar incidente** (los dos piden confirmación).
- [ ] Editar la prioridad y la descripción de un incidente abierto.
- [ ] Estados cargando, error y sin conexión. Fuente y hora de actualización.
- [ ] Pruebas:
  - asignar la sugerida llama `asignarBrigada(incidente, brigada)`;
  - `BRIGADA_OCUPADA` muestra el mensaje y recarga;
  - el aviso de duplicado;
  - sin conexión no asigna.
- [ ] Commit: `feat: panel del coordinador para asignar brigadas por prioridad`

### Tarea 8: Pantalla Brigadas y miembros (`/brigadas/equipos`, solo coordinador)
- [ ] Lista de brigadas con su estado y el botón **En servicio / Fuera de servicio**.
- [ ] Crear o editar una brigada: nombre, vehículo y **base tocando el mapa** (usa `SelectorPunto`).
- [ ] Miembros: una lista de cuentas brigadistas (`obtenerBrigadistas`) con un selector de brigada. Si no hay brigadistas, explicar cómo asignar el rol (`supabase/pruebas/LEEME.md`).
- [ ] Pruebas: crear una brigada manda `[lng, lat]`, `NOMBRE_REPETIDO` y que no se puede poner fuera de servicio una brigada ocupada.
- [ ] Commit: `feat: pantalla para registrar brigadas, bases y miembros`

### Tarea 9: Pantalla Mi brigada (`/mi-brigada`, brigadista)
- [ ] Sin brigada: `Tu cuenta no pertenece a ninguna brigada. Pide al coordinador que te agregue.`
- [ ] Sin asignación: `Sin incidente asignado. Mantente disponible en la base.`, más la base en el mapa.
- [ ] Con asignación:
  - tipo, prioridad, descripción y hora;
  - mapa con el incidente y la base;
  - enlace **Abrir en mapas** (`https://www.google.com/maps/dir/?api=1&destination=<lat>,<lng>`; aquí el orden es lat,lng y se prueba);
  - un solo botón grande con el siguiente paso: **Voy en camino** → **Llegué al lugar** → **Terminé**. "Terminé" pide confirmación.
- [ ] Pruebas:
  - el botón muestra el siguiente paso según el estado;
  - `TRANSICION_INVALIDA` muestra el mensaje y recarga;
  - el enlace de mapas con lat,lng;
  - sin conexión no avanza.
- [ ] Commit: `feat: pantalla para que el brigadista vea y avance su asignación`

### Tarea 10: Integración, navegación y documentación
- [ ] Rutas en `App.jsx`:
  - `/brigadas` y `/brigadas/equipos` con `SoloCoordinador`;
  - `/mi-brigada` con un nuevo `SoloRol({ roles: ['brigadista'] })`.
- [ ] `BarraNavegacion`:
  - coordinador: Mapa · Reportar · **Brigadas** · Refugios · Mi cuenta;
  - brigadista: Mapa · Reportar · **Mi brigada** · Mi cuenta.
- [ ] En el popup de un bloqueo, el coordinador ve **Crear incidente**, que lleva a `/brigadas?bloqueo=<id>` con el punto, `tipo = bloqueo` y `bloqueo_id` ya puestos.
- [ ] Mapa en vivo: **no** cambia para ciudadanos. Para brigadistas y coordinadores hay una capa opcional "Incidentes" en `PanelCapas`.
- [ ] `CLAUDE.md`:
  - modelo de datos (brigadas con `base` en lugar de `ubicacion_actual`, incidentes, asignaciones y `perfiles.brigada_id`);
  - las decisiones de este plan;
  - roadmap: 6 ✅.
- [ ] `README.md`: cómo aplicar la migración 5 y la verificación, y cómo crear brigadas y meter brigadistas.
- [ ] `npm test`, `npm run lint` y `npm run build`.
- [ ] **Verificación en el navegador**, en ancho de celular y con el Supabase real:
  - en una pestaña el coordinador crea un incidente y una brigada, asigna un miembro y asigna la brigada sugerida;
  - en otra pestaña el brigadista ve la asignación sin recargar y avanza hasta Terminé;
  - el panel del coordinador se actualiza solo;
  - la consola no muestra errores.
- [ ] Commit: `feat: panel de brigadas en la navegación y documentación`
