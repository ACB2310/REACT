# Etapa 3: Supabase, refugios y reporte de bloqueos – Plan de implementación

> **Para agentes:** SUB-SKILL REQUERIDA: usa superpowers:subagent-driven-development (recomendado) o superpowers:executing-plans para implementar este plan tarea por tarea. Los pasos usan casillas (`- [ ]`) para seguimiento.

**Objetivo:**
- Conectar la app con **Supabase** (PostgreSQL + PostGIS, autenticación y tiempo real).
- Tener las tablas de **refugios** y **bloqueos** con RLS por rol.
- Que **cualquier persona**, con o sin cuenta, pueda **reportar un bloqueo tocando el mapa**.
- Que el **coordinador** ubique en el mapa los refugios de la lista oficial.
- Mostrar refugios y bloqueos en el mapa en vivo.

**Arquitectura:**
- Se repite el patrón de las etapas 1 y 2: `services/` habla con Supabase, `utils/` tiene funciones puras, `hooks/` maneja el estado y `components/` dibuja.
- Las **escrituras** pasan por funciones SQL (RPC) para validar en el servidor: tipo, coordenadas dentro de México, permisos y límite de reportes. Las **lecturas** pasan por vistas que ya entregan `longitud` y `latitud`, para no decodificar PostGIS en el navegador.
- Los reportes sin cuenta usan el **inicio de sesión anónimo** de Supabase. Así todo reporte tiene un `auth.uid()`: se puede limitar el spam y permitir que quien reportó renueve o elimine su propio bloqueo.
- La app **sigue funcionando sin Supabase**: si faltan las variables de entorno o Supabase no responde, el mapa de sismos y ciclones se ve igual y solo se avisa que refugios y bloqueos no están disponibles.

**Stack:** lo actual, más dos librerías que ya están en el stack de `CLAUDE.md`:
- `@supabase/supabase-js`: cliente oficial para base de datos, autenticación y tiempo real.
- `react-router`: ya hay más de una pantalla (mapa, reportar, entrar y refugios).

Antes de usar cualquiera de las dos, revisa su documentación actual con context7.

**Spec:** `CLAUDE.md` (Modelo de datos, Seguridad y llaves, Interfaz, Roadmap punto 3), más las decisiones del usuario del 2026-10-16:
1. **Cualquiera puede reportar**, tenga cuenta o no.
2. Un bloqueo es **un punto**: **parcial** (`solo_vehiculos`: no pasan vehículos, sí se pasa a pie) o **total** (no pasa nadie).
3. Los refugios vienen de una **lista oficial**, y el **coordinador selecciona en el mapa** dónde está cada uno.
4. Un bloqueo **dura 24 horas** y se puede **renovar** (24 h más a partir de ese momento) o **eliminar**.

## Pendiente del usuario antes de empezar

- [ ] Crear el proyecto en Supabase y poner `VITE_SUPABASE_URL` y `VITE_SUPABASE_PUBLISHABLE_KEY` (la Publishable key, `sb_publishable_…`) en `.env.local`. ✅ 2026-10-16
- [ ] En Authentication → Sign In / Providers: activar **Anonymous sign-ins** y **Email**. Se recomienda activar también CAPTCHA (Cloudflare Turnstile); se deja para después, ver "Riesgos aceptados".
- [x] Migraciones: archivos en `supabase/migrations/` que el usuario pega en el **SQL Editor** (decidido el 2026-10-16; no hay CLI instalada).
- [ ] Entregar el **archivo de la lista oficial de refugios** (CSV o Excel) y decir de qué dependencia y de qué fecha es. Ese dato va en la columna `fuente`.
- [ ] Crear al menos una cuenta para cada rol de prueba. El rol se asigna a mano con SQL (tarea 4).

## Restricciones globales

- Todo el texto de la interfaz, los comentarios y los commits van en **español**. Los commits terminan con `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- GeoJSON siempre en **`[longitud, latitud]`**. En SQL: `st_makepoint(longitud, latitud)`, en ese orden.
- Los componentes no llaman a Supabase directamente: todo pasa por `src/services/` o `src/hooks/`.
- En el frontend **solo** van `VITE_SUPABASE_URL` y `VITE_SUPABASE_PUBLISHABLE_KEY`. La Secret key (`sb_secret_…`, antes `service_role`) nunca aparece en el repo.
- **Toda tabla nueva tiene RLS activado** desde la misma migración que la crea.
- Las funciones `security definer` llevan `set search_path = ''` y usan nombres completos (`public.bloqueos`, `extensions.st_makepoint`).
- Al terminar cada tarea: `npm test`, `npm run lint` y `npm run build`. Los tres deben pasar.
- Las tareas de SQL (2 a 4) y las de sesión (7) **sí** llevan revisión por subagente al terminar, porque tocan seguridad. Al final hay una revisión independiente de toda la rama.
- Se trabaja en la rama `feat/etapa3-supabase-bloqueos`.
- Los datos de ejemplo solo viven en `src/mocks/`, con la marca `// DATOS DE EJEMPLO SOLO PARA PRUEBAS`. **Nunca** se cargan refugios de ejemplo en la base de datos real.
- Constantes:
  - `BBOX_MEXICO = [-118.6, 14.3, -86.5, 32.8]` (`[oeste, sur, este, norte]`); se usa igual en SQL y en `utils/geo.js`.
  - `DURACION_BLOQUEO = 24 h`.
  - `LIMITE_REPORTES = 5 por hora por usuario`.
  - `INTERVALO_REFUGIOS = 10 min`.
  - Bloqueos: tiempo real, más una recarga de respaldo cada **2 min**.

## Puntos de revisión

1. **Un bloqueo vencido nunca se muestra como vigente.** La vista lo filtra en el servidor, y el hook lo vuelve a filtrar cada minuto en el navegador por si el celular no recargó. Pruebas en las tareas 3 y 8.
2. **Un usuario anónimo no puede eliminar ni renovar bloqueos ajenos.** Solo puede quien reportó, un brigadista o un coordinador. Verificación SQL en la tarea 4 y prueba de interfaz en la tarea 10.
3. **Un ciudadano no puede cambiarse el rol** ni editar refugios. Verificación en la tarea 4.
4. **Sin Supabase configurado, el mapa sigue funcionando** y lo dice claramente. Prueba en la tarea 15.
5. **Sin conexión no se finge un envío.** El botón dice que no hay conexión y el reporte no se pierde de la pantalla. La cola offline es de la etapa 7. Prueba en la tarea 12.
6. **Las coordenadas no se invierten** al leer la vista ni al llamar a las RPC. Pruebas en las tareas 6 y 12.
7. **Los errores de Supabase llegan en español** y sin detalles técnicos: límite de reportes, fuera de México, sin permiso, no existe. Prueba en la tarea 6.

## Riesgos aceptados (se avisan, no se resuelven en esta etapa)

- **Spam anónimo:** el límite es por sesión. Alguien que borre los datos del navegador obtiene una sesión nueva. La solución es el CAPTCHA de Supabase, que queda pendiente de que el usuario lo active, y la confirmación por coordinador en la etapa 6.
- **`reportado_por` es visible** en el evento de tiempo real. Es un UUID aleatorio, sin nombre ni correo. Las vistas no lo exponen: entregan `es_mio`.
- La **confirmación** (`confirmado`) existe en la tabla, pero el botón para confirmar es de la etapa 6. Mientras tanto, la interfaz muestra "Sin confirmar".
- Para la **etapa 4**: OpenRouteService evita *polígonos*, así que cada punto se convertirá en un círculo pequeño (por ejemplo, de 30 m) con Turf. No se hace aquí, pero por eso el bloqueo guarda un punto exacto.

---

### Tarea 0: Preparación

**Archivos:**
- Crear: `.env.example`
- Modificar: `package.json` y `package-lock.json` (con `npm install`)

- [ ] `npm install`, después `npm install @supabase/supabase-js react-router`.
- [ ] `.env.example` con `VITE_SUPABASE_URL=` y `VITE_SUPABASE_PUBLISHABLE_KEY=`, sin valores, y un comentario que diga que la `service_role` nunca va aquí.
- [ ] Confirma que `.env.local` está ignorado (`*.local` en `.gitignore`): `git check-ignore .env.local`.
- [ ] Commit: `chore: dependencias de Supabase y React Router, y .env.example`

### Tarea 1: Migración de perfiles y roles

**Archivos:**
- Crear: `supabase/migrations/20261016000001_perfiles.sql`

**Contenido:**
- `create extension if not exists postgis with schema extensions;`
- Tabla `public.perfiles`:
  - `id uuid primary key references auth.users(id) on delete cascade`
  - `nombre text`
  - `rol text not null default 'ciudadano' check (rol in ('ciudadano','brigadista','coordinador'))`
  - `creado_en timestamptz not null default now()`
- Función `public.rol_actual() returns text`, `stable security definer set search_path = ''`. Devuelve el rol del usuario actual, o `'ciudadano'` si no tiene perfil (anónimos o sin sesión).
- Disparador `after insert on auth.users`: crea el perfil **solo si `not new.is_anonymous`**. Los anónimos no tienen perfil.
- RLS en `perfiles`:
  - `select`: `id = auth.uid() or public.rol_actual() = 'coordinador'`.
  - **No** hay políticas de `insert`, `update` ni `delete` para clientes. El rol se cambia solo desde el SQL Editor (tarea 4) o, en la etapa 6, con una RPC para coordinadores.
- `grant execute on function public.rol_actual() to anon, authenticated;`

- [ ] Escribe la migración con un comentario en español en cada bloque.
- [ ] Aplícala (CLI o SQL Editor) y confirma en el panel que `perfiles` tiene RLS activado.
- [ ] Commit: `feat: tabla de perfiles con rol y función rol_actual`

### Tarea 2: Migración de refugios

**Archivos:**
- Crear: `supabase/migrations/20261016000002_refugios.sql`, `supabase/plantillas/refugios.csv`

**Contenido:**
- Tabla `public.refugios`:
  - `id bigint generated always as identity primary key`
  - `clave_oficial text unique`: el identificador de la lista oficial, si lo trae
  - `nombre text not null`, `direccion text`, `municipio text`, `entidad text`
  - `ubicacion extensions.geography(Point, 4326)`: **puede ser nula**, porque la pone el coordinador
  - `capacidad integer check (capacidad >= 0)`
  - `ocupacion integer not null default 0 check (ocupacion >= 0)`
  - `estado text not null default 'abierto' check (estado in ('abierto','lleno','cerrado'))`
  - `fuente text not null`: por ejemplo, `'Protección Civil de Jalisco, lista 2026'`
  - `actualizado_en timestamptz not null default now()`
- `create index refugios_ubicacion_idx on public.refugios using gist (ubicacion);`
- RLS:
  - `select`, para `anon` y `authenticated`: `true`.
  - `insert`, `update` y `delete`, para `authenticated`: `public.rol_actual() = 'coordinador'`, tanto en `using` como en `with check`.
- Vista `public.refugios_vista` `with (security_invoker = true)`: todas las columnas, más `extensions.st_x(ubicacion::extensions.geometry) as longitud` y `st_y(...) as latitud`, que son nulas si no hay ubicación.
- RPC `public.actualizar_refugio(p_id bigint, p_longitud float8, p_latitud float8, p_estado text, p_ocupacion integer)`, `security invoker`:
  - Valida que el punto esté dentro de `BBOX_MEXICO`; si no, `raise exception 'FUERA_DE_MEXICO'`.
  - Hace el `update` y pone `actualizado_en = now()`.
  - Si se actualizaron 0 filas (RLS lo bloqueó o el id no existe), `raise exception 'SIN_PERMISO'`.
- `refugios.csv`: solo los encabezados `clave_oficial,nombre,direccion,municipio,entidad,capacidad,fuente`. Sirve para importar la lista oficial desde el Table Editor (Import data from CSV).

- [ ] Escribe la migración y aplícala.
- [ ] **Con el archivo del usuario:** conviértelo al formato de la plantilla e impórtalo. Si la lista oficial ya trae coordenadas, cárgalas con un `update` de SQL documentado en `supabase/plantillas/LEEME.md`, y dile al usuario cuántos refugios quedaron con y sin ubicación. **No** inventes coordenadas ni geocodifiques sin preguntar.
- [ ] Commit: `feat: tabla de refugios con RLS y RPC actualizar_refugio`

### Tarea 3: Migración de bloqueos

**Archivos:**
- Crear: `supabase/migrations/20261016000003_bloqueos.sql`

**Contenido:**
- Tabla `public.bloqueos`:
  - `id bigint generated always as identity primary key`
  - `geometria extensions.geography(Point, 4326) not null`
  - `tipo text not null check (tipo in ('solo_vehiculos','total'))`
  - `descripcion text check (char_length(descripcion) <= 280)`
  - `reportado_por uuid references auth.users(id) on delete set null`
  - `es_anonimo boolean not null default true`
  - `confirmado boolean not null default false`
  - `expira_en timestamptz not null`
  - `renovado_en timestamptz`
  - `creado_en timestamptz not null default now()`
- `create index bloqueos_geometria_idx ... using gist (geometria);` y `create index bloqueos_expira_en_idx on public.bloqueos (expira_en);`
- Disparador `before insert`, con función `security definer set search_path = ''`. **Ignora** lo que mande el cliente en estas columnas:
  - `reportado_por = auth.uid()`; si es nulo, `raise exception 'SIN_SESION'`
  - `es_anonimo = coalesce((auth.jwt() ->> 'is_anonymous')::boolean, true)`
  - `confirmado = false`, `creado_en = now()`, `expira_en = now() + interval '24 hours'`, `renovado_en = null`
  - si el punto está fuera de `BBOX_MEXICO`: `raise exception 'FUERA_DE_MEXICO'`
  - si ese `reportado_por` ya tiene 5 o más bloqueos con `creado_en > now() - interval '1 hour'`: `raise exception 'LIMITE_REPORTES'`
- RLS:
  - `select`, para `anon` y `authenticated`: `expira_en > now()`.
  - `insert`, para `authenticated`: `with check (reportado_por = auth.uid())`. Los anónimos de Supabase entran con el rol `authenticated`.
  - **No** hay políticas de `update` ni `delete`: se hace todo por RPC.
- Vista `public.bloqueos_vista` `with (security_invoker = true)`:
  - `id`, `tipo`, `descripcion`, `es_anonimo`, `confirmado`, `expira_en`, `renovado_en` y `creado_en`
  - `longitud` y `latitud`
  - `(reportado_por = auth.uid()) as es_mio`
  - **no** expone `reportado_por`
- RPC (todas `security definer set search_path = ''`, con `grant execute ... to authenticated`):
  - `reportar_bloqueo(p_longitud float8, p_latitud float8, p_tipo text, p_descripcion text) returns bigint`: hace el `insert` y el disparador valida.
  - `renovar_bloqueo(p_id bigint) returns timestamptz`:
    - si no existe o ya venció, `'NO_EXISTE'`
    - si `reportado_por <> auth.uid()` y `public.rol_actual()` no es `brigadista` ni `coordinador`, `'SIN_PERMISO'`
    - pone `expira_en = now() + 24 h` y `renovado_en = now()`, y devuelve el nuevo `expira_en`
  - `eliminar_bloqueo(p_id bigint) returns void`: los mismos permisos que renovar, después `delete`.
- Tiempo real: `alter publication supabase_realtime add table public.bloqueos;`

- [ ] Escribe la migración y aplícala.
- [ ] Commit: `feat: tabla de bloqueos con vencimiento de 24 h, RLS y RPC`

### Tarea 4: Verificación de seguridad en SQL

**Archivos:**
- Crear: `supabase/pruebas/verificar_rls.sql`, `supabase/pruebas/LEEME.md`

Es un script que se pega en el SQL Editor. Corre todo dentro de `begin; … rollback;` para no dejar basura. Simula cada usuario con `set local role authenticated;` y `select set_config('request.jwt.claims', '{"sub":"<uuid>","role":"authenticated","is_anonymous":true}', true);`. Cada caso imprime `OK` o lanza un error que diga qué falló.

Casos:
- [ ] Un anónimo reporta un bloqueo: `OK`. Aparece en `bloqueos_vista` con `es_mio = true` y `es_anonimo = true`.
- [ ] Un anónimo manda `expira_en` de un año o `confirmado = true` haciendo `insert` directo: el disparador los sobrescribe.
- [ ] Un sexto reporte en una hora da `LIMITE_REPORTES`.
- [ ] Un punto en `[-3.7, 40.4]` (Madrid) da `FUERA_DE_MEXICO`. Con `[40.4, -3.7]` invertido, también.
- [ ] El anónimo B intenta renovar o eliminar el bloqueo de A: `SIN_PERMISO`. Un brigadista sí puede.
- [ ] Un bloqueo con `expira_en` en el pasado no aparece para `anon` ni para `authenticated`.
- [ ] Un ciudadano hace `update perfiles set rol = 'coordinador'`: 0 filas cambian.
- [ ] Un ciudadano llama `actualizar_refugio`: `SIN_PERMISO`. Un coordinador sí puede.
- [ ] `anon` (sin sesión) llama `reportar_bloqueo`: se le niega. El frontend siempre crea una sesión anónima antes.
- [ ] `LEEME.md` explica cómo correr el script y cómo asignar un rol: `update public.perfiles set rol = 'coordinador' where id = (select id from auth.users where email = '…');`
- [ ] Revisión por subagente de las tareas 1 a 4 (seguridad).
- [ ] Commit: `test: verificación de RLS y permisos en SQL`

### Tarea 5: Cliente de Supabase

**Archivos:**
- Crear: `src/services/supabase.js`, `src/services/supabase.test.js`, `src/test/supabaseFalso.js`

**Interfaces:**
- `supabaseConfigurado: boolean`: es `true` si existen las dos variables `VITE_SUPABASE_*`.
- `supabase`: el cliente de `createClient(url, publishableKey, { global: { fetch: fetchConTiempoLimite } })`, o `null` si no está configurado.
  - `fetchConTiempoLimite` combina la señal de quien llama con `AbortSignal.timeout(TIEMPO_LIMITE_MS)`. `TIEMPO_LIMITE_MS` se importa de `http.js`.
- `obtenerCliente() => cliente`: lanza `'Supabase no está configurado'` si es `null`.
- `supabaseFalso.js` (solo para pruebas) es un cliente falso donde se pueden programar:
  - las respuestas de `from(vista).select().gt()`, `rpc(nombre, args)` y `auth.*`;
  - los eventos de `channel().on('postgres_changes', …).subscribe()`, con un método para dispararlos.

- [ ] Pruebas: `'sin variables queda como no configurado'` y `'obtenerCliente lanza el mensaje en español'`. Simula `import.meta.env` con `vi.stubEnv`.
- [ ] Commit: `feat: cliente de Supabase con tiempo límite`

### Tarea 6: Servicios de refugios y bloqueos

**Archivos:**
- Crear:
  - `src/services/refugios.js`, `src/services/refugios.test.js`
  - `src/services/bloqueos.js`, `src/services/bloqueos.test.js`
  - `src/services/erroresSupabase.js`, `src/services/erroresSupabase.test.js`
  - `src/mocks/refugiosEjemplo.js`, `src/mocks/bloqueosEjemplo.js`

**Interfaces:**
- `traducirErrorSupabase(error) => Error`. Busca el código dentro de `error.message`:
  - `LIMITE_REPORTES`: `'Ya enviaste 5 reportes en la última hora. Espera un poco antes de enviar otro.'`
  - `FUERA_DE_MEXICO`: `'El punto está fuera de México. Revisa la ubicación.'`
  - `SIN_PERMISO`: `'No tienes permiso para hacer esto.'`
  - `NO_EXISTE`: `'El bloqueo ya no existe o ya venció.'`
  - `SIN_SESION`: `'No se pudo iniciar una sesión para enviar el reporte.'`
  - un `TypeError` o un fallo de red: `'No se pudo conectar con Supabase'`
  - cualquier otro: `'Supabase respondió con un error'`; el detalle va a `cause` y **nunca** se muestra en pantalla.
- `obtenerRefugios({ signal }) => { datos: FeatureCollection, sinUbicacion: Refugio[], actualizadoEn }`:
  - lee `refugios_vista` con `.abortSignal(signal)`;
  - los refugios con coordenadas van como `Feature<Point>` en `[longitud, latitud]`, y los demás van en `sinUbicacion`;
  - `actualizadoEn` es el `actualizado_en` más reciente, en ms.
- `actualizarRefugio({ id, posicion: [longitud, latitud], estado, ocupacion })`: llama a `rpc('actualizar_refugio', { p_id, p_longitud, p_latitud, p_estado, p_ocupacion })`.
- `obtenerBloqueos({ signal }) => { datos: FeatureCollection, actualizadoEn }`:
  - lee `bloqueos_vista`;
  - las propiedades son planas: `id`, `tipo`, `descripcion`, `esAnonimo`, `confirmado`, `esMio`, `expiraEn` (ms) y `creadoEn` (ms);
  - `actualizadoEn` es el `creado_en` o `renovado_en` más reciente, o `null` si no hay bloqueos.
- `reportarBloqueo({ posicion: [longitud, latitud], tipo, descripcion }) => id`
- `renovarBloqueo(id) => expiraEn (ms)` y `eliminarBloqueo(id)`
- `suscribirseABloqueos(alCambiar) => cancelar()`: usa `channel('bloqueos').on('postgres_changes', { event: '*', schema: 'public', table: 'bloqueos' }, alCambiar)`.

- [ ] Pruebas, con `supabaseFalso`:
  - `'convierte la fila en Feature con [longitud, latitud]'`: la fila `{ longitud: -103.35, latitud: 20.67 }` queda como `coordinates: [-103.35, 20.67]`.
  - `'los refugios sin ubicación no van al mapa'`
  - `'reportarBloqueo manda p_longitud y p_latitud en ese orden'`
  - un caso por cada mensaje de `traducirErrorSupabase`
  - `'sin Supabase configurado lanza el mensaje en español'`
- [ ] Commit: `feat: servicios de refugios y bloqueos sobre Supabase`

### Tarea 7: Sesión (anónima y con cuenta)

**Archivos:**
- Crear: `src/hooks/useSesion.js`, `src/hooks/useSesion.test.jsx`, `src/components/ProveedorSesion.jsx`

**Interfaces:**
- `<ProveedorSesion>` envuelve la app. Escucha `auth.onAuthStateChange`. Cuando cambia la sesión, pide el rol con `rpc('rol_actual')`.
- `useSesion() => { usuario, rol, esAnonimo, cargando, entrar(correo, contrasena), crearCuenta(correo, contrasena), salir(), asegurarSesion() }`:
  - `asegurarSesion()`: si no hay sesión, llama a `signInAnonymously()`. Se usa **solo** al enviar un reporte; abrir el mapa no crea sesiones.
  - Los errores de autenticación también se traducen. Por ejemplo, `Invalid login credentials` se convierte en `'Correo o contraseña incorrectos'`.
  - Sin Supabase configurado: `rol = 'ciudadano'`, y `entrar` y `asegurarSesion` lanzan `'Supabase no está configurado'`.
- `puedeGestionarBloqueo(bloqueo, rol)` va en `utils/bloqueos.js` (tarea 9): es `true` si `bloqueo.esMio` o si `rol` es brigadista o coordinador.

- [ ] Pruebas: `'asegurarSesion crea sesión anónima solo si no hay'`, `'el rol llega de rol_actual'`, `'salir vuelve a ciudadano'` y `'traduce credenciales incorrectas'`.
- [ ] Revisión por subagente (seguridad de la sesión).
- [ ] Commit: `feat: sesión anónima o con cuenta y rol del usuario`

### Tarea 8: Hooks `useRefugios` y `useBloqueos`

**Archivos:**
- Crear: `src/hooks/useRefugios.js`, `src/hooks/useBloqueos.js` y sus pruebas

**Interfaces:**
- `useRefugios()`: es `useDatosPeriodicos(obtenerRefugios, 10 min)`. Devuelve lo mismo, más `sinUbicacion`.
- `useBloqueos()`:
  - es `useDatosPeriodicos(obtenerBloqueos, 2 min)`;
  - se suscribe con `suscribirseABloqueos(recargar)` y cancela la suscripción al desmontar;
  - cada 60 s vuelve a filtrar `expiraEn > Date.now()` sin pedir nada;
  - expone `vigentes` (la colección ya filtrada).
- Los dos marcan `estado: 'error'` con `'Supabase no está configurado'` si falta la configuración, y **no** reintentan cada intervalo en ese caso.

- [ ] Pruebas:
  - `'un evento de tiempo real recarga los bloqueos'`
  - `'un bloqueo que vence desaparece sin recargar'`, con temporizadores falsos
  - `'cancela la suscripción al desmontar'`
  - `'sin configuración no programa recargas'`
- [ ] Commit: `feat: hooks de refugios y bloqueos con tiempo real`

### Tarea 9: Utilidades de bloqueos y refugios

**Archivos:**
- Crear: `src/utils/bloqueos.js`, `src/utils/refugios.js` y sus pruebas
- Modificar: `src/utils/geo.js` (agregar `BBOX_MEXICO`)

**Interfaces:**
- `TIPOS_BLOQUEO`:
  - `solo_vehiculos`: `{ etiqueta: 'Parcial', detalle: 'No pasan vehículos. Se puede pasar a pie.', color: '#f97316' }`
  - `total`: `{ etiqueta: 'Total', detalle: 'No pasa nadie, ni a pie.', color: '#dc2626' }`
- `textoVencimiento(expiraEn, ahora)`: devuelve `'Vence en 3 h'`, `'Vence en 25 min'` o `'Vencido'`.
- `puedeGestionarBloqueo(bloqueo, rol)`
- `ESTADOS_REFUGIO`: abierto en verde `#16a34a`, lleno en ámbar `#d97706` y cerrado en gris `#6b7280`, cada uno con su etiqueta.
- `textoOcupacion({ ocupacion, capacidad })`: devuelve `'45 de 120 lugares'`, o `'Capacidad desconocida'` si no hay capacidad.

- [ ] Pruebas de cada función, incluidos los límites (exactamente 0 min y valores nulos).
- [ ] Commit: `feat: utilidades para bloqueos y refugios`

### Tarea 10: Capas del mapa

**Archivos:**
- Crear:
  - `src/components/CapaRefugios.jsx`, `src/components/CapaBloqueos.jsx` y sus pruebas
  - `src/components/LeyendaRefugios.jsx`, `src/components/LeyendaBloqueos.jsx`
- Modificar: `src/components/PanelCapas.jsx` (agregar `Refugios` y `Bloqueos`, prendidas por defecto)

**Interfaces:**
- `CapaRefugios({ mapa, refugios, visible })`:
  - usa `useCapasMapa` con círculos de color según `estado`, más su capa de toque;
  - el popup muestra nombre, dirección, `textoOcupacion`, estado, `Fuente: …` y `Actualizado: …`.
- `CapaBloqueos({ mapa, bloqueos, visible, rol, alRenovar(id), alEliminar(id) })`:
  - círculos con borde blanco: rojo para total y naranja para parcial, más su capa de toque;
  - queda **arriba** de sismos y refugios;
  - el popup muestra la etiqueta, el detalle, la descripción (con `textContent`), `Reporte anónimo` o `Reporte de usuario`, `Sin confirmar` o `Confirmado` y `textoVencimiento`;
  - si `puedeGestionarBloqueo`, agrega los botones **Renovar 24 h** y **Eliminar**, de 48 px de alto. Eliminar pide confirmación con `window.confirm('¿Eliminar este bloqueo?')`.

- [ ] Pruebas, con `mapaFalso`:
  - `'agrega fuentes y capas, y los bloqueos quedan arriba'`
  - `'el popup no muestra botones a quien no reportó'`
  - `'muestra Renovar y Eliminar en un bloqueo propio'`
  - `'un brigadista ve los botones en bloqueos ajenos'`
  - `'la descripción no se interpreta como HTML'`
- [ ] Commit: `feat: capas de refugios y bloqueos en el mapa`

### Tarea 11: Navegación entre pantallas

**Archivos:**
- Crear: `src/components/BarraNavegacion.jsx`, `src/components/BarraNavegacion.css`
- Modificar: `src/App.jsx`, `src/main.jsx` y las pruebas de `Mapa` que lo necesiten

**Interfaces:**
- `main.jsx`: `<BrowserRouter><ProveedorSesion><App /></ProveedorSesion></BrowserRouter>`.
- `App.jsx`: `Routes` con:
  - `/`: `Mapa`
  - `/reportar`: `ReportarBloqueo`
  - `/entrar`: `IniciarSesion`
  - `/refugios`: `AdministrarRefugios`, solo para coordinador; los demás ven un texto que lo dice y un enlace al mapa
  - `*`: vuelve a `/`
- `BarraNavegacion`: barra fija abajo, móvil primero, con botones de 56 px: **Mapa**, **Reportar**, **Entrar** o **Mi cuenta**, y **Refugios** solo para coordinador.

- [ ] Pruebas: `'muestra Refugios solo al coordinador'` y `'una ruta desconocida lleva al mapa'`, con `MemoryRouter`.
- [ ] Commit: `feat: navegación entre mapa, reportar, entrar y refugios`

### Tarea 12: Pantalla Reportar bloqueo

**Archivos:**
- Crear:
  - `src/pages/ReportarBloqueo.jsx`, `src/pages/ReportarBloqueo.css`, `src/pages/ReportarBloqueo.test.jsx`
  - `src/components/SelectorPunto.jsx` y su prueba
  - `src/hooks/useUbicacion.js` y su prueba

**Interfaces:**
- `useUbicacion() => { posicion: [longitud, latitud] | null, estado, error, pedir() }`:
  - usa `navigator.geolocation.getCurrentPosition` solo cuando se llama `pedir()`;
  - los errores se dan en español: permiso negado, no disponible, tardó demasiado.
- `SelectorPunto({ mapa, posicion, alCambiar([longitud, latitud]) })`:
  - con un clic en el mapa se coloca un `Marker` de MapLibre, que se puede arrastrar;
  - si `posicion` cambia desde afuera (por ejemplo, por el GPS), el marcador se mueve y el mapa centra con zoom 16.
- La página:
  1. Muestra el texto `Toca el mapa donde está el bloqueo` y el botón **Usar mi ubicación**.
  2. Muestra dos opciones grandes de tipo, **Parcial** y **Total**, con el `detalle` de cada una. **No** hay ninguna elegida por defecto.
  3. Tiene una descripción opcional con un contador de 280 caracteres.
  4. **Enviar reporte** solo se activa con punto y tipo. Al enviar:
     - llama a `asegurarSesion()` y luego a `reportarBloqueo`;
     - si sale bien, muestra `Reporte enviado. Vence en 24 h.` y un botón **Ver en el mapa**.
  5. Con error, muestra el mensaje traducido y conserva el punto, el tipo y la descripción.
  6. Sin conexión: el botón dice `Sin conexión: no se puede enviar` y está deshabilitado. El formulario no se borra.
  7. Muestra el aviso oficial de siempre y el texto `Cualquier persona puede reportar. Los reportes sin cuenta aparecen como "anónimo".`
  8. Si `punto` está fuera de `BBOX_MEXICO`, avisa antes de enviar.

- [ ] Pruebas:
  - `'no deja enviar sin punto o sin tipo'`
  - `'envía [longitud, latitud] del punto tocado'`
  - `'crea sesión anónima antes de enviar si no hay sesión'`
  - `'sin conexión no envía y conserva el formulario'`
  - `'muestra el mensaje de límite de reportes'`
  - `'Usar mi ubicación mueve el punto'`
- [ ] Commit: `feat: pantalla para reportar bloqueos tocando el mapa`

### Tarea 13: Pantalla Iniciar sesión

**Archivos:**
- Crear: `src/pages/IniciarSesion.jsx`, `src/pages/IniciarSesion.css` y su prueba

- [ ] Formulario de correo y contraseña con **Entrar** y **Crear cuenta**, usando `type="email"`, `autocomplete` y etiquetas visibles. Si Supabase pide confirmar el correo, se dice: `Te enviamos un correo para confirmar tu cuenta.`
- [ ] Con sesión, muestra el correo, el rol en español y el botón **Salir**. Si la sesión es anónima, dice: `Estás usando la app sin cuenta.`
- [ ] Muestra el texto `No necesitas cuenta para reportar bloqueos.`
- [ ] Pruebas: `'entrar con credenciales incorrectas muestra el error en español'` y `'muestra el rol del usuario'`.
- [ ] Commit: `feat: pantalla para entrar o crear cuenta`

### Tarea 14: Pantalla Administrar refugios (coordinador)

**Archivos:**
- Crear: `src/pages/AdministrarRefugios.jsx`, `src/pages/AdministrarRefugios.css` y su prueba

- [ ] Muestra la lista de refugios con un buscador por nombre o municipio y un filtro **Sin ubicación** que viene activado por defecto, con un contador: `12 refugios sin ubicación`.
- [ ] Al elegir un refugio, se muestra el mapa con `SelectorPunto`, centrado en el municipio si ya tiene ubicación. También hay campos de **estado** y **ocupación**, más el botón **Guardar** que llama a `actualizarRefugio`.
- [ ] Al guardar, se recargan los refugios y se muestra `Refugio guardado`.
- [ ] Pruebas: `'un coordinador ubica un refugio y se manda [longitud, latitud]'`, `'el filtro muestra solo los que no tienen ubicación'` y `'SIN_PERMISO se muestra en español'`.
- [ ] Commit: `feat: pantalla para que el coordinador ubique refugios`

### Tarea 15: Integrar en el mapa en vivo, documentar y verificar

**Archivos:**
- Modificar:
  - `src/pages/Mapa.jsx`, `src/pages/Mapa.css`, `src/pages/Mapa.test.jsx`, `src/pages/Mapa.integracion.test.jsx`
  - `CLAUDE.md`, `README.md`

- [ ] Agrega a `Mapa`:
  - `useRefugios` y `useBloqueos`, con un `MensajeFuente` para cada uno (`los refugios`, `los bloqueos`);
  - `CapaRefugios` y `CapaBloqueos`, con `rol` desde `useSesion` y `alRenovar` y `alEliminar` desde los servicios;
  - las leyendas nuevas;
  - un botón flotante **Reportar bloqueo** que lleva a `/reportar`.
- [ ] Pie: `Refugios: <fuente oficial> · hora` y `Bloqueos: reportes ciudadanos · hora`.
- [ ] Sin Supabase configurado, aparece un solo aviso: `Refugios y bloqueos no disponibles: falta configurar Supabase.` Sismos y ciclones siguen funcionando.
- [ ] Pruebas:
  - `'sin Supabase el mapa sigue mostrando sismos'`
  - `'renovar desde el popup recarga los bloqueos'`
  - en integración: `'los bloqueos quedan arriba de sismos y refugios'`
- [ ] `CLAUDE.md`:
  - Modelo de datos: `bloqueos.geometria geography(Point)`, `es_anonimo`, `renovado_en`; `refugios.clave_oficial`, `direccion`, `municipio`, `entidad`, `fuente`, con `ubicacion` que puede ser nula; y la tabla `perfiles`.
  - Una nota con las decisiones del 2026-10-16: reportes anónimos, punto, lista oficial ubicada por el coordinador y 24 h renovables.
  - Roadmap: marcar la etapa 3.
- [ ] `README.md`: cómo configurar `.env.local`, aplicar las migraciones y asignar un rol.
- [ ] `npm test`, `npm run lint` y `npm run build`: todo PASA.
- [ ] **Verificación en el navegador**, con `npm run dev` en ancho de celular y con el proyecto real de Supabase:
  - reportar un bloqueo sin cuenta y verlo en el mapa;
  - abrir otra pestaña y comprobar que aparece solo, por tiempo real;
  - renovarlo y eliminarlo;
  - entrar como coordinador y ubicar un refugio;
  - modo avión: el formulario no se pierde;
  - la consola no muestra errores.
- [ ] Revisión independiente de toda la rama.
- [ ] Commit: `feat: refugios y bloqueos en el mapa en vivo`
